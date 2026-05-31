# QA Audit CLI

Initial scaffold for a config-driven TypeScript + Playwright QA audit CLI. The tool is intended to audit both dormant and locally running projects and generate JSON and HTML reports.

## Setup

```bash
npm install
npm run playwright:install
npm run build
npm run audit -- --config qa-audit.config.example.json
```

Generated reports are written to `reports/`.

## Demo Project

Install and start the intentionally flawed local Express target:

```bash
npm run demo:install
npm run demo:start
```

In a second terminal, run:

```bash
npm run audit:demo
```

The demo app listens on the example URL configured in `qa-audit.config.example.json`. It exposes `/`, `/health`, and `/api/users`. Its issues are deliberately safe fixtures for later scanner implementation.

## Configuration

The CLI loads `qa-audit.config.json` by default. Pass a different file with:

```bash
npm run audit -- --config path/to/config.json
```

Target URLs, ports, paths, and future credentials must come from config or environment variables. Example target values are isolated in `qa-audit.config.example.json`.

## Available Scripts

- `npm run build`: compile TypeScript.
- `npm run audit`: compile and run a placeholder audit with the example config.
- `npm run audit:demo`: run the audit against the example demo configuration.
- `npm run demo:start`: start the local Express demo target.
- `npm run demo:install`: install demo-project dependencies.
- `npm run playwright:install`: install Chromium for Playwright UI checks.
- `npm run clean`: remove compiled output.

## Current Status

The current implementation includes:

- CLI entry point and config loading
- shared report types
- static repository scanner
- static and reachable-only runtime security scanner
- runtime API scanner with dormant-project fallback
- Playwright UI scanner
- placeholder AI scanner
- JSON and HTML report generation
- reproducible intentionally flawed Express demo project

## Repository Scanner

The static repository scanner checks:

- detected stack indicators for Node/TypeScript, Python, Java, and Go
- Node package manifest and supported lock files
- TypeScript configuration when TypeScript usage is detected
- `.gitignore` presence and expected ignore rules
- `.github/workflows` CI directory presence
- common ESLint and Biome lint configuration files

The scanner intentionally uses lightweight file-based heuristics. It does not parse CI workflows, validate lint rules, inspect monorepo workspaces deeply, or detect every possible build tool and lint framework.

## Security Scanner

The security scanner always runs static checks for:

- non-example `.env` files
- secret-like patterns in selected text files, excluding `.git`, `node_modules`, `dist`, `build`, and `reports`
- critical and high severity Node dependency vulnerabilities through `npm audit --json` when `package.json` and `package-lock.json` are present
- cautious debug exposure indicators in `package.json` scripts

When the configured API or UI `baseUrl` is reachable, it also checks:

- `content-security-policy`, `x-frame-options`, `x-content-type-options`, and `referrer-policy`
- wildcard CORS
- a small fixed GET-only list of common debug and API documentation paths

Secret detection is heuristic and reports warnings rather than claiming confirmed exposure. Dependency auditing currently supports npm lockfiles only. Runtime checks do not brute-force endpoints, authenticate, or replace a penetration test.

## API Scanner

The API scanner uses `api.baseUrl` and configured endpoint definitions only. When the local service is reachable, it checks:

- the configured health endpoint
- configured representative API endpoints
- expected status codes
- expected content types
- basic JSON validity and top-level object or array shape for JSON responses
- response time against `api.latencyWarnMs`

When the service is unreachable or API runtime context is missing, the scanner returns skipped runtime findings and searches the target project for common dormant-project hints: OpenAPI or Swagger files and route, controller, or schema directories. This fallback reports possible future contract-analysis inputs; it does not infer or validate contracts yet.

## UI Scanner

The UI scanner runs only when `ui.baseUrl` is reachable. It launches Playwright Chromium and checks configured pages across configured breakpoints for:

- navigation status
- browser console errors
- broken images
- images missing alt text
- a lightweight accessibility baseline: document title, document language, main heading, form-control labels, and button accessible names

Console errors are warnings by default and can be promoted to failures with `ui.failOnConsoleErrors`. Page and breakpoint checks are isolated so one navigation failure does not stop the remaining UI audit. Chromium is always closed after the run.

The accessibility baseline is deliberately small and does not replace axe-core, manual keyboard testing, assistive-technology testing, or a WCAG audit. Visual regression, responsive layout assertions, and form workflows remain future work.

AI integration and tests remain intentionally unimplemented.

## Planning Notes

See `docs/requirements-notes.md` for selected scope, assumptions, risks, and planned deliverables.
