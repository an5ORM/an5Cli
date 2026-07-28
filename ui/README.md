# an5 CLI UI

Local React UI for `an5-cli`. The UI is deliberately small: it gives one selected repository a focused control surface for git status, diff review, pull, build, test, and publish.

## Scope

- Repository picker with one active repo
- Git status and diff display
- Pull, build, and test actions
- Publish form with commit message and optional push
- LLM settings modal for provider credentials

Task management, review generation, and custom script runners are kept out of the UI to keep the screen simple. Use the CLI commands directly for those workflows.

## Development

```bash
npm install
npm run dev
```

The CLI server serves the built UI when started with:

```bash
an5-cli ui
```

## Build

```bash
npm run build
```
