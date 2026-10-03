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

## Rate limits

Neither endpoint documents a rate limit and neither sends rate limit headers.

- **Claude:** users report HTTP 429 after about 5 requests per access token,
  even when polling every 30 to 120 s, and the throttle resetting after about
  3 to 5 minutes ([#30930](https://github.com/anthropics/claude-code/issues/30930),
  [#31021](https://github.com/anthropics/claude-code/issues/31021)).
  Requests that claim to be Claude Code reportedly get a looser limit; the
  extension does not fake its User-Agent.
- **Codex:** the Codex CLI itself polls `/wham/usage` every 60 s.

So every service has its own timer: Claude 5 to 120 minutes, Codex 1 to 120,
both 10 by default. A 429 is shown as "Too many requests" in the menu.

## Why tokens are never refreshed

Both CLIs use rotating refresh tokens. If the extension refreshed a token, the
CLI's stored refresh token would become invalid and the user would be logged
out of the CLI. The extension therefore only reads the access token and asks
the user to run the CLI when it has expired (HTTP 401).
