# OpenSandbox PTY Terminal Design

Date: 2026-04-05

## Problem

The current sandbox terminal is not a real terminal. It wraps each user action as a one-shot `sandbox.commands.run()` call and streams stdout/stderr back over a custom WebSocket. That implementation is sufficient for non-interactive commands, but it cannot correctly support:

- stdin during a running process
- TTY-aware programs (`apt`, `vim`, `ssh`, `top`, `python`, `less`)
- ANSI escape sequences and cursor movement
- alternate screen / full-screen terminal apps
- terminal resize
- reconnect to a long-lived shell

As a result, the UI looks like a terminal, but the underlying execution model is RPC command execution, not an interactive shell.

## External constraints

OpenSandbox exposes three distinct models:

1. `commands.run()`
   Use for one-shot command execution with SSE streaming.

2. `create_session()` + `run_in_session()`
   Use for a persistent bash session across multiple command invocations, but still command-oriented rather than byte-stream interactive TTY IO.

3. `execd` PTY sessions
   Use `/pty` + `/pty/:id/ws` for a true interactive terminal with raw stdin, resize, signals, replay, and WebSocket transport.

For a human-operated terminal panel, PTY is the correct abstraction. The other two are still useful, but for automation and agent tooling, not for a terminal emulator.

## Options

### Option A: Keep `commands.run()` and patch the UI

Add an input path while a command is running and try to simulate confirmations.

Pros:
- smallest code change
- no dependency change in frontend

Cons:
- still no PTY
- still wrong for `apt`, `vim`, `ssh`, `top`, shell job control, alternate screen, colors, resize
- pushes command-specific hacks into generic terminal infrastructure

Decision: reject.

### Option B: Use `create_session()` / `run_in_session()`

Move from one-shot command execution to persistent bash sessions, but keep a line-oriented UI.

Pros:
- better shell state persistence than current approach
- supported by the SDK

Cons:
- still not a real terminal
- still no raw stdin/TTY semantics
- still cannot correctly support interactive programs

Decision: useful for machine-driven shell workflows, but not for the terminal UI.

### Option C: Use OpenSandbox PTY and proxy it through our backend

Replace the current fake terminal with a real PTY-backed terminal. The frontend becomes a terminal emulator, and the backend becomes an authenticated PTY bridge.

Pros:
- matches OpenSandbox’s intended interactive terminal model
- supports stdin, resize, signals, ANSI, full-screen apps, reconnect
- keeps OpenSandbox credentials and internal endpoints off the browser

Cons:
- larger frontend/backend refactor
- adds a terminal emulator dependency
- requires explicit session lifecycle management

Decision: adopt.

## Recommended architecture

### High-level flow

1. User opens the terminal panel.
2. Frontend opens `GET /api/v1/sessions/:session_id/sandbox/terminal` WebSocket to our backend.
3. Backend authenticates user ownership and ensures a sandbox is running.
4. Backend resolves the sandbox `execd` endpoint through OpenSandbox.
5. Backend ensures a PTY session exists for this app session.
6. Backend opens an upstream WebSocket to OpenSandbox PTY:
   `/pty/<pty_session_id>/ws`
7. Backend transparently proxies binary and text frames between browser and OpenSandbox.
8. Frontend renders bytes via a real terminal emulator and sends user keystrokes as raw stdin bytes.

### Key principle

Do not translate interactive terminal behavior into higher-level commands. Proxy PTY frames as directly as possible and let the terminal emulator handle terminal semantics.

## Target protocol

The browser-to-backend protocol should align with OpenSandbox PTY protocol instead of the current custom command protocol.

### Upstream OpenSandbox protocol

OpenSandbox PTY WebSocket supports:

- binary client frames: `0x00 + raw stdin bytes`
- binary server frames:
  - `0x01 + stdout bytes`
  - `0x02 + stderr bytes` in pipe mode
  - `0x03 + [8-byte offset] + replay bytes`
- text JSON client frames:
  - `{"type":"resize","cols":120,"rows":40}`
  - `{"type":"signal","signal":"SIGINT"}`
  - `{"type":"ping"}`
- text JSON server frames:
  - `{"type":"connected","session_id":"...","mode":"pty"}`
  - `{"type":"exit","exit_code":0}`
  - `{"type":"error","code":"...","error":"..."}`
  - `{"type":"pong"}`

### Our backend WebSocket contract

Recommendation: preserve the OpenSandbox PTY frame model end-to-end with only minimal wrapping for auth and session bootstrapping.

That means:

- browser sends raw stdin binary frames to our backend
- backend forwards them unchanged upstream
- backend forwards upstream stdout/replay frames unchanged to browser
- backend forwards resize/signal/ping JSON frames unchanged upstream
- backend may send one additional JSON frame before proxy start if session bootstrap fails

This keeps the proxy thin and avoids inventing another terminal protocol.

## Backend design

### 1. Split terminal responsibilities

Create two separate concepts in the backend:

- command runner
  Current one-shot `run_terminal_command()` path. Keep for agent tools or future non-interactive command panel.

- interactive terminal
  New PTY-backed path for the human terminal panel.

This prevents future regressions caused by mixing automation and TTY concerns in one abstraction.

### 2. Add PTY session management to sandbox client layer

Add PTY-specific helpers in `app/sandbox/client.py` or a dedicated `app/sandbox/pty_client.py`:

- `create_pty_session(sandbox_id, cwd) -> session_id`
- `get_pty_session_status(sandbox_id, session_id) -> { running, output_offset }`
- `delete_pty_session(sandbox_id, session_id)`
- `connect_pty_websocket(sandbox_id, session_id, since=0) -> upstream ws`

The Python SDK does not expose PTY helpers today, so this layer should use raw HTTP/WebSocket against the sandbox `execd` endpoint using the same OpenSandbox connection configuration already stored by the backend.

### 3. Persist one PTY session per app session sandbox

Store PTY state with the sandbox record. Minimal fields:

- `terminal_session_id`
- `terminal_session_created_at`
- `terminal_session_last_seen_at`

Rationale:

- supports reconnect after browser refresh
- avoids creating a brand-new shell every time the panel opens
- lets us explicitly clean up on sandbox stop/delete

If schema churn is undesirable, phase 1 can store this in process memory keyed by `session_id`, but that loses reconnectability across backend restarts and is not the final design.

### 4. Replace current WS command loop with PTY bridge

Current route:

- `GET /api/v1/sessions/:session_id/sandbox/terminal`

Keep the route stable, but change behavior:

- on connect, authenticate and load sandbox
- ensure PTY session exists
- connect upstream to `/pty/:session_id/ws`
- proxy upstream frames to frontend
- proxy frontend frames to upstream
- on backend disconnect, close only the upstream WS, not the PTY session itself
- on explicit terminal reset, delete PTY session and create a new one

### 5. Reconnect semantics

Prefer this behavior:

- normal panel close: keep PTY session alive
- backend reconnect: reattach to existing PTY session
- frontend refresh: request replay from offset `0` in phase 1 for simplicity
- later optimization: track byte offsets and reconnect with `since=<last_seen_offset>`

Phase 1 replay-from-zero is acceptable because it is correct and simple. Offset tracking can be added later as a performance optimization.

### 6. Cleanup rules

Delete PTY session when:

- sandbox is stopped
- sandbox is deleted
- user clicks “reset terminal”
- PTY bootstrap detects session corruption and cannot reconnect safely

Do not delete PTY session on ordinary WebSocket disconnects.

## Frontend design

### 1. Replace line-based terminal UI with a terminal emulator

The current React list rendering cannot support ANSI, cursor addressing, alternate screen, or raw PTY behavior. Replace it with:

- `xterm`
- `@xterm/addon-fit`

Optional later:

- `@xterm/addon-web-links`
- `@xterm/addon-search`

### 2. New `TerminalPanel` behavior

Instead of:

- storing terminal output as `TerminalLine[]`
- unmounting input while busy
- interpreting Enter as “submit command”

Use:

- terminal emulator mounted once
- `term.onData()` sends raw bytes over WebSocket
- resize observer sends `{"type":"resize","cols":...,"rows":...}`
- focus always stays in the emulator
- `Ctrl-C`, `Tab`, arrows, `vim`, `less`, `top` work naturally

### 3. WebSocket client behavior

`frontend/src/lib/terminalApi.ts` should support:

- `binaryType = "arraybuffer"`
- sending binary stdin frames
- sending JSON text control frames
- parsing incoming binary channel-prefixed frames
- decoding UTF-8 bytes and writing them to `xterm`
- handling `connected`, `exit`, `error`, `pong`

### 4. UX controls

Recommended controls:

- reconnect terminal
- reset terminal
- clear local viewport

Do not treat a running terminal as “busy” in the current sense. A terminal is attached, not busy/idle. The shell prompt itself communicates readiness.

## Suggested repository changes

### Backend

- replace the WebSocket implementation in `app/router/v1/sandbox.py`
- add PTY helpers in `app/sandbox/client.py` or a new PTY module
- add PTY session persistence to `app/db/model/session_sandbox.py` and migration
- update `app/service/sandbox.py` cleanup path to delete PTY session before killing sandbox when appropriate

### Frontend

- replace the line-based implementation in `frontend/src/components/chat/terminal/TerminalPanel.tsx`
- replace `frontend/src/hooks/useTerminal.ts` state model
- replace `frontend/src/lib/terminalApi.ts` protocol implementation
- add `xterm` dependencies to `frontend/package.json`

## Migration plan

### Phase 1: PTY backend bridge

- implement PTY HTTP/WS helpers
- keep existing route path
- proxy PTY frames end-to-end
- add minimal session persistence

### Phase 2: Terminal emulator frontend

- add `xterm`
- switch panel rendering to emulator
- wire raw stdin and resize
- surface exit/error/reconnect states

### Phase 3: Remove incorrect abstractions

- remove `isBusy` terminal model
- remove line-based command history from the terminal UI
- move current one-shot command execution helpers under a separate non-interactive shell abstraction

## Failure handling

### PTY not supported

OpenSandbox PTY is Unix-only. If PTY creation returns `NotImplemented`:

- show a clear “interactive terminal not supported on this sandbox” message
- optionally offer a degraded non-interactive command runner as a separate mode

Do not silently fall back inside the same UI and pretend the result is equivalent.

### Concurrent connections

OpenSandbox allows only one WebSocket per PTY session. If an upstream attach returns 409:

- either show “terminal already attached elsewhere”
- or deliberately reset and steal the terminal

Default recommendation: show the conflict first; do not auto-steal.

### Backend restart

If PTY session id is persisted:

- reconnect to the same PTY session on next panel open

If reconnect fails because the upstream PTY is gone:

- create a new PTY session
- inform the user that terminal state was reset

## Testing strategy

### Backend integration tests

- open PTY session and verify shell prompt arrives
- send `echo hello` as raw stdin and verify output
- send `printf` with ANSI escapes and verify bytes are proxied unchanged
- send resize frame and verify no backend error
- send signal frame and verify foreground process exits
- reconnect and verify replay behavior
- verify sandbox stop deletes PTY session metadata

### Manual validation matrix

- `apt upgrade` prompt accepts `y`
- `python` REPL accepts input and exits cleanly
- `vim` opens and responds to keystrokes
- `top` or `htop` redraws correctly
- `less` supports scrolling
- `ssh` prompt renders and accepts typing
- browser refresh can reconnect to same shell

## ADR summary

Decision:

- use OpenSandbox PTY for the terminal UI
- proxy PTY through the backend
- use a terminal emulator on the frontend
- keep one-shot command execution as a separate, non-interactive capability

Why:

- this is the only model that is semantically correct for a human terminal
- it aligns with OpenSandbox’s existing PTY implementation instead of fighting it
- it removes the current mismatch between UI expectations and execution semantics

## References

- OpenSandbox Python SDK README:
  https://github.com/alibaba/OpenSandbox/blob/main/sdks/sandbox/python/README.md
- OpenSandbox command service interface:
  https://github.com/alibaba/OpenSandbox/blob/main/sdks/sandbox/python/src/opensandbox/services/command.py
- OpenSandbox execd PTY documentation:
  https://github.com/alibaba/OpenSandbox/blob/main/components/execd/PTY.md
- OpenSandbox PTY WebSocket frame model:
  https://github.com/alibaba/OpenSandbox/blob/main/components/execd/pkg/web/model/pty_ws.go
- OpenSandbox PTY WebSocket controller:
  https://github.com/alibaba/OpenSandbox/blob/main/components/execd/pkg/web/controller/pty_ws.go
