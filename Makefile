UUID = ai-usage-tracker@salihmarangoz.github.io
ZIP = dist/$(UUID).shell-extension.zip
SHEXLI = $(shell command -v shexli || echo .venv/bin/shexli)

.PHONY: build pack install install-agy uninstall-agy lint version release clean

node_modules: package.json
	npm install
	@touch node_modules

build: node_modules
	rm -rf build
	npx tsc
	cp -r metadata.json stylesheet.css schemas LICENSE build/

pack: build
	mkdir -p dist
	rm -f $(ZIP)
	cd build && zip -qr ../$(ZIP) .

install: pack
	gnome-extensions install --force $(ZIP)

install-agy:
	install -D -m 755 antigravity/agy-usage-snapshot ~/.local/bin/agy-usage-snapshot
	install -D -m 644 -t ~/.config/systemd/user antigravity/agy-usage.service antigravity/agy-usage.timer
	systemctl --user daemon-reload
	systemctl --user enable --now agy-usage.timer
	~/.local/bin/agy-usage-snapshot --force

uninstall-agy:
	-systemctl --user disable --now agy-usage.timer
	rm -f ~/.config/systemd/user/agy-usage.service ~/.config/systemd/user/agy-usage.timer ~/.local/bin/agy-usage-snapshot
	systemctl --user daemon-reload

lint: pack
	$(SHEXLI) $(ZIP)

version:
	@python3 -c "import json; print(json.load(open('metadata.json'))['version-name'])"

release:
	@test -n "$(VERSION)" || { echo "usage: make release VERSION=1.1"; exit 1; }
	python3 tools/release.py $(VERSION)
	$(MAKE) lint

clean:
	rm -rf build dist
