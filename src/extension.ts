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

// Which limits the top bar shows: the short (5-hour) ones, the long (weekly) ones, or both
type Limits = 'both' | 'short' | 'long';

// Stock theme icons, first one found wins: a gauge, or a question mark
const ICON_NAMES = ['speedometer-symbolic', 'power-profile-balanced-symbolic', 'dialog-question-symbolic'];

const DAY = 24 * 3600;

interface Result {
    usage?: Usage;
    error?: string;
}

interface BarSize {
    length: number;
    thickness: number;
}

function clamp(percent: number): number {
    return Math.min(Math.max(percent, 0), 100);
}

function shownPercent(percent: number, showRemaining: boolean): number {
    return showRemaining ? 100 - clamp(percent) : clamp(percent);
}

function usageBar(percent: number, showRemaining: boolean, color: string, size?: BarSize): St.Widget {
    const sizeStyle = size
        ? `width: ${size.length}px; height: ${size.thickness}px; border-radius: ${size.thickness / 2}px;`
        : '';
    const bar = new St.Widget({
        style_class: 'ai-usage-bar',
        style: sizeStyle,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const fill = new St.Widget({
        style_class: 'ai-usage-bar-fill',
        style: sizeStyle,
        scale_x: shownPercent(percent, showRemaining) / 100,
    });
    // The warning colours override the service colour close to the limit
    if (percent >= 90)
        fill.add_style_class_name('critical');
    else if (percent >= 70)
        fill.add_style_class_name('warning');
    else
        fill.style += `background-color: ${color};`;
    bar.add_child(fill);
    return bar;
}

function topBarWindows({windows}: Usage, limits: Limits): UsageWindow[] {
    const sorted = [...windows].sort((a, b) => a.seconds - b.seconds);
    const picked = sorted.filter(w => limits === 'both' || (limits === 'short') === (w.seconds < DAY));
    // A plan without the chosen limit shows the limits it has
    return picked.length ? picked : sorted;
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

    constructor({name, percent, resetsAt}: UsageWindow, color: string, showRemaining: boolean) {
        super(name, {reactive: false, can_focus: false});
        this.label.add_style_class_name('ai-usage-name');

        this.add_child(usageBar(percent, showRemaining, color));

        this.add_child(new St.Label({
            text: `${Math.round(shownPercent(percent, showRemaining))}% ${showRemaining ? 'left' : 'used'}`,
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
    private _panelItems: St.BoxLayout;
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
        this._panelItems = new St.BoxLayout({style_class: 'ai-usage-panel', visible: false});
        box.add_child(this._panelItems);
        this.add_child(box);

        // The button always creates a real menu, not a PopupDummyMenu
        const menu = this.menu as PopupMenu.PopupMenu;
        this._usageSection = new PopupMenu.PopupMenuSection();
        menu.addMenuItem(this._usageSection);
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._refreshItem = new PopupMenu.PopupMenuItem('Refresh Now');
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
        else if (provider && key.endsWith('-show'))
            this._refresh([provider]);
        else
            this._showResults();
    }

    private _get(provider: Provider, key: string): string {
        return this._settings.get_string(`${provider.id}-${key}`);
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
        await Promise.all(providers.filter(p => this._get(p, 'show') !== 'off').map(async provider => {
            try {
                this._results.set(provider.id, {usage: await provider.fetch(this._session, this._cancellable)});
            } catch (e) {
                this._results.set(provider.id, {error: (e as Error).message});
            }
        }));

        // The indicator was destroyed while the requests were running
        if (this._cancellable.is_cancelled())
            return;

        this._refreshItem.label.text = `Refresh Now (last updated ${formatTime(Date.now() / 1000)})`;
        this._showResults();
    }

    private _showResults() {
        const bars: BarSize | null = this._settings.get_boolean('show-bars')
            ? {length: this._settings.get_uint('bar-length'), thickness: this._settings.get_uint('bar-thickness')}
            : null;
        this._usageSection.removeAll();
        this._panelItems.destroy_all_children();

        for (const provider of PROVIDERS) {
            const show = this._get(provider, 'show') as Show;
            const result = this._results.get(provider.id);
            if (show === 'off' || !result)
                continue;

            if (show === 'both' || show === 'menu')
                this._addMenuSection(provider, result);
            if (show === 'both' || show === 'panel')
                this._addPanelItem(provider, result, bars);
        }

        // The app icon is also shown when the top bar has nothing else to click on
        this._panelItems.visible = this._panelItems.get_n_children() > 0;
        this._icon.visible = !this._panelItems.visible || this._settings.get_boolean('always-show-app-icon');
    }

    private _addPanelItem(provider: Provider, {usage}: Result, bars: BarSize | null) {
        const showRemaining = this._get(provider, 'display') === 'remaining';
        const color = this._get(provider, 'color');
        const windows = usage ? topBarWindows(usage, this._get(provider, 'panel-limits') as Limits) : [];
        const item = new St.BoxLayout({style_class: 'ai-usage-panel-item'});

        if (bars && windows.length) {
            // Shortest limit on top
            const stack = new St.Widget({
                style_class: 'ai-usage-mini',
                layout_manager: new Clutter.BoxLayout({
                    orientation: Clutter.Orientation.VERTICAL,
                    spacing: Math.max(1, Math.round(bars.thickness / 2)),
                }),
                y_align: Clutter.ActorAlign.CENTER,
            });
            for (const w of windows)
                stack.add_child(usageBar(w.percent, showRemaining, color, bars));
            item.add_child(stack);
        }

        const text = [];
        if (this._settings.get_boolean('show-names'))
            text.push(provider.shortName);
        if (this._settings.get_boolean('show-text'))
            text.push(windows.map(w => `${Math.round(shownPercent(w.percent, showRemaining))}%`).join('/') || '–');
        if (text.length)
            item.add_child(new St.Label({text: text.join(' '), y_align: Clutter.ActorAlign.CENTER}));

        // With names, text and bars all off there is nothing to show for this service
        if (item.get_n_children())
            this._panelItems.add_child(item);
        else
            item.destroy();
    }

    private _addMenuSection(provider: Provider, {usage, error}: Result) {
        const plan = usage?.plan ? ` · ${usage.plan[0].toUpperCase()}${usage.plan.slice(1)}` : '';
        this._usageSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(`${provider.name}${plan}`));

        if (!usage) {
            this._usageSection.addMenuItem(
                new PopupMenu.PopupMenuItem(error ?? '', {reactive: false, can_focus: false}));
            return;
        }

        const showRemaining = this._get(provider, 'display') === 'remaining';
        const color = this._get(provider, 'color');
        for (const w of usage.windows)
            this._usageSection.addMenuItem(new UsageItem(w, color, showRemaining));
    }

    override destroy() {
        this._cancellable.cancel();
        this._session.abort();
        this._timeouts.forEach(id => GLib.Source.remove(id));
        this._timeouts.clear();
        super.destroy();
    }
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
