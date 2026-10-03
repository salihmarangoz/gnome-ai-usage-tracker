# Security Policy

AI Usage Tracker reads the login tokens of the Claude Code and Codex command
line tools, so security problems in it can expose access to your AI accounts.
Please report them privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:
**[Report a vulnerability](https://github.com/salihmarangoz/gnome-ai-usage-tracker/security/advisories/new)**
(Security tab → *Report a vulnerability*).

Please do not open a public issue for security problems. Include the
extension version (Settings → About), your GNOME Shell version and the steps
to reproduce.

This is a personal project maintained in spare time, so reports are handled
on a best-effort basis. Fixes are released from this repository. The
extension comes without any warranty; see the Disclaimer in the README.

## Supported versions

Only the latest version on the `main` branch gets security fixes.

## What the extension does with your tokens

- It reads the access token from `~/.claude/.credentials.json` and
  `~/.codex/auth.json` (or `$CLAUDE_CONFIG_DIR` and `$CODEX_HOME`) each time
  it checks usage, and keeps it only for that request.
- It sends each token only to the service that issued it, over HTTPS:
  `api.anthropic.com` for Claude Code and `chatgpt.com` for Codex.
- It never writes, refreshes, logs or stores tokens, and makes no other
  network requests. There is no telemetry.

The extension runs inside GNOME Shell with your user's permissions. Anyone who
can change its files can change what it does with your tokens, so install it
only from this repository and review the code you install.

## Scope

In scope:

- tokens sent anywhere other than the issuing service, or written to disk or
  logs
- requests that are not encrypted or not checked
- anything that lets other users or processes read your tokens through the
  extension

Out of scope:

- the Claude Code and Codex CLIs, their VS Code extensions and the usage
  endpoints themselves. Report those to
  [Anthropic](https://www.anthropic.com/responsible-disclosure-policy) or
  [OpenAI](https://openai.com/policies/coordinated-vulnerability-disclosure-policy).
- other GNOME Shell extensions or GNOME Shell itself
