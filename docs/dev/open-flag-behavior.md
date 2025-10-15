# CLI `--open` Guardian Behaviour

The `--open` flag is routed through a cross-platform "guardian" layer that protects CI and remote sessions from hanging while still providing a smooth developer experience on desktop environments.

## Environment Detection
- The guardian evaluates the terminal state (`process.stdout.isTTY`) and checks for CI or SSH markers (e.g., `CI`, `GITHUB_ACTIONS`, `SSH_CONNECTION`).
- On Linux it additionally verifies that a graphical session is present by ensuring `DISPLAY`, `WAYLAND_DISPLAY`, or `MIR_SOCKET` is set.
- If any of these checks fail, the guardian skips launching a viewer and surfaces a warning explaining why.

## Launch Semantics
- macOS: uses `open <target>`.
- Windows: uses `cmd /c start "" "<target>"` to respect paths with spaces.
- Linux: uses `xdg-open <target>` for files or URLs.
- All commands are spawned in a detached, non-blocking mode; the CLI continues immediately.

## Usage Guidelines
- Use `launch()` from `app/src/cli/utils/open-guardian.js` to open files or URLs safely.
- Pass the interactive state from `createConsole()` (or equivalent) so headless contexts are respected.
- Inspect the returned result to emit helpful warnings when the launch is skipped or fails.
- Developers can opt out by exporting `OPEN_GUARDIAN_DISABLE=1`, which forces the guardian to skip execution.
