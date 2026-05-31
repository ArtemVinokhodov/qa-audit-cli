# QA Audit CLI Working Rules

## Project Goal

Build a focused TypeScript + Playwright QA Audit CLI that scans a local project and generates structured JSON and HTML quality reports.

The target project may be running or dormant. Static analysis is always available. Runtime analysis activates only when configured services are reachable.

## Mandatory Requirements

- Write the entire tool in TypeScript.
- Use Playwright for all browser-level automation. Do not substitute another browser automation framework.
- Read target URLs, ports, filesystem paths, and credentials from configuration or `.env`.
- Never hardcode target URLs, ports, paths, or credentials in scanner logic.
- Keep static checks usable when no target services are running.
- Probe reachability before runtime checks. Run runtime checks only for reachable services.
- Treat missing files, invalid optional configuration, and unreachable services as reportable conditions. Do not crash.
- Generate both JSON and HTML reports.
- Include an overall summary at the top of each report.
- Include `status`, `finding`, `severity`, and `recommendation` for every report item.
- Include at least one optional AI/LLM-based check.
- Provide a documented fallback when no AI API key is configured. The audit must still run without paid APIs.
- Include a reproducible local demo project in the repository.
- Include a README with setup instructions, architecture, scope decisions, AI justification, known gaps, and next steps.

## Delivery Principles

- Keep the deliverable lightweight and understandable for a reviewer.
- Work in small, reviewable increments.
- Use a requirements -> plan -> tasks -> implementation flow where it adds clarity.
- Record architectural rationale and explicit trade-offs in the README.
- Prefer a working, defensible scope over broad but shallow coverage.
- Do not install Spec Kit or BMAD Method.
- Do not add Spec Kit, BMAD Method, or similar framework files to the repository.

## Architecture Rules

- Prefer small modules with clear responsibilities.
- Implement scanners as classes or functions behind a common interface.
- Keep configuration loading and validation separate from scanner logic.
- Separate static, runtime API/security, browser, AI, and report-generation concerns.
- Return structured findings from scanners. Do not couple scanners to terminal output or report rendering.
- Model skipped checks explicitly when required context is unavailable.
- Avoid overengineering and speculative abstractions.

## Coding Rules

- Use clean, idiomatic TypeScript.
- Add comments only when they explain a non-obvious decision.
- Handle expected filesystem, parsing, network, browser, and AI-provider failures gracefully.
- Do not log or include credentials, API keys, or sensitive environment values in reports.
- Keep target-specific values in config files or environment variables.
- Add focused tests for shared contracts, configuration handling, and failure paths.

## Incremental Workflow

For each major increment:

1. Define the intended behavior and scope.
2. Implement the smallest coherent change.
3. Run the relevant build, test, and audit scripts.
4. Fix regressions before expanding scope.
5. If a script cannot run yet, state why and what remains.
6. Update documentation when architecture, setup, scope, or known gaps change.

## Completion Checklist

Before submission, verify:

- A clean machine can clone, install, and run the tool with documented commands.
- Static auditing succeeds against a dormant target project.
- Runtime auditing gracefully skips or warns when configured services are unreachable.
- Runtime checks activate when the demo services are reachable.
- Browser checks use Playwright.
- JSON and HTML reports contain summaries and structured findings.
- AI analysis is optional, justified, and has a no-key fallback.
- The demo project and sample reports are reproducible.
- The README documents setup, architecture, deliberate scope choices, gaps, and next steps.

