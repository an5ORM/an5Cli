# an5Cli

CLI automation tool for AN5 ORM workspace. Handles changelog generation, release automation, and LLM-powered commit messages across multiple repositories.

## Features

- **Release automation** — Changelog generation, commit, push for single repos
- **Workspace orchestration** — Process all submodules in one command
- **LLM commit messages and changelogs** — Separate notes generated from code changes
- **Documentation reconciliation** — Compare guides with changed source and diff
- **Release verification** — Watch tag CI, check npm/PyPI versions and GitHub Releases
- **GitHub login** — Browser-based or PAT authentication
- **Script runner** — Execute custom workspace scripts

## Installation

```bash
cd an5Cli
npm install
npm run build
```

## Commands

### `release`

Generate changelog, commit, and push for a single repository.

```bash
an5-cli release [path] [options]

Options:
  --preview         Preview only; no builds, writes, pulls or checkout
  --push            Push after commit
  --pull            Fast-forward pull before processing (ignored in preview)
  --tag <name>      Tag the release commit; must match the package version
  --version <ver>   Set npm and synchronized static Python versions
  --files <path>    Include an exact changed path; repeat for additional paths
  --changelog-file <path>  Use prepared Markdown notes without an LLM
  --update-docs     Reconcile docs with current source and Git diff
  --verify-release With --tag --push: verify tag CI and published artifacts
  --message <text>  Override LLM-generated message
  --branch <name>   Specify branch (default: auto-detect)
  --skip-llm        Skip LLM commit message generation
```

`--preview` is the preview option. At the workspace root, use `npm run preview`.

### `ws` (Workspace)

Run release across all repositories in the workspace.

```bash
an5-cli ws [path] [options]

Options:
  --push, --pull, --preview, --update-docs and message/check options
  --all             Report all repos, even unchanged ones
```

Workspace mode uses existing submodule checkouts and pushes children before the
parent. It does not initialize, merge remote heads, or switch branches. Initialize
missing submodules explicitly. Per-package `--version`, `--tag`, `--files`,
`--changelog-file`, and `--verify-release` belong to single-repository release.

### `doc:diff`, `impact`, and `sync`

```bash
an5-cli impact ../an5Orm
an5-cli doc:diff ../an5Orm --preview
an5-cli doc:diff ../an5Orm
an5-cli sync ../an5Orm --preview
```

Documentation updates use the current source, Git diff, and package commands.
New guides can be created; deleted guides stay deleted, and duplicate targets
are processed once. Source discovery includes TypeScript, JavaScript, Python,
C#, Go, Rust, and `.an5` schemas. Generation requires configured LLM credentials;
missing/failed output is an error, not a successful update. Review generated
content before delivery. `sync` returns failure when its build/test or docs steps
fail and stops documentation writes after a build failure.

### Complete delivery

```bash
# Inspect a package without modifying its checkout
node an5Cli/dist/index.js release an5Adapters --preview --skip-llm

# Deliver selected changes with notes prepared by an agent; repeat --files
node an5Cli/dist/index.js release an5Adapters --files typescript/src/an5Adapter.ts --changelog-file /path/to/notes.md --message "fix: preserve query parameters" --skip-llm --skip-prompt

# Authorized package release with LLM documentation updates and verification
node an5Cli/dist/index.js release an5Adapters --update-docs --version 0.2.11 --tag v0.2.11 --push --verify-release --skip-prompt
```

The last command mutates versions/docs, commits, pushes, and publishes through
existing tag workflows; use it only for an authorized release. Version values in
examples are illustrative, not a recommendation to reuse an existing version.

`--version` updates npm manifest/lockfiles and a static `[project].version` in
`pyproject.toml` when it already follows the npm version. Python synchronization
currently accepts stable versions only; dynamic/independent versions require the
package's maintained tooling. Independent Rust/.NET versions and downstream
version ranges are not guessed or rewritten. Existing version-sync checks still
run before committing.

Changelog dates use the process timezone; set `TZ` for the intended release date.
Without an explicit version/tag, notes go into `Unreleased`. Existing notes and
historical entries are retained. The LLM changelog reads the diff independently
of the commit message; `--changelog-file` supplies reviewed notes directly, and
`--skip-llm` falls back to the commit message.

By default release includes the changed paths in that repository. With `--files`,
unrelated edits remain unstaged; unrelated staged work or dirty automatic output
paths cause an error before mutation. Include regenerated artifacts explicitly
when using a selected-file release. Use the current target branch; the CLI does
not switch dirty/detached checkouts for you. Failed checks, commits, pushes, and
tag operations return failure. Parent pushes require reachable child commits.

`--verify-release` needs authenticated `gh`, discovers tag-push runs for the exact
commit/tag, waits up to ten minutes per run, rejects failed/skipped jobs, checks
npm/PyPI versions when corresponding job names identify those registries, and
verifies a published GitHub Release. Other registries and unusually named publish
jobs need independent verification. Without this flag, a tag push is reported as
unverified publication. A verification failure can happen after a commit/tag
already reached the remote; inspect that state before retrying. No automatic
force-push, tag replacement, or release version retry occurs.

### `login`

Store GitHub credentials and update all remote URLs.

```bash
an5-cli login [username] [token]
```

If no arguments provided, attempts browser login via `gh` CLI.

### `run`

Run a custom script from `workspace.json`.

```bash
an5-cli run <script-name>
```

### `format`

Auto-format `.an5` files using premium alignment rules (same as VS Code).

```bash
an5-cli format [path]
```

## Examples

```bash
# Release current repo
an5-cli release

# Release and push
an5-cli release --push

# Release with custom message
an5-cli release --message "feat: add new feature"

# Release all repos in workspace
an5-cli ws . --push

# Preview changes without committing
an5-cli ws . --preview

# Login via browser
an5-cli login
```

## Configuration

### `.an5cli.json`

```json
{
  "defaultTarget": "../an5Orm",
  "defaultBranch": "main",
  "preview": false,
  "push": false,
  "skipPrompt": false
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `LLM_PROVIDER` | `openai`, `gemini`, or `custom` |
| `LLM_API_KEY` | API key for LLM provider |
| `OPENAI_API_KEY` | Alternative for OpenAI |
| `GEMINI_API_KEY` | Alternative for Gemini |
| `LLM_MODEL` | Model name (e.g., `gpt-4o-mini`) |
| `LLM_ENDPOINT` | Custom endpoint URL |

## Testing

```bash
npm test
```

## License

MIT
