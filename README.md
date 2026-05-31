# QA Audit CLI

A config-driven TypeScript and Playwright CLI that audits a local project and produces structured JSON and HTML quality reports. It supports dormant-project static analysis and adds runtime API, security, and browser checks when configured local services are reachable.

## Assignment Goal

The goal is to provide a focused QA audit tool that can be cloned, installed, and run against a local project without hardcoded target details. The implementation prioritizes useful signals, graceful degradation, and clear recommendations over broad but shallow coverage.

The CLI reads project paths, URLs, ports, endpoint paths, and optional AI settings from config or environment variables. Scanner logic does not contain demo-specific target URLs or credentials.

## What The Tool Checks

### Code & Repository

The repository scanner always runs. It checks:

- stack indicators for Node/TypeScript, Python, Java, Go, or unknown projects
- Node `package.json` and supported lockfiles
- `tsconfig.json` when TypeScript usage is detected
- `.gitignore` presence and expected rules for dependencies, `.env`, reports, and build output
- `.github/workflows` presence
- common ESLint and Biome configuration files

### Security

Static checks always run:

- non-example `.env` files
- secret-like patterns in selected safe text files
- critical and high Node dependency vulnerabilities through `npm audit --json`
- cautious debug or broad-host exposure indicators in package scripts

When a configured service is reachable, runtime checks add:

- `content-security-policy`
- `x-frame-options`
- `x-content-type-options`
- `referrer-policy`
- wildcard CORS detection
- a fixed GET-only list of common debug and API documentation paths

Secret detection is heuristic. A warning means that a human should review the evidence; it is not a claim that a real credential has been exposed.

### API / Backend

When `api.baseUrl` is reachable, the API scanner checks:

- configured health endpoint
- representative configured API endpoints
- expected HTTP status
- expected content type
- JSON validity and top-level object or array shape for JSON responses
- response time against `api.latencyWarnMs`

When the service is dormant, the scanner returns skipped runtime findings and searches for possible contract-analysis inputs such as OpenAPI, Swagger, route, controller, and schema files or directories.

### UI / Browser

When `ui.baseUrl` is reachable, the UI scanner launches Playwright Chromium and checks configured pages across configured breakpoints:

- page load status
- browser console errors
- broken images
- images missing `alt`
- lightweight accessibility baseline: title, document language, main heading, form-control labels, and button accessible names

Checks are isolated by page and breakpoint. One failing page does not stop the remaining browser audit. The browser and contexts are closed after execution.

### AI Risk Review

The optional AI scanner reviews bounded documentation and contract context for risks that require interpretation:

- ambiguous setup instructions
- unclear API contracts
- missing error-handling expectations
- missing test strategy
- risky assumptions in human-written documentation

The input set is intentionally limited to a small number of README, package, route, OpenAPI, and schema files. `.env` files are not sent as AI context.

## Quick Start

Prerequisite: a current Node.js installation with npm.

Install the CLI and Playwright Chromium:

```bash
npm install
npm run playwright:install
```

Install and start the intentionally flawed demo target:

```bash
npm run demo:install
npm run demo:start
```

In a second terminal, run:

```bash
npm run audit:demo
```

Reports are written to `reports/`.

## Run Against Another Local Project

Create a local config file such as `qa-audit.config.json`, point `projectPath` to the target repository, and configure only the runtime services and checks that apply.

Run:

```bash
npm run audit -- --config qa-audit.config.json
```

The CLI also loads `qa-audit.config.json` by default when no `--config` flag is supplied by the compiled entry point.

Runtime sections are optional. Static repository and security checks continue to run when services are unavailable.

## Configuration

See `qa-audit.config.example.json` for the working demo configuration.

```json
{
  "projectPath": "./demo-project",
  "report": {
    "outputDir": "./reports"
  },
  "api": {
    "baseUrl": "http://127.0.0.1:3100",
    "latencyWarnMs": 1000,
    "healthEndpoint": {
      "path": "/health",
      "expectedStatus": 200,
      "expectedContentType": "application/json"
    },
    "endpoints": [
      {
        "name": "Users",
        "path": "/api/users",
        "expectedStatus": 200,
        "expectedContentType": "application/json"
      }
    ]
  },
  "ui": {
    "baseUrl": "http://127.0.0.1:3100",
    "pages": [{ "name": "Home", "path": "/" }],
    "breakpoints": [{ "name": "mobile", "width": 390, "height": 844 }],
    "failOnConsoleErrors": false
  },
  "ai": {
    "enabled": true,
    "provider": "openai",
    "model": "gpt-4o-mini",
    "maxFiles": 8,
    "fallbackMode": "heuristic"
  }
}
```

Config values support `${ENVIRONMENT_VARIABLE}` substitution. Keep credentials in environment variables, not config files. For OpenAI integration, set `OPENAI_API_KEY` only when paid AI analysis is intended.

## Report Output

Each run writes two files to `report.outputDir`:

- `qa-audit-report.json`: canonical machine-readable output
- `qa-audit-report.html`: self-contained review artifact with inline CSS

Every finding includes:

- `status`: `pass`, `warn`, `fail`, or `skipped`
- `severity`: `critical`, `high`, `medium`, `low`, or `info`
- `category`
- `checkName`
- `finding`
- `recommendation`
- `evidence` when available

The summary includes total, pass, warn, fail, and skipped counts, severity counts, and a short narrative. The HTML report groups findings by category and visually prioritizes warnings and failures.

Sample reports are committed under `reports/`.

## Architecture

```text
CLI
  -> config loader and environment substitution
  -> scanner pipeline
       -> repository scanner
       -> security scanner
       -> API scanner
       -> Playwright UI scanner
       -> optional AI Risk Review scanner
  -> summary builder
  -> JSON reporter
  -> self-contained HTML reporter
```

Scanners return the same structured finding contract and do not render output directly. Runtime scanners probe reachability before deeper checks. Reporters consume scanner output without hardcoded demo findings.

## Scope Rationale

The selected checks cover the four required analysis levels with a realistic 2-3 business day scope:

- repository hygiene establishes whether the project is reproducible and maintainable
- security checks surface common high-value mistakes without pretending to replace security testing
- API checks validate representative runtime contracts and provide a dormant-project fallback
- Playwright verifies browser behavior that static checks cannot observe
- AI review assesses ambiguity in human-written documentation and contracts

The demo project intentionally includes safe issues so reviewers can verify that the pipeline reports observed behavior rather than static sample text.

## Graceful Degradation

The tool is designed to keep producing a report when optional context is unavailable:

- missing or unreachable runtime services produce `skipped` or `warn` findings
- API downtime activates static contract/source discovery
- UI downtime skips Playwright execution
- missing files produce actionable findings rather than crashes
- `npm audit` failures are reported without stopping other scanners
- missing `OPENAI_API_KEY` activates deterministic README fallback checks
- OpenAI API errors degrade to the same fallback

A fundamentally invalid required config or an unwritable output directory still causes the CLI to fail, because a reliable audit report cannot be produced in those cases.

## AI Component Justification

> **Paid API warning:** AI Risk Review is optional. If `ai.enabled` is `true` and `OPENAI_API_KEY` is configured, the scanner calls the configured OpenAI model. API usage may incur cost. The tool remains usable without an API key.

Rule-based checks are appropriate for explicit facts: missing files, secret-like patterns, HTTP statuses, headers, JSON validity, and browser errors. They are not reliable for assessing whether setup instructions are ambiguous, whether a contract leaves important behavior unspecified, or whether documentation makes risky assumptions.

The LLM check is used only for this interpretive layer. Its output is advisory and must be reviewed by an engineer.

Without an API key, a deterministic fallback clearly reports that LLM analysis was not executed and checks README documentation for:

- install command
- run command
- environment-variable documentation
- test or audit command

## Intentionally Out Of Scope

The following were intentionally excluded to keep the submission focused:

- full SAST, DAST, penetration testing, or secret-management replacement
- exhaustive vulnerability database support across package managers
- deep framework-aware parsing for every language
- full OpenAPI validation, schema fuzzing, and property-based testing
- complete WCAG compliance automation
- visual regression testing
- complex authentication flows
- plugin systems, dashboards, persistent storage, and distributed execution

These are valuable extensions, but adding shallow versions would reduce the clarity of the implemented pipeline.

## Known Gaps

- Repository stack detection is file-based and intentionally lightweight.
- CI and lint checks detect common configuration files but do not validate their contents.
- Dependency vulnerability scanning currently supports npm lockfiles only.
- Secret scanning can produce false positives and does not replace dedicated secret scanning.
- API checks validate configured representative endpoints, not complete contracts.
- Static API fallback discovers possible inputs but does not parse routes or OpenAPI schemas.
- UI accessibility checks are a small baseline, not axe-core or a WCAG audit.
- UI checks do not include form flows, screenshots, or visual diffs.
- The paid OpenAI path requires a valid key and was not required for the reproducible no-key demo path.
- Automated unit tests are not included; verification was performed through clean build and end-to-end demo runs.

## Next Improvements

Given more time, I would prioritize:

1. Add focused unit tests for config validation, summary generation, and scanner failure paths.
2. Add axe-core for broader accessibility checks.
3. Parse OpenAPI files during dormant-project API analysis.
4. Add configured form-flow checks and optional screenshots.
5. Add ecosystem-specific dependency adapters beyond npm.
6. Add severity-policy configuration for CI exit codes.
7. Add a small schema for config validation and clearer CLI help output.

## Development Process Evidence

The assignment requested Cursor workflow evidence. I used WebStorm as the primary IDE and Codex as the AI assistant instead of Cursor. This is stated explicitly rather than presenting reconstructed Cursor evidence.

Screenshots are stored in `docs/process-evidence/`:

- `01-requirements-and-codex-planning.png`: requirements breakdown and planning
- `02-webstorm-project-structure.png`: project structure in WebStorm
- `03-scanner-implementation.png`: scanner implementation progress
- `04-end-to-end-verification.png`: verification workflow and sample report generation

Additional scope notes are in `docs/requirements-notes.md`.

## Reviewer Checklist

1. Install root dependencies:
   ```bash
   npm install
   npm run playwright:install
   ```
2. Install demo dependencies:
   ```bash
   npm run demo:install
   ```
3. Start the demo target:
   ```bash
   npm run demo:start
   ```
4. In another terminal, run:
   ```bash
   npm run audit:demo
   ```
5. Inspect:
   - `reports/qa-audit-report.json`
   - `reports/qa-audit-report.html`
6. Confirm the report surfaces the intentional demo issues:
   - missing CSP
   - wildcard CORS
   - browser console error
   - broken image
   - missing image `alt`
   - clearly fake secret-like fixture
   - API endpoint results
   - AI no-key fallback findings

## Available Scripts

- `npm run build`: compile TypeScript.
- `npm run audit`: build and run an audit. Pass `-- --config path/to/config.json` to override the example config.
- `npm run audit:demo`: audit the included demo project.
- `npm run demo:install`: install demo dependencies.
- `npm run demo:start`: start the demo target.
- `npm run playwright:install`: install Chromium for Playwright.
- `npm run clean`: remove compiled output.
