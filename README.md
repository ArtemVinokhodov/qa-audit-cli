# QA Audit CLI

Initial scaffold for a config-driven TypeScript + Playwright QA audit CLI. The tool is intended to audit both dormant and locally running projects and generate JSON and HTML reports.

## Setup

```bash
npm install
npm run build
npm run audit -- --config qa-audit.config.example.json
```

Generated placeholder reports are written to `reports/`.

## Configuration

The CLI loads `qa-audit.config.json` by default. Pass a different file with:

```bash
npm run audit -- --config path/to/config.json
```

Target URLs, ports, paths, and future credentials must come from config or environment variables. Example target values are isolated in `qa-audit.config.example.json`.

## Available Scripts

- `npm run build`: compile TypeScript.
- `npm run audit`: compile and run a placeholder audit with the example config.
- `npm run audit:demo`: run the placeholder demo audit.
- `npm run demo:start`: placeholder until the reproducible demo service is implemented.
- `npm run demo:install`: placeholder until the demo project has dependencies.
- `npm run clean`: remove compiled output.

## Current Status

This increment provides the project skeleton only:

- CLI entry point and config loading
- shared report types
- placeholder repository, security, API, UI, and AI scanners
- JSON and HTML placeholder report generation
- reserved demo project and process-evidence directories

Scanner logic, runtime probing, Playwright checks, AI integration, tests, and the reproducible demo service remain intentionally unimplemented.

## Planning Notes

See `docs/requirements-notes.md` for selected scope, assumptions, risks, and planned deliverables.
