// SPDX-License-Identifier: MIT

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
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

const DISPLAY_CHOICES: Choices = [
    ['usage', 'Usage'],
    ['remaining', 'Remaining'],
];

const LIMITS_CHOICES: Choices = [
    ['both', '5-hour and Weekly'],
    ['short', '5-hour Only'],
    ['long', 'Weekly Only'],
];

const SERVICES = [
    {id: 'claude', title: 'Claude Code', file: '~/.claude/.credentials.json'},
    {id: 'codex', title: 'Codex', file: '~/.codex/auth.json'},
];

// The allowed range of a number setting lives in the schema
function keyRange(settings: Gio.Settings, key: string): [number, number] {
    const [, range] = settings.settings_schema.get_key(key).get_range().recursiveUnpack() as [string, [number, number]];
    return range;
}

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

function switchRow(settings: Gio.Settings, key: string, title: string, subtitle = ''): Adw.SwitchRow {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function intervalRow(settings: Gio.Settings, key: string): Adw.SpinRow {
    const [min, max] = keyRange(settings, key);
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.title = 'Refresh Interval';
    row.subtitle = `Minutes between updates, ${min} to ${max}`;
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function sliderRow(settings: Gio.Settings, key: string, title: string): Adw.ActionRow {
    const [min, max] = keyRange(settings, key);
    const slider = new Gtk.Scale({
        adjustment: new Gtk.Adjustment({lower: min, upper: max, step_increment: 1}),
        round_digits: 0,
        digits: 0,
        draw_value: true,
        value_pos: Gtk.PositionType.RIGHT,
        hexpand: true,
        valign: Gtk.Align.CENTER,
    });
    settings.bind(key, slider.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
    const row = new Adw.ActionRow({title, subtitle: 'Pixels'});
    row.add_suffix(slider);
    return row;
}

function colorRow(settings: Gio.Settings, key: string): Adw.ActionRow {
    const rgba = new Gdk.RGBA();
    rgba.parse(settings.get_string(key));
    const button = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog({with_alpha: false}),
        rgba,
        valign: Gtk.Align.CENTER,
    });
    button.connect('notify::rgba', () => settings.set_string(key, button.rgba.to_string()));
    const row = new Adw.ActionRow({
        title: 'Color',
        subtitle: 'Bars turn yellow at 70% and red at 90% used',
        activatable_widget: button,
    });
    row.add_suffix(button);
    return row;
}

export default class AiUsagePreferences extends ExtensionPreferences {
    override async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        const settings = this.getSettings();
        window.add(this._servicesPage(settings));
        window.add(this._appearancePage(settings));
        window.add(this._aboutPage(window));
        window.set_default_size(640, 860);
    }

    private _servicesPage(settings: Gio.Settings): Adw.PreferencesPage {
        const page = new Adw.PreferencesPage({title: 'Services', icon_name: 'network-server-symbolic'});
        for (const {id, title, file} of SERVICES) {
            const group = new Adw.PreferencesGroup({title, description: `Uses the login in ${file}`});
            group.add(comboRow(settings, `${id}-show`, SHOW_CHOICES, 'Show'));
            group.add(comboRow(settings, `${id}-display`, DISPLAY_CHOICES, 'Display',
                'Usage fills the bars, remaining empties them'));
            group.add(intervalRow(settings, `${id}-refresh-interval`));
            page.add(group);
        }
        return page;
    }

    private _appearancePage(settings: Gio.Settings): Adw.PreferencesPage {
        const page = new Adw.PreferencesPage({title: 'Appearance', icon_name: 'applications-graphics-symbolic'});

        const topBar = new Adw.PreferencesGroup({title: 'General', description: 'What the top bar shows'});
        topBar.add(switchRow(settings, 'show-names', 'Show Service Names'));
        topBar.add(switchRow(settings, 'show-text', 'Show Usage Text', 'Percentages, like 19%/18%'));
        topBar.add(switchRow(settings, 'show-bars', 'Show Bars',
            'One small bar per limit, the 5-hour limit on top'));
        for (const [key, title] of [['bar-length', 'Bar Length'], ['bar-thickness', 'Bar Thickness']]) {
            const row = sliderRow(settings, key, title);
            settings.bind('show-bars', row, 'sensitive', Gio.SettingsBindFlags.GET);
            topBar.add(row);
        }
        topBar.add(switchRow(settings, 'always-show-app-icon', 'Always Show App Icon',
            'Otherwise it only appears when the top bar has nothing else to show'));
        page.add(topBar);

        for (const {id, title} of SERVICES) {
            const group = new Adw.PreferencesGroup({title});
            group.add(comboRow(settings, `${id}-panel-limits`, LIMITS_CHOICES, 'Top Bar Limits'));
            group.add(colorRow(settings, `${id}-color`));
            page.add(group);
        }
        return page;
    }

    private _aboutPage(window: Adw.PreferencesWindow): Adw.PreferencesPage {
        const page = new Adw.PreferencesPage({title: 'About', icon_name: 'help-about-symbolic'});
        const group = new Adw.PreferencesGroup({
            title: this.metadata.name,
            description: `Version ${this.metadata['version-name']}. Not affiliated with Anthropic or OpenAI.`,
        });
        page.add(group);

        const url = this.metadata.url;
        if (!url)
            return page;

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
        return page;
    }
}
