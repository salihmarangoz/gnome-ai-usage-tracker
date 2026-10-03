# CLAUDE.md

GNOME Shell extension (`ai-usage-tracker@salihmarangoz.github.io`) that shows
Claude Code and Codex plan usage in the top bar. License: MIT.

Distributed from GitHub only. The maintainer decided not to publish it on
extensions.gnome.org (EGO) because EGO does not accept AI-generated
extensions (see README → Installation). The code still follows the EGO
review guidelines.

## Project memory

Keep all project knowledge in this repo, not in external memory:

- `CLAUDE.md` — rules for working on the project (this file)
- `docs/architecture.md` — data flow, endpoints, response fields
- `docs/development.md` — files, commands, testing, code style
- `docs/publishing.md` — releases, EGO review checklist (reference), AI policy

Update the relevant doc in the same change when behavior, endpoints, commands
or supported versions change.

## Language

TypeScript, not JavaScript (maintainer's choice). Sources are in `src/*.ts`;
`tsc` compiles them to `build/` and the zip is packed from there. Never edit
`build/` or add hand-written `.js` files. See `docs/development.md` → Types
for the type packages and their known gaps.

## Commands

```sh
make build      # tsc + static files into build/
npm run check   # type-check only
make pack       # build dist/*.zip
make install    # install locally (shell restart needed for new code)
make lint       # shexli (EGO static analyzer), keep it clean
make release VERSION=x.y   # version + changelog + lint
```

Developer machine: GNOME Shell 46 on X11 (Ubuntu). Reload with
Alt+F2 → `r`. Logs: `journalctl -f -o cat /usr/bin/gnome-shell`.

## Rules

- EGO reviewers reject code that looks AI-generated. Write minimal, plain,
  consistent code: no defensive `try`/`catch` around well-defined APIs, no
  unused helpers, no comments that narrate the code or read like prompts, no
  APIs you have not verified in the GNOME Shell sources.
- Follow the review guidelines (summarized in `docs/publishing.md`): create in
  `enable()`, clean up in `disable()`, no sync IO in the shell, no logging spam.
- Never refresh, write or copy the CLI tokens. Only read the access token and
  send it to the service that issued it.
- `shell-version` must only list released GNOME versions; shexli currently
  rejects anything above 50.
- Do not put `gschemas.compiled`, docs, Makefile or other non-runtime files
  in the zip.
- No i18n for now (strings are plain English).
- Each service has its own refresh interval. Claude's minimum is 5 minutes
  because its usage endpoint throttles faster polling, Codex allows 1 minute
  (see `docs/architecture.md`). The ranges live only in the schema; prefs reads
  them from there.
- Types target GNOME 50, the runtime minimum is GNOME 46: verify new APIs
  against GNOME 46 before using them.
- No custom logo or artwork (maintainer's decision). The top bar icon is a
  stock theme icon: `speedometer-symbolic`, else
  `power-profile-balanced-symbolic`, else `dialog-question-symbolic`.
- Add every user-visible change to the Unreleased section of `CHANGELOG.md`.
  The version lives only in `metadata.json` (`version-name`); change it
  with `make release VERSION=x.y`, not by hand.
- Keep the AI Disclosure section in `README.md` accurate.
