// SPDX-License-Identifier: MIT
//
// Reads the OAuth tokens that the Claude Code and Codex CLIs store on disk and
// asks each service for the current plan usage. Tokens are only read, never
// refreshed or written, so the CLIs stay in charge of the login.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Soup.Session.prototype, 'send_and_read_async');

// libsoup 3.4 has no Soup.Status.TOO_MANY_REQUESTS
const TOO_MANY_REQUESTS = 429;

export interface UsageWindow {
    name: string;
    /** Length of the window */
    seconds: number;
    percent: number;
    /** Unix time in seconds */
    resetsAt: number | null;
}

export interface Usage {
    plan: string | null;
    windows: UsageWindow[];
}

export interface Provider {
    id: string;
    name: string;
    shortName: string;
    fetch(session: Soup.Session, cancellable: Gio.Cancellable): Promise<Usage>;
}

interface ClaudeCredentials {
    claudeAiOauth?: {accessToken: string, subscriptionType?: string};
}

interface ClaudeWindow {
    utilization: number;
    resets_at: string | null;
}

interface ClaudeUsage {
    five_hour: ClaudeWindow | null;
    seven_day: ClaudeWindow | null;
}

interface CodexAuth {
    tokens: {access_token: string, account_id: string} | null;
}

interface CodexWindow {
    used_percent: number;
    limit_window_seconds: number;
    reset_at: number;
}

interface CodexUsage {
    plan_type: string | null;
    rate_limit: {primary_window: CodexWindow | null, secondary_window: CodexWindow | null} | null;
}

const decoder = new TextDecoder();

async function readJson<T>(path: string, cancellable: Gio.Cancellable): Promise<T> {
    try {
        const [contents] = await Gio.File.new_for_path(path).load_contents_async(cancellable);
        return JSON.parse(decoder.decode(contents)) as T;
    } catch (e) {
        if (e instanceof GLib.Error && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
            throw new Error('Not signed in');
        throw e;
    }
}

async function getJson<T>(session: Soup.Session, url: string, headers: Record<string, string>,
    cancellable: Gio.Cancellable): Promise<T> {
    const message = Soup.Message.new('GET', url);
    for (const [name, value] of Object.entries(headers))
        message.get_request_headers().append(name, value);

    const bytes = await session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
    const status: number = message.get_status();
    if (status === Soup.Status.UNAUTHORIZED)
        throw new Error('Login expired, run the CLI once to refresh it');
    if (status === TOO_MANY_REQUESTS)
        throw new Error('Too many requests, try again in a few minutes');
    if (status !== Soup.Status.OK)
        throw new Error(`Request failed (HTTP ${status})`);

    return JSON.parse(decoder.decode(bytes.get_data() ?? undefined)) as T;
}

function windowName(seconds: number): string {
    const hours = Math.round(seconds / 3600);
    if (hours === 7 * 24)
        return 'Weekly';
    return hours % 24 ? `${hours}-hour` : `${hours / 24}-day`;
}

const claude: Provider = {
    id: 'claude',
    name: 'Claude Code',
    shortName: 'Claude',

    async fetch(session, cancellable) {
        const dir = GLib.getenv('CLAUDE_CONFIG_DIR') ?? `${GLib.get_home_dir()}/.claude`;
        const {claudeAiOauth: auth} = await readJson<ClaudeCredentials>(`${dir}/.credentials.json`, cancellable);
        if (!auth)
            throw new Error('Not signed in with a Claude subscription');

        const usage = await getJson<ClaudeUsage>(session, 'https://api.anthropic.com/api/oauth/usage', {
            'Authorization': `Bearer ${auth.accessToken}`,
            'anthropic-beta': 'oauth-2025-04-20',
        }, cancellable);

        const windows: [string, number, ClaudeWindow | null][] = [
            ['5-hour', 5 * 3600, usage.five_hour],
            ['Weekly', 7 * 24 * 3600, usage.seven_day],
        ];
        return {
            plan: auth.subscriptionType ?? null,
            windows: windows
                .filter((entry): entry is [string, number, ClaudeWindow] => entry[2] !== null)
                .map(([name, seconds, w]) => ({
                    name,
                    seconds,
                    percent: w.utilization,
                    resetsAt: w.resets_at ? Math.round(Date.parse(w.resets_at) / 1000) : null,
                })),
        };
    },
};

const codex: Provider = {
    id: 'codex',
    name: 'Codex',
    shortName: 'Codex',

    async fetch(session, cancellable) {
        const dir = GLib.getenv('CODEX_HOME') ?? `${GLib.get_home_dir()}/.codex`;
        const {tokens} = await readJson<CodexAuth>(`${dir}/auth.json`, cancellable);
        if (!tokens)
            throw new Error('Not signed in with ChatGPT');

        const usage = await getJson<CodexUsage>(session, 'https://chatgpt.com/backend-api/wham/usage', {
            'Authorization': `Bearer ${tokens.access_token}`,
            'ChatGPT-Account-Id': tokens.account_id,
        }, cancellable);

        const windows = [usage.rate_limit?.primary_window, usage.rate_limit?.secondary_window];
        return {
            plan: usage.plan_type,
            windows: windows
                .filter((w): w is CodexWindow => !!w)
                .map(w => ({
                    name: windowName(w.limit_window_seconds),
                    seconds: w.limit_window_seconds,
                    percent: w.used_percent,
                    resetsAt: w.reset_at,
                })),
        };
    },
};

export const PROVIDERS: Provider[] = [claude, codex];
