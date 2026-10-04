# Changelog

## [0.2.0] - 2026-10-04

### Changed
- The UI palette now resolves from the `an5Brand` tokens. `--color-primary` was
  `#a855f7` and `--color-accent` was `#06b6d4`, neither of which is an AN5 brand
  colour; they are now the brand indigo and cyan, and the legacy `.btn-primary` /
  `.btn-accent` gradients in `public/style.css` use the brand gradient.
- The favicons in `public/` and `ui/public/` are generated from the brand tokens
  instead of hand-copied SVGs that drew the wordmark as live text.
- `npm test` also runs `brand:check`, which fails if a favicon or stylesheet drifts
  from `an5Brand/tokens.json`.

- Reject malformed SemVer prerelease/build identifiers before release and honor `--skip-llm` during interactive code review.

### Added
- Rename preview mode to `--preview` and the workspace command to `npm run preview`;
  remove the previous flag and workspace script alias.
- Reconcile docs with changed source, Git diff, and package commands through
  `--update-docs`; reuse the same updater in CLI, sync, and Web UI.
- Deliver selected paths with `--files` and reviewed notes with `--changelog-file`.
- Set npm/lockfile and synchronized static Python versions with `--version`.
- Verify tag CI, recognized npm/PyPI artifacts, and GitHub Releases using
  `--verify-release`; expose version/tag/docs/verification controls in the UI.

### Fixed
- Keep preview read-only, including workspace submodule checkouts and build steps.
- Propagate failed checks, commits, pushes, tags, and documentation generation.
- Generate changelog notes from the diff and preserve existing release history.
- Create missing guides, deduplicate doc targets, and preserve deleted guides.
- Preserve unrelated edits during selected-file delivery and reject staged/output
  conflicts; verify child commits are reachable before a parent push.
- Report local commits, pushes, and verified releases separately in the UI.
- Pass command arguments directly on Unix and fail on signal-terminated commands.

- Stage tracked build artifacts inside ignored directories without including ignored, untracked build output.

## [0.1.1] - 2026-08-19

- chore: update build

## [0.1.0] - 2026-07-04

- Initial release
  - CLI for release automation
  - LLM-powered commit messages
  - Workspace orchestration (ws command)
