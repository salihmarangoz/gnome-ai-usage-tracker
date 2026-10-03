// SPDX-License-Identifier: MIT

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

type Choices = [value: string, label: string][];

const SHOW_CHOICES: Choices = [
    ['both', 'Top Bar and Menu'],
    ['panel', 'Top Bar Only'],
    ['menu', 'Menu Only'],
    ['off', 'Disabled'],
];

const ICON_STYLE_CHOICES: Choices = [
    ['gauge', 'Gauge'],
    ['bars', 'Bars'],
];

const DISPLAY_CHOICES: Choices = [
    ['usage', 'Usage'],
    ['remaining', 'Remaining'],
];

const SERVICES = [
    {id: 'claude', title: 'Claude Code', file: '~/.claude/.credentials.json'},
    {id: 'codex', title: 'Codex', file: '~/.codex/auth.json'},
];

function comboRow(settings: Gio.Settings, key: string, choices: Choices, title: string, subtitle = ''): Adw.ComboRow {
    const row = new Adw.ComboRow({
        title,
        subtitle,
        model: Gtk.StringList.new(choices.map(([, label]) => label)),
        selected: choices.findIndex(([value]) => value === settings.get_string(key)),
    });
    row.connect('notify::selected', () => settings.set_string(key, choices[row.selected][0]));
    return row;
}

function intervalRow(settings: Gio.Settings, key: string): Adw.SpinRow {
    // The allowed range lives in the schema
    const range = settings.settings_schema.get_key(key).get_range().recursiveUnpack() as [string, [number, number]];
    const [, [min, max]] = range;
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.title = 'Refresh Interval';
    row.subtitle = `Minutes between updates, ${min} to ${max}`;
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

export default class AiUsagePreferences extends ExtensionPreferences {
    override async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();

        for (const {id, title, file} of SERVICES) {
            const group = new Adw.PreferencesGroup({title, description: `Uses the login in ${file}`});
            group.add(comboRow(settings, `${id}-show`, SHOW_CHOICES, 'Show'));
            group.add(comboRow(settings, `${id}-display`, DISPLAY_CHOICES, 'Display',
                'Usage fills the bars, remaining empties them'));
            group.add(intervalRow(settings, `${id}-refresh-interval`));
            page.add(group);
        }

        page.add(this._generalGroup(settings));
        page.add(this._aboutGroup(window));
        window.add(page);
        window.set_default_size(640, 1040);
    }

    private _generalGroup(settings: Gio.Settings): Adw.PreferencesGroup {
        const group = new Adw.PreferencesGroup({title: 'General'});

        const icon = new Adw.SwitchRow({
            title: 'Show Icon',
            subtitle: 'Always shown when the top bar has nothing else to show',
        });
        settings.bind('show-icon', icon, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(icon);

        const style = comboRow(settings, 'icon-style', ICON_STYLE_CHOICES, 'Icon Style',
            'Bars: 5-hour limit on top, weekly below, for each service');
        settings.bind('show-icon', style, 'sensitive', Gio.SettingsBindFlags.GET);
        group.add(style);

        return group;
    }

    private _aboutGroup(window: Adw.PreferencesWindow): Adw.PreferencesGroup {
        const group = new Adw.PreferencesGroup({
            title: 'About',
            description: `Version ${this.metadata['version-name']}. Not affiliated with Anthropic or OpenAI.`,
        });

        const url = this.metadata.url;
        if (!url)
            return group;

        const links: [string, string, string?][] = [
            ['Source Code', url],
            ['Changelog', `${url}/blob/main/CHANGELOG.md`],
            ['Report an Issue', `${url}/issues`],
            ['License', `${url}/blob/main/LICENSE`, 'MIT'],
        ];
        for (const [title, uri, subtitle = ''] of links) {
            const row = new Adw.ActionRow({title, subtitle, activatable: true});
            row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
            row.connect('activated', () => new Gtk.UriLauncher({uri}).launch(window, null, null));
            group.add(row);
        }

        return group;
    }
}
