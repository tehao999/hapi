# Gemini ACP live-append blocker (2026-06-13)

## Scope

HAPI Gemini remote mode currently talks to `gemini --acp` through `AcpSdkBackend` and `session/prompt`. The requested A mode would require same-turn append/steer while an ACP prompt is in flight.

## Local installed Gemini evidence

Installed CLI checked during this task:

```text
$ gemini --version
0.46.0
$ realpath "$(command -v gemini)"
/opt/homebrew/lib/node_modules/@google/gemini-cli/bundle/gemini.js
```

Protocol/schema surface in the installed Gemini ACP bundle exposes these agent methods only:

- `session/cancel`
- `session/close`
- `session/fork`
- `session/list`
- `session/load`
- `session/new`
- `session/prompt`
- `session/resume`
- `session/set_config_option`
- `session/set_mode`
- `session/set_model`

Source: `/opt/homebrew/lib/node_modules/@google/gemini-cli/bundle/gemini-STIONCRJ.js:11134-11149`.

The actual Gemini ACP agent implementation only implements initialize/auth/session lifecycle, cancel, prompt, mode, and model selection. It does not implement `extMethod`, `extNotification`, or `setSessionConfigOption`; so unknown extension requests/notifications cannot be used as a hidden steering path. Source: `/opt/homebrew/lib/node_modules/@google/gemini-cli/bundle/gemini-STIONCRJ.js:15206-15382`.

The ACP session `prompt(params)` implementation aborts any existing pending prompt at entry (`this.pendingPrompt?.abort()`), then starts a new `session/prompt` turn. A concurrent second `session/prompt` would therefore cancel/replace the active prompt, not append to it. Source: `/opt/homebrew/lib/node_modules/@google/gemini-cli/bundle/gemini-STIONCRJ.js:13936-14012`.

Gemini CLI does have interactive model steering, but it is wired through the interactive React UI and the in-process `config.injectionService.addInjection(trimmed, "user_steering")` path when `config.isModelSteeringEnabled()` and the agent is running. Source: `/opt/homebrew/lib/node_modules/@google/gemini-cli/bundle/interactiveCli-NKTBHB7O.js:33381-33384` and `:33343-33350`.

That interactive steering path is not exposed through ACP `session/prompt`, and HAPI Gemini remote mode does not run the interactive UI transport.

## HAPI source evidence

HAPI Gemini remote waits for `session.queue.waitForMessagesAndGetAsString(...)`, then calls `backend.prompt(acpSessionId, promptContent, onUpdate)` and awaits it before reading the next queued message. Source: `cli/src/gemini/geminiRemoteLauncher.ts`.

`AgentBackend` currently exposes `prompt`, `cancelPrompt`, and permission/session methods only; no append/steer seam exists. Source: `cli/src/agent/types.ts`.

`AcpSdkBackend.prompt()` sends exactly `session/prompt`; `cancelPrompt()` sends exactly `session/cancel`. Source: `cli/src/agent/backends/acp/AcpSdkBackend.ts`.

## Conclusion

Gemini ACP remote mode cannot be safely changed to true A-mode live append on the installed Gemini CLI 0.46.0 without an upstream ACP/Gemini method such as `session/steer` / `session/append` or an exposed extension notification handled by `GeminiAgent`.

Do not fake A mode by cancelling and restarting, by sending a concurrent `session/prompt`, or by silently queueing while claiming append. Those behaviors are not same-turn append and can lose or reorder work.
