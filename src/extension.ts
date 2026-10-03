// SPDX-License-Identifier: MIT

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {PROVIDERS} from './usage.js';
import type {Provider, Usage, UsageWindow} from './usage.js';

type Show = 'both' | 'panel' | 'menu' | 'off';

// Stock theme icons, first one found wins: a gauge, or a question mark
const ICON_NAMES = ['speedometer-symbolic', 'power-profile-balanced-symbolic', 'dialog-question-symbolic'];

interface Result {
    usage?: Usage;
    error?: string;
}

function formatTime(unixTime: number): string {
    const time = GLib.DateTime.new_from_unix_local(unixTime);
    const today = GLib.DateTime.new_now_local().format('%F');
    return time.format(time.format('%F') === today ? '%H:%M' : '%a %H:%M') ?? '';
}

class UsageItem extends PopupMenu.PopupMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor({name, percent, resetsAt}: UsageWindow, providerId: string, showRemaining: boolean) {
        super(name, {reactive: false, can_focus: false});
        this.label.add_style_class_name('ai-usage-name');

        const used = Math.min(Math.max(percent, 0), 100);
        const shown = showRemaining ? 100 - used : used;

        const bar = new St.Widget({
            style_class: 'ai-usage-bar',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const fill = new St.Widget({
            style_class: `ai-usage-bar-fill ${providerId}`,
            scale_x: shown / 100,
        });
        if (used >= 90)
            fill.add_style_class_name('critical');
        else if (used >= 70)
            fill.add_style_class_name('warning');
        bar.add_child(fill);
        this.add_child(bar);

        this.add_child(new St.Label({
            text: `${Math.round(shown)}% ${showRemaining ? 'left' : 'used'}`,
            style_class: 'ai-usage-percent',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        if (resetsAt) {
            this.add_child(new St.Label({
                text: `resets ${formatTime(resetsAt)}`,
                style_class: 'ai-usage-reset',
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }
    }
}

class UsageIndicator extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    private _settings: Gio.Settings;
    private _session: Soup.Session;
    private _cancellable: Gio.Cancellable;
    private _results = new Map<string, Result>();
    private _timeouts = new Map<string, number>();
    private _icon: St.Icon;
    private _label: St.Label;
    private _usageSection: PopupMenu.PopupMenuSection;
    private _refreshItem: PopupMenu.PopupMenuItem;

    constructor(extension: Extension) {
        super(0.5, extension.metadata.name);

        this._settings = extension.getSettings();
        this._session = new Soup.Session({timeout: 30});
        this._cancellable = new Gio.Cancellable();

        const box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({
            gicon: Gio.ThemedIcon.new_from_names(ICON_NAMES),
            style_class: 'system-status-icon',
        });
        box.add_child(this._icon);
        this._label = new St.Label({y_align: Clutter.ActorAlign.CENTER, visible: false});
        box.add_child(this._label);
        this.add_child(box);

        // The button always creates a real menu, not a PopupDummyMenu
        const menu = this.menu as PopupMenu.PopupMenu;
        this._usageSection = new PopupMenu.PopupMenuSection();
        menu.addMenuItem(this._usageSection);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._refreshItem = new PopupMenu.PopupMenuItem('Refresh');
        this._refreshItem.connect('activate', () => this._refresh(PROVIDERS));
        menu.addMenuItem(this._refreshItem);
        menu.addAction('Settings', () => extension.openPreferences());

        this._settings.connectObject('changed',
            (_settings: Gio.Settings, key: string) => this._onSettingChanged(key), this);

        PROVIDERS.forEach(provider => this._startTimer(provider));
        this._refresh(PROVIDERS);
    }

    private _onSettingChanged(key: string) {
        const provider = PROVIDERS.find(p => key.startsWith(`${p.id}-`));
        if (provider && key.endsWith('-refresh-interval'))
            this._startTimer(provider);
        else if (provider)
            this._refresh([provider]);
        else if (key === 'show-icon')
            this._syncIcon();
        else
            this._showResults();
    }

    private _show(provider: Provider): Show {
        return this._settings.get_string(`${provider.id}-show`) as Show;
    }

    private _startTimer(provider: Provider) {
        const previous = this._timeouts.get(provider.id);
        if (previous)
            GLib.Source.remove(previous);

        const seconds = this._settings.get_uint(`${provider.id}-refresh-interval`) * 60;
        this._timeouts.set(provider.id, GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._refresh([provider]);
            return GLib.SOURCE_CONTINUE;
        }));
    }

    private async _refresh(providers: Provider[]) {
        await Promise.all(providers.filter(p => this._show(p) !== 'off').map(async provider => {
            try {
                this._results.set(provider.id, {usage: await provider.fetch(this._session, this._cancellable)});
            } catch (e) {
                this._results.set(provider.id, {error: (e as Error).message});
            }
        }));

        // The indicator was destroyed while the requests were running
        if (this._cancellable.is_cancelled())
            return;

        this._refreshItem.label.text = `Refresh (updated ${formatTime(Date.now() / 1000)})`;
        this._showResults();
    }

    private _showResults() {
        const showRemaining = this._settings.get_string('display') === 'remaining';
        const panelText: string[] = [];
        this._usageSection.removeAll();

        for (const provider of PROVIDERS) {
            const show = this._show(provider);
            const result = this._results.get(provider.id);
            if (show === 'off' || !result)
                continue;

            if (show === 'both' || show === 'menu')
                this._addMenuSection(provider, result, showRemaining);
            if (show === 'both' || show === 'panel')
                panelText.push(`${provider.shortName} ${panelValue(result, showRemaining)}`);
        }

        this._label.text = panelText.join('  ');
        this._label.visible = panelText.length > 0;
        this._syncIcon();
    }

    private _syncIcon() {
        // Without any text the icon is the only thing left to click on
        this._icon.visible = this._settings.get_boolean('show-icon') || !this._label.visible;
    }

    private _addMenuSection(provider: Provider, {usage, error}: Result, showRemaining: boolean) {
        const plan = usage?.plan ? ` · ${usage.plan[0].toUpperCase()}${usage.plan.slice(1)}` : '';
        this._usageSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(`${provider.name}${plan}`));

        if (!usage) {
            this._usageSection.addMenuItem(
                new PopupMenu.PopupMenuItem(error ?? '', {reactive: false, can_focus: false}));
            return;
        }

        for (const w of usage.windows)
            this._usageSection.addMenuItem(new UsageItem(w, provider.id, showRemaining));
    }

    override destroy() {
        this._cancellable.cancel();
        this._session.abort();
        this._timeouts.forEach(id => GLib.Source.remove(id));
        this._timeouts.clear();
        super.destroy();
    }
}

function panelValue({usage}: Result, showRemaining: boolean): string {
    if (!usage)
        return '–';
    const highest = Math.max(0, ...usage.windows.map(w => w.percent));
    return `${Math.round(showRemaining ? Math.max(100 - highest, 0) : highest)}%`;
}

export default class AiUsageExtension extends Extension {
    private _indicator: UsageIndicator | null = null;

    override enable() {
        this._indicator = new UsageIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    override disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
