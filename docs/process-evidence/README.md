# Development Process Evidence

This folder contains screenshots that document the real development workflow for the QA Audit CLI.

The assignment requested Cursor session evidence. I used WebStorm as my primary TypeScript/Node IDE and Codex as the AI assistant instead of Cursor. The screenshots are provided to show the real development process transparently, not as a post-hoc reconstruction.

## Included Screenshots

### `01-requirements-and-codex-planning.png`

Shows the requirements breakdown and the initial Codex planning session in WebStorm.

This screenshot covers:
- mandatory assignment requirements
- selected implementation scope
- out-of-scope items
- initial implementation order
- Codex planning before full implementation

### `02-webstorm-project-structure.png`

Shows the generated WebStorm project structure after the initial TypeScript CLI skeleton was created.

This screenshot covers:
- `src/config`
- `src/scanners`
- `src/reporters`
- `src/types`
- `demo-project`
- `reports`
- `docs/process-evidence`

### `03-scanner-implementation.png`

Shows scanner implementation progress.

This screenshot demonstrates that the tool was implemented as a structured scanner pipeline rather than a single hardcoded script.

It covers:
- scanner source files
- structured TypeScript implementation
- shared report item contract
- Codex-assisted implementation progress

### `04-end-to-end-verification.png`

Shows the final end-to-end verification summary.

This screenshot covers:
- successful audit execution
- generated JSON and HTML reports
- final check counts
- demo service cleanup
- verification that the workflow runs successfully

### `05-sample-html-report.png`

Shows the generated HTML report opened in the browser.

This screenshot covers:
- overall summary
- pass/warn/fail/skipped counts
- grouped findings
- actionable recommendations
- generated report format expected by reviewers

## Notes

The screenshots are intentionally lightweight. They are meant to show the real workflow progression:

1. Requirements analysis
2. Planning with Codex
3. Project skeleton creation
4. Scanner implementation
5. End-to-end verification
6. Final generated report

No fake Cursor screenshots were created. The README explains that WebStorm + Codex was used instead of Cursor.