UUID = ai-usage-tracker@salihmarangoz.github.io
ZIP = dist/$(UUID).shell-extension.zip
SHEXLI = $(shell command -v shexli || echo .venv/bin/shexli)

.PHONY: build pack install lint version release clean

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
