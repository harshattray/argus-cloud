# Case 04 — MCP, giving an agent eyes

`normascope-mcp@0.2.0` driven over real stdio JSON-RPC. Every response here
came from the live server; `jsonrpc-transcript.json` and
`agent-loop-transcript.json` are the raw wire records.

## The agent loop — the whole pitch in four steps

From `agent-loop.txt`. An agent edits the UI, then verifies its own work
without a human ever looking at a screenshot.

**Step 1** — agent changes `max-w-6xl` → `max-w-5xl` in `Norma.tsx`.

**Step 2** — agent calls `capture`, then `compare`:

```
  4 of 7 frames flagged (threshold 0.5%)
  Norma — Hero            3.42%  ssim  88.2  FLAGGED
  Norma — Engine             0%  ssim   100  ok
  Norma — Try It          4.18%  ssim  77.6  FLAGGED
  Norma — Pull Requests   3.57%  ssim  84.1  FLAGGED
  Norma — Commands        0.51%  ssim  97.8  FLAGGED
  Articles — Index           0%  ssim   100  ok
  Lab — Index                0%  ssim   100  ok
```

**Step 3** — the agent now has a number to act on: worst frame
`Norma — Try It` at 4.18%, 6 regions. It reverts.

**Step 4** — `capture` + `compare` again:

```
  0 of 7 frames flagged (threshold 0.5%)
```

`flagged before fix: 4 → flagged after fix: 0`. The agent closed the loop on
its own.

## Note for whoever writes the docs

`compare` does **not** capture. An agent that calls `compare` alone after
editing gets a stale, clean-looking score — we hit exactly that on the first
run of this demo and it silently reported 0 flagged on a broken page. The loop
is `capture` → `compare`, and the tool description for `compare` does not say
so. Worth a wording fix in `server.ts`; a coding agent will make this mistake.

## Tools an agent sees

| Tool | Input | Purpose |
|---|---|---|
| `list_frames` | — | label, mode, source, capture status |
| `capture` | `url` | screenshot configured frames |
| `compare` | `target`, `url`, `selector`, `width`, `height` | score; with `target`+`url` runs zero-config mock-vs-URL |
| `get_summary` | — | summary v2 of the last comparison |
| `explain` | `frame`, `deep` | findings; BYO key, or org credits via Normascope Cloud |

## Security — both guardrails verified live

Default-deny origin policy, tested against the AWS metadata endpoint:

```json
{ "ok": false,
  "error": "capture refused: link-local/metadata range is blocked even when configured" }
```

Path containment, tested with traversal:

```json
{ "ok": false, "error": "target path must stay inside the project" }
```

Both refusals were written to `.bridge/.mcp-audit.log` with timestamp, tool,
verdict, target and reason:

```
2026-08-05T08:39:37.505Z  compare  REFUSED  http://169.254.169.254/latest/meta-data/  link-local/metadata range is blocked even when configured
2026-08-05T08:39:37.506Z  compare  REFUSED  ../../../../etc/passwd                    target path escapes the project
```

Refusals are named, never silent. This is the differentiator against "just let
the agent run a screenshot script".

## Version skew worth fixing

`normascope-mcp@0.2.0` depends on `norma-scope@^0.7.0`. This machine had
**0.7.0** installed while the repo was at 0.7.3, and 0.7.0's `parseConfig`
**rejects a baseline-only config** — one with neither `figmaFileKey` nor a
`source` block, which 0.7.3 accepts. The symptom is misleading:

```json
{ "ok": false, "error": "no valid .bridge/config.json — run `npx norma-scope init`..." }
```

on a config the CLI itself parses fine. Installing 0.7.3 fixed it. A fresh
install resolves `^0.7.0` to 0.7.3 so most users never see this, but anyone
with a pinned or stale 0.7.0 gets told their working config is invalid. Worth
either bumping the floor to `^0.7.3` or making the error name the actual
validation failure.

## Reproducing

```json
{
  "mcpServers": {
    "normascope": {
      "command": "npx",
      "args": ["-y", "normascope-mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

| | |
|---|---|
| `session.txt` | full tool walkthrough incl. both security refusals |
| `agent-loop.txt` | the four-step loop above |
| `jsonrpc-transcript.json` | raw request/response for the walkthrough |
| `agent-loop-transcript.json` | raw request/response for the loop |
