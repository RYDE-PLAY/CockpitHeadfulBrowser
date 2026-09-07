// SPDX-License-Identifier: LGPL-2.1-or-later
import cockpit from "cockpit";

export type BrowserSettings = { homepage: string; width: number; height: number; quality: "balanced" | "sharp" | "low"; idle_minutes: number };
export type BrowserCheck = { id: string; label: string; ok: boolean; detail: string };
export type BrowserStatus = { ok: true; state: "stopped" | "running" | "starting" | "error"; ready: boolean; checks: BrowserCheck[]; settings: BrowserSettings; socket: string | null; downloads: string; error?: string | null };
export const DEFAULT_SETTINGS: BrowserSettings = { homepage: "about:blank", width: 1440, height: 900, quality: "balanced", idle_minutes: 30 };

export async function browserAction(action: "status" | "start" | "stop" | "settings", settings?: BrowserSettings): Promise<BrowserStatus> {
    const args = ["/usr/libexec/cockpit-browser/session.py", action];
    if (action === "settings") args.push(JSON.stringify(settings ?? DEFAULT_SETTINGS));
    const output = await cockpit.spawn(args, { superuser: null, err: "message" });
    let response: BrowserStatus | { ok: false; error: string; code?: string };
    try { response = JSON.parse(output) } catch { throw new Error(String(output) || "The browser service returned invalid data") }
    if (!response.ok) throw new Error(response.error || "The browser service failed");
    return response;
}
