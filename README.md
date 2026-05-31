# QA Audit CLI

Initial scaffold for a config-driven TypeScript + Playwright QA audit CLI. The tool is intended to audit both dormant and locally running projects and generate JSON and HTML reports.

## Setup

```bash
npm install
npm run build
npm run audit -- --config qa-audit.config.example.json
```

Generated placeholder reports are written to `reports/`.

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
- `npm run clean`: remove compiled output.

## Current Status

This increment provides the project skeleton only:

- CLI entry point and config loading
- shared report types
- placeholder repository, security, API, UI, and AI scanners
- JSON and HTML placeholder report generation
- reproducible intentionally flawed Express demo project

Scanner logic, runtime probing, Playwright checks, AI integration, and tests remain intentionally unimplemented.

## Planning Notes

See `docs/requirements-notes.md` for selected scope, assumptions, risks, and planned deliverables.
