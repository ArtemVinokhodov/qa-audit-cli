# QA Audit CLI Requirements Notes

## Mandatory Requirements

- Build a TypeScript QA Audit CLI.
- Use Playwright for browser-level checks.
- Audit a locally running or dormant target project.
- Read target URLs, ports, filesystem paths, and credentials from config or `.env`.
- Do not hardcode target-specific values in scanner logic.
- Run static checks even when target services are unavailable.
- Run runtime checks only when configured services are reachable.
- Degrade gracefully: unreachable services, missing optional files, and unavailable AI providers must produce structured skipped or warning findings instead of crashes.
- Generate JSON and HTML reports with an overall summary.
- Include `status`, `finding`, `severity`, and `recommendation` in every report item.
- Include an optional AI/LLM-based check with a no-key fallback.
- Include a reproducible local demo project.
- Document setup, architecture, scope decisions, AI justification, known gaps, and next steps in the README.

## Selected Scope

The first complete version will use a config-driven scanner pipeline with five scanners:

1. Repository scanner: inspect manifests, lock files, `.gitignore`, CI configuration, and lint configuration.
2. Security scanner: detect likely committed secrets, inspect dependency audit output when available, and inspect runtime security headers when the API or UI is reachable.
3. API scanner: probe configured health and API endpoints, record status codes, basic JSON response shape expectations, and latency baselines.
4. UI scanner: use Playwright to load configured pages, collect console errors, identify broken images, run a small accessibility baseline, submit one configured form flow, and check configured viewport widths.
5. AI Risk Review scanner: optionally send a bounded summary of selected project metadata and findings to an LLM for contextual risk review. Without an API key, return a skipped finding and keep the audit usable.

The CLI will produce deterministic JSON and a self-contained HTML report. A small local demo project will expose both static and runtime issues for reviewer inspection.

## Out Of Scope

- Full SAST, DAST, penetration testing, or secret-management replacement.
- Exhaustive vulnerability database integration beyond a lightweight dependency audit invocation where supported.
- Deep semantic source-code analysis for every language or framework.
- Full OpenAPI contract validation, schema fuzzing, or property-based testing.
- Complete WCAG compliance testing.
- Visual regression testing and screenshot diffing.
- Authentication workflows requiring external identity providers.
- Production-grade plugin systems, distributed execution, dashboards, or persistent storage.
- Installing Spec Kit, BMAD Method, or their framework artifacts.

## Assumptions

- The reviewer has a supported Node.js version and can run npm commands.
- The CLI itself is implemented in TypeScript, while the audited target may use another stack.
- The demo project can use a small Node.js service for reproducibility.
- Runtime checks are driven by explicit config rather than automatic port scanning.
- Missing optional config disables the corresponding check and produces an explicit report item.
- AI input is intentionally bounded and excludes credentials, raw `.env` values, and unnecessary source content.
- Initial stack detection is lightweight and based on repository files such as manifests and lock files.

## Risks

- Playwright browser installation may be a larger setup step than npm dependency installation; README instructions must be explicit.
- Dependency audit output differs by ecosystem and package-manager version; parsing must fail safely.
- Secret detection can produce false positives; findings must describe heuristic limitations.
- Runtime services may be slow, partially available, or return non-JSON responses; scanners need timeouts and isolated failure handling.
- AI provider behavior, cost, and availability are external variables; AI analysis must remain optional and clearly documented.
- A broad scanner list can exceed the 2-3 day time box; checks should remain intentionally shallow but demonstrable.

## Planned Deliverables

- TypeScript CLI source with shared scanner and finding contracts.
- Config example and `.env.example`.
- Repository, security, API, Playwright UI, and optional AI scanners.
- JSON and self-contained HTML report generation.
- Reproducible local demo project with intentionally included issues.
- Focused tests for config handling, scanner failure paths, summary generation, and graceful degradation.
- Sample generated reports.
- README with setup, architecture, scope rationale, AI justification, known gaps, and next steps.

