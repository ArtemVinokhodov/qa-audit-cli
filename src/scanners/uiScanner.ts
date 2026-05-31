import { chromium, type Browser, type Page } from "playwright";
import type { AuditConfig, UiBreakpointConfig, UiPageConfig } from "../types/config.js";
import type { ReportItem, ReportSeverity, ReportStatus, Scanner } from "../types/report.js";
import { probeUrl } from "../utils/http.js";

const DEFAULT_BREAKPOINT: UiBreakpointConfig = {
  name: "default",
  width: 1280,
  height: 720,
};

function item(
  checkName: string,
  status: ReportStatus,
  severity: ReportSeverity,
  finding: string,
  recommendation: string,
  evidence?: string[],
): ReportItem {
  return {
    scanner: "ui",
    category: "ui",
    checkName,
    status,
    severity,
    finding,
    recommendation,
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
  };
}

function buildUrl(baseUrl: string, pagePath: string): string | undefined {
  try {
    return new URL(pagePath, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function pageLabel(pageConfig: UiPageConfig, index: number): string {
  return pageConfig.name?.trim() || `Page ${index + 1}`;
}

function breakpointLabel(breakpoint: UiBreakpointConfig, index: number): string {
  return breakpoint.name?.trim() || `Breakpoint ${index + 1}`;
}

interface ImageIssue {
  src: string;
}

interface AccessibilityBaseline {
  missingDocumentTitle: boolean;
  missingDocumentLanguage: boolean;
  missingMainHeading: boolean;
  unlabeledFormControls: string[];
  unnamedButtons: string[];
}

async function checkImages(page: Page): Promise<{ broken: ImageIssue[]; missingAlt: ImageIssue[] }> {
  return page.locator("img").evaluateAll((images) => {
    const broken: ImageIssue[] = [];
    const missingAlt: ImageIssue[] = [];

    for (const image of images) {
      const src = image.getAttribute("src") ?? "(missing src)";
      const htmlImage = image as HTMLImageElement;
      if (!htmlImage.complete || htmlImage.naturalWidth === 0) {
        broken.push({ src });
      }
      if (!image.hasAttribute("alt")) {
        missingAlt.push({ src });
      }
    }

    return { broken, missingAlt };
  });
}

async function checkAccessibilityBaseline(page: Page): Promise<AccessibilityBaseline> {
  return page.evaluate(() => {
    const controlDescription = (control: Element): string =>
      control.getAttribute("name") || control.getAttribute("id") || control.tagName.toLowerCase();
    const hasAssociatedLabel = (control: Element): boolean => {
      const id = control.getAttribute("id");
      return Boolean(
        control.getAttribute("aria-label") ||
          control.getAttribute("aria-labelledby") ||
          control.closest("label") ||
          (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)),
      );
    };
    const hasAccessibleName = (button: Element): boolean =>
      Boolean(
        button.getAttribute("aria-label") ||
          button.getAttribute("aria-labelledby") ||
          button.textContent?.trim(),
      );

    return {
      missingDocumentTitle: !document.title.trim(),
      missingDocumentLanguage: !document.documentElement.getAttribute("lang"),
      missingMainHeading: !document.querySelector("h1"),
      unlabeledFormControls: [...document.querySelectorAll("input, select, textarea")]
        .filter((control) => !hasAssociatedLabel(control))
        .map(controlDescription),
      unnamedButtons: [...document.querySelectorAll("button")].filter((button) => !hasAccessibleName(button)).map(controlDescription),
    };
  });
}

function accessibilityProblems(baseline: AccessibilityBaseline): string[] {
  const problems: string[] = [];
  if (baseline.missingDocumentTitle) {
    problems.push("document title is missing");
  }
  if (baseline.missingDocumentLanguage) {
    problems.push("html lang attribute is missing");
  }
  if (baseline.missingMainHeading) {
    problems.push("h1 heading is missing");
  }
  if (baseline.unlabeledFormControls.length > 0) {
    problems.push(`unlabeled form controls: ${baseline.unlabeledFormControls.join(", ")}`);
  }
  if (baseline.unnamedButtons.length > 0) {
    problems.push(`buttons without accessible names: ${baseline.unnamedButtons.join(", ")}`);
  }
  return problems;
}

async function scanPageAtBreakpoint(
  browser: Browser,
  baseUrl: string,
  pageConfig: UiPageConfig,
  pageIndex: number,
  breakpoint: UiBreakpointConfig,
  breakpointIndex: number,
  failOnConsoleErrors: boolean,
): Promise<ReportItem[]> {
  const label = pageLabel(pageConfig, pageIndex);
  const viewport = breakpointLabel(breakpoint, breakpointIndex);
  const checkPrefix = `page:${label}:${viewport}`;
  const url = buildUrl(baseUrl, pageConfig.path);
  if (!url) {
    return [
      item(
        checkPrefix,
        "warn",
        "medium",
        `${label} could not be checked at ${viewport} because its configured path is invalid.`,
        "Provide a valid UI page path relative to ui.baseUrl.",
        [pageConfig.path],
      ),
    ];
  }

  const context = await browser.newContext({ viewport: { width: breakpoint.width, height: breakpoint.height } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 10_000 });
    if (!response) {
      return [
        item(
          `${checkPrefix}:load`,
          "warn",
          "medium",
          `${label} did not return a navigation response at ${viewport}.`,
          "Verify the configured page path and local service behavior.",
          [url],
        ),
      ];
    }

    const findings: ReportItem[] = [
      response.ok()
        ? item(
            `${checkPrefix}:load`,
            "pass",
            "info",
            `${label} loaded at ${viewport} with status ${response.status()}.`,
            "Keep this page path covered as the UI evolves.",
            [url, `viewport=${breakpoint.width}x${breakpoint.height}`],
          )
        : item(
            `${checkPrefix}:load`,
            "warn",
            "medium",
            `${label} returned status ${response.status()} at ${viewport}.`,
            "Fix the page route or update the configured UI path.",
            [url, `viewport=${breakpoint.width}x${breakpoint.height}`],
          ),
    ];

    const images = await checkImages(page);
    findings.push(
      consoleErrors.length > 0
        ? item(
            `${checkPrefix}:console-errors`,
            failOnConsoleErrors ? "fail" : "warn",
            failOnConsoleErrors ? "high" : "medium",
            `${label} emitted ${consoleErrors.length} browser console error${consoleErrors.length === 1 ? "" : "s"} at ${viewport}.`,
            "Investigate and remove unexpected browser console errors.",
            consoleErrors,
          )
        : item(
            `${checkPrefix}:console-errors`,
            "pass",
            "info",
            `${label} emitted no browser console errors at ${viewport}.`,
            "Keep monitoring console output during UI checks.",
          ),
      images.broken.length > 0
        ? item(
            `${checkPrefix}:broken-images`,
            "warn",
            "medium",
            `${label} contains ${images.broken.length} broken image${images.broken.length === 1 ? "" : "s"} at ${viewport}.`,
            "Fix or remove image references that do not load successfully.",
            images.broken.map(({ src }) => src),
          )
        : item(
            `${checkPrefix}:broken-images`,
            "pass",
            "info",
            `${label} contains no broken images at ${viewport}.`,
            "Keep image references covered by UI checks.",
          ),
      images.missingAlt.length > 0
        ? item(
            `${checkPrefix}:missing-alt`,
            "warn",
            "medium",
            `${label} contains ${images.missingAlt.length} image${images.missingAlt.length === 1 ? "" : "s"} without alt text at ${viewport}.`,
            "Add meaningful alt text for informative images or an empty alt attribute for decorative images.",
            images.missingAlt.map(({ src }) => src),
          )
        : item(
            `${checkPrefix}:missing-alt`,
            "pass",
            "info",
            `${label} contains no images missing alt text at ${viewport}.`,
            "Keep image alternatives reviewed as UI content changes.",
          ),
    );

    const baseline = await checkAccessibilityBaseline(page);
    const problems = accessibilityProblems(baseline);
    findings.push(
      problems.length > 0
        ? item(
            `${checkPrefix}:accessibility-baseline`,
            "warn",
            "medium",
            `${label} has basic accessibility baseline issues at ${viewport}: ${problems.join("; ")}.`,
            "Fix the reported baseline issues and run a dedicated accessibility tool for deeper coverage.",
            problems,
          )
        : item(
            `${checkPrefix}:accessibility-baseline`,
            "pass",
            "info",
            `${label} passed the lightweight accessibility baseline at ${viewport}.`,
            "Run a dedicated accessibility tool for broader WCAG coverage.",
          ),
    );

    return findings;
  } catch (error) {
    return [
      item(
        `${checkPrefix}:runtime`,
        "warn",
        "medium",
        `${label} could not be checked at ${viewport}: ${error instanceof Error ? error.message : "unknown browser error"}`,
        "Verify the page path, local service stability, and Playwright browser installation.",
        [url],
      ),
    ];
  } finally {
    await context.close();
  }
}

async function scanUi(config: AuditConfig): Promise<ReportItem[]> {
  const ui = config.ui;
  if (!ui?.baseUrl) {
    return [
      item(
        "ui-runtime",
        "skipped",
        "info",
        "UI runtime checks skipped because ui.baseUrl is not configured.",
        "Configure ui.baseUrl and representative pages to enable Playwright checks.",
      ),
    ];
  }

  const reachabilityUrl = buildUrl(ui.baseUrl, "/");
  if (!reachabilityUrl) {
    return [
      item(
        "ui-runtime",
        "skipped",
        "low",
        "UI runtime checks skipped because ui.baseUrl is invalid.",
        "Provide a valid absolute ui.baseUrl in the audit config.",
      ),
    ];
  }

  const reachability = await probeUrl(reachabilityUrl);
  if (!reachability.reachable) {
    return [
      item(
        "ui-runtime",
        "skipped",
        "info",
        "UI runtime checks skipped because the configured local service is unreachable.",
        "Start the local UI service and rerun the audit to enable Playwright checks.",
        [reachabilityUrl],
      ),
    ];
  }

  if (!ui.pages || ui.pages.length === 0) {
    return [
      item(
        "ui-pages",
        "skipped",
        "info",
        "UI runtime checks skipped because no ui.pages are configured.",
        "Configure a small set of representative UI pages.",
      ),
    ];
  }

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const findings: ReportItem[] = [
      item(
        "ui-runtime",
        "pass",
        "info",
        "UI runtime service is reachable and Playwright Chromium launched successfully.",
        "Review configured page findings and keep the runtime target configuration current.",
        [ui.baseUrl],
      ),
    ];
    const breakpoints = ui.breakpoints?.length ? ui.breakpoints : [DEFAULT_BREAKPOINT];

    for (const [pageIndex, pageConfig] of ui.pages.entries()) {
      for (const [breakpointIndex, breakpoint] of breakpoints.entries()) {
        findings.push(
          ...(await scanPageAtBreakpoint(
            browser,
            ui.baseUrl,
            pageConfig,
            pageIndex,
            breakpoint,
            breakpointIndex,
            ui.failOnConsoleErrors ?? false,
          )),
        );
      }
    }

    return findings;
  } catch (error) {
    return [
      item(
        "ui-playwright",
        "skipped",
        "medium",
        `Playwright UI checks could not start: ${error instanceof Error ? error.message : "unknown browser launch error"}`,
        "Install the Playwright Chromium browser and verify the local environment, then rerun the audit.",
      ),
    ];
  } finally {
    await browser?.close();
  }
}

export const uiScanner: Scanner = {
  name: "ui",
  async scan(config) {
    try {
      return await scanUi(config);
    } catch (error) {
      return [
        item(
          "ui-scan",
          "fail",
          "high",
          `UI scan could not complete: ${error instanceof Error ? error.message : "unknown error"}`,
          "Check UI configuration and Playwright setup, then rerun the audit.",
        ),
      ];
    }
  },
};
