# Architecture

```
GLib timeout per service              Refresh Now menu item
(<id>-refresh-interval)                 (all services)
              \                        /
               UsageIndicator._refresh(providers)
                        |
        PROVIDERS (src/usage.ts), in parallel
          |                             |
  ~/.claude/.credentials.json     ~/.codex/auth.json
          |                             |
  GET api.anthropic.com/          GET chatgpt.com/
      api/oauth/usage                 backend-api/wham/usage
          \                             /
       {plan, windows: [{name, percent, resetsAt}]}
                        |
     top bar label + one menu row per window
```

Each provider returns the same shape:

```js
{
    plan: 'max',               // shown next to the service name
    windows: [
        // seconds: window length (sorts the top bar bars), resetsAt: unix time
        {name: '5-hour', seconds: 18000, percent: 11, resetsAt: 1791071399},
        {name: 'Weekly', seconds: 604800, percent: 16, resetsAt: 1791601199},
    ],
}
```

Errors are thrown as `Error` with a short, user-facing message; the indicator
shows the message in the menu and `–` in the top bar.

Antigravity does not fit this picture: its providers read a local file, see
[Antigravity](#antigravity).

## Claude Code

Credentials: `$CLAUDE_CONFIG_DIR/.credentials.json` (default `~/.claude`)

```json
{"claudeAiOauth": {"accessToken": "...", "refreshToken": "...", "expiresAt": 1791066519491,
                   "subscriptionType": "max", "rateLimitTier": "default_claude_max_20x"}}
```

Request:

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <accessToken>
anthropic-beta: oauth-2025-04-20
```

Fields used from the response:

```json
{
  "five_hour": {"utilization": 11.0, "resets_at": "2026-10-03T23:49:59.925049+00:00"},
  "seven_day": {"utilization": 16.0, "resets_at": "2026-10-10T02:59:59.925066+00:00"}
}
```

The response also has `seven_day_opus`, `seven_day_sonnet`, `extra_usage`, a
generic `limits` array and more. They are not used yet.

## Codex

Credentials: `$CODEX_HOME/auth.json` (default `~/.codex`)

```json
{"auth_mode": "chatgpt", "tokens": {"access_token": "...", "account_id": "...", "id_token": "...", "refresh_token": "..."}}
```

Request:

```
GET https://chatgpt.com/backend-api/wham/usage
Authorization: Bearer <access_token>
ChatGPT-Account-Id: <account_id>
```

Fields used from the response:

```json
{
  "plan_type": "prolite",
  "rate_limit": {
    "primary_window":   {"used_percent": 0, "limit_window_seconds": 604800, "reset_at": 1791670336},
    "secondary_window": null
  }
}
```

Depending on the plan, either window can be `null`. The window name comes from
`limit_window_seconds` (18000 → `5-hour`, 604800 → `Weekly`).

Codex also writes the same numbers into its session logs
(`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, `token_count` events,
`rate_limits` field). That would work offline but is only as fresh as the last
Codex session, so the live endpoint is used instead.

## Antigravity

agy (the Antigravity CLI) keeps its Google login in the system keyring
(Secret Service item "Password for 'antigravity' on 'gemini'", attributes
`service=gemini`, `username=antigravity`). Its access token lasts one hour and
agy refreshes it only while it runs, so a provider that read it would show
"Login expired" most of the time. agy gets its quota from an internal
endpoint (`daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary`)
whose request and response are not documented.

Instead, `antigravity/agy-usage-snapshot` reads agy's own `/usage` screen:

1. Starts `agy --log-file ~/.cache/agy-usage/log/agy.log` in a private tmux
   server (`tmux -L agy-usage`, 200×80, no window) in the empty folder
   `~/.cache/agy-usage/ws`, answers agy's folder trust question there with
   Yes, types `/usage` and waits until the screen stops changing.
2. Parses every `… MODELS` group and its `Weekly` and `Five Hour Limit
   Remaining` rows: the percentage, and `Refreshes in 5d 4h 20m` or `Quota
   available`.
3. Writes `~/.cache/agy-usage/usage.json`, stops the tmux server and removes
   the `/usage` line it added to `~/.gemini/antigravity-cli/history.jsonl`
   (agy shares that up-arrow history between all folders).

During a run agy's log shows only `loadCodeAssist` and `fetchAvailableModels`,
no model request, and no conversation is created.

The `/usage` screen (agy 1.5.17):

```
GEMINI MODELS
  Models within this group: Gemini 4 Neon, Gemini 4 Carbon, Gemini 4 Argon, …
  Weekly Limit Remaining
    [██████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 43.58%
    Refreshes in 5d 4h 20m
  Five Hour Limit Remaining
    [██████████████████████████████████████████████████] 100.00%
    Quota available
CLAUDE AND GPT MODELS
  Models within this group: Claude Opus 5.5, Claude Sonnet 5.5, GPT-OSS 120B
  …
```

The file:

```json
{"updated": 1795624394, "plan": "Google AI Pro", "error": null,
 "groups": [
  {"id": "gemini", "name": "GEMINI", "windows": [
   {"name": "Weekly", "seconds": 604800, "remaining": 43.58, "resetsAt": 1796071574},
   {"name": "5-hour", "seconds": 18000, "remaining": 100.0, "resetsAt": null}]},
  {"id": "claude-and-gpt", "name": "CLAUDE AND GPT", "windows": […]}]}
```

The `agy-gemini` and `agy-claude` providers read the group with their id.
When a run fails the helper keeps the last groups and sets `error`; the
extension shows the old numbers until they are 6 hours old, then the error. A
window whose `resetsAt` has passed is shown as unused until the next reading.

When agy is started: `agy-usage.timer` runs the helper every 10 minutes and 2
minutes after login. It starts agy only when agy was used since the last
reading (newest file in `~/.gemini/antigravity-cli/log`), a `resetsAt` has
passed, the reading is older than 3 hours, or the last try failed (then at
most once an hour unless agy was used). Otherwise it exits in about 40 ms. It
does not start agy while the `login` keyring collection is locked, which is
the case after an automatic login, because agy would show the keyring
password prompt.

## Rate limits

Neither endpoint documents a rate limit and neither sends rate limit headers.

- **Claude:** users report HTTP 429 after about 5 requests per access token,
  even when polling every 30 to 120 s, and the throttle resetting after about
  3 to 5 minutes ([#30930](https://github.com/anthropics/claude-code/issues/30930),
  [#31021](https://github.com/anthropics/claude-code/issues/31021)).
  Requests that claim to be Claude Code reportedly get a looser limit; the
  extension does not fake its User-Agent.
- **Codex:** the Codex CLI itself polls `/wham/usage` every 60 s.
- **Antigravity:** the extension only reads a local file; the helper decides
  when agy runs (see above).

So every service has its own timer: Claude 5 to 120 minutes, Codex 1 to 120,
both 10 by default. A 429 is shown as "Too many requests" in the menu.

## Why tokens are never refreshed

Both CLIs use rotating refresh tokens. If the extension refreshed a token, the
CLI's stored refresh token would become invalid and the user would be logged
out of the CLI. The extension therefore only reads the access token and asks
the user to run the CLI when it has expired (HTTP 401).
