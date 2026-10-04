# Development

## Files

The extension is written in TypeScript. `tsc` compiles `src/*.ts` to
`build/*.js` (ES2022, readable output), the static files are copied next to
them, and the zip is packed from `build/`.

| File | Purpose |
| --- | --- |
| `metadata.json` | Extension metadata (uuid, supported shell versions, schema id) |
| `src/extension.ts` | Top bar indicator and menu (runs inside GNOME Shell) |
| `src/usage.ts` | Reads the CLI tokens and fetches usage; no Shell imports, so it can run in plain `gjs` |
| `src/prefs.ts` | Preferences window (GTK4 / libadwaita, separate process) |
| `src/ambient.d.ts` | Pulls in the GJS and GNOME Shell type definitions |
| `schemas/*.gschema.xml` | Settings: per service `<id>-show` (`both`, `panel`, `menu`, `off`), `<id>-display` (`usage`, `remaining`), `<id>-refresh-interval`, `<id>-panel-limits` (`both`, `short`, `long`), `<id>-color`; plus `show-names`, `show-text`, `show-bars`, `bar-length`, `bar-thickness`, `always-show-app-icon` |
| `stylesheet.css` | Menu row and usage bar styling |

Not shipped in the zip:

| File | Purpose |
| --- | --- |
| `package.json`, `tsconfig.json` | TypeScript compiler and type packages |
| `tools/release.py` | Sets `version-name` and dates the changelog (`make release`) |
| `tools/release_notes.py` | Prints one version's CHANGELOG section (release notes) |
| `.github/workflows/release.yml` | Builds the zip and publishes a GitHub release for every `v*` tag |
| `CHANGELOG.md` | Release notes, newest first |

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the data is fetched.

## Commands

Needs Node.js (for `tsc`); `make` runs `npm install` the first time.

```sh
make build     # tsc + static files into build/
npm run check  # type-check only
make pack      # dist/<uuid>.shell-extension.zip (zip of build/)
make install   # pack + gnome-extensions install --force
make lint      # pack + shexli (EGO static analyzer)
make version   # print the current version
make release VERSION=1.1   # set the version, date the changelog, lint
make clean     # remove build/ and dist/
```

`make lint` needs [shexli](https://pypi.org/project/shexli/):

```sh
python3 -m venv .venv && . .venv/bin/activate && pip install -U shexli
```

## Testing changes

GNOME Shell only reloads extension code on restart.

- **X11:** <kbd>Alt</kbd>+<kbd>F2</kbd>, `r`, <kbd>Enter</kbd>
- **Wayland:** log out and in, or run a nested shell:
  `dbus-run-session -- gnome-shell --nested --wayland`

The first install also needs a restart before `gnome-extensions enable` finds
the extension.

Useful commands:

```sh
journalctl -f -o cat /usr/bin/gnome-shell        # extension errors
gnome-extensions prefs ai-usage-tracker@salihmarangoz.github.io
gnome-extensions info ai-usage-tracker@salihmarangoz.github.io
```

The compiled `build/usage.js` can be tested on its own after `make build`:

```js
// test.js in the repo root — run with: gjs -m test.js
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';
import {PROVIDERS} from './build/usage.js';

const loop = new GLib.MainLoop(null, false);
const session = new Soup.Session();
Promise.all(PROVIDERS.map(p => p.fetch(session, new Gio.Cancellable())
    .then(r => print(p.name, JSON.stringify(r)))
    .catch(e => print(p.name, e.message))))
    .finally(() => loop.quit());
loop.run();
```

## Types

Types come from [`@girs`](https://github.com/gjsify/ts-for-gir). The
`@girs/gnome-shell` 46 packages have inconsistent dependency ranges (several
copies of the Gio types get installed and conflict), so the project uses the
50.x types, whose dependencies are consistent. The oldest supported runtime is
still GNOME 46: check every new API against the GNOME 46 sources and test on 46.

Known gaps in the types, worked around in the code:

- `PopupBaseMenuItem` is not exported; menu rows extend `PopupMenuItem`.
- `PopupMenuBase.addAction()` is typed as returning `void`.
- `Soup.Status.TOO_MANY_REQUESTS` does not exist in libsoup 3.4 (GNOME 46);
  `429` is a named constant.

## Code style

The code is reviewed by humans on extensions.gnome.org, so keep it small and
plain (see [PUBLISHING.md](PUBLISHING.md)):

- TypeScript in `src/`; never edit `build/`
- 4 spaces, single quotes, trailing commas in multi-line literals
- no `try`/`catch` around APIs that cannot fail
- create everything in `enable()` / the indicator constructor, destroy it in
  `disable()` / `destroy()`
- comments explain *why*, not *what*
