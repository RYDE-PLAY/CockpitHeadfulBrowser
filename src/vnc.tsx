// SPDX-License-Identifier: LGPL-2.1-or-later
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { TextArea } from "@patternfly/react-core/dist/esm/components/TextArea/index.js";
import cockpit from "cockpit";
import type RFB from "@novnc/novnc";
import type { BrowserSettings } from "./api.js";

const _ = cockpit.gettext;
type SurfaceProps = { socket: string; quality: BrowserSettings["quality"] };

export const VncSurface = forwardRef<HTMLDivElement, SurfaceProps>(({ socket, quality }, forwardedRef) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const rfbRef = useRef<RFB | null>(null);
    const qualityRef = useRef(quality);
    const [connected, setConnected] = useState(false);
    const [clipboardOpen, setClipboardOpen] = useState(false);
    const [clipboard, setClipboard] = useState("");
    const [connectionError, setConnectionError] = useState("");
    const [generation, setGeneration] = useState(0);
    useImperativeHandle(forwardedRef, () => rootRef.current!);

    useEffect(() => {
        qualityRef.current = quality;
        if (rfbRef.current) applyQuality(rfbRef.current, quality);
    }, [quality]);

    useEffect(() => {
        let disposed = false;
        let retries = 0;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        setConnected(false);
        const connect = async () => {
            let RfbConstructor;
            try {
                // noVNC probes video decoders asynchronously. Do not make the
                // Cockpit page initialization depend on that probe completing.
                RfbConstructor = (await import("@novnc/novnc")).default;
            } catch (error) {
                if (!disposed) setConnectionError(String(error));
                return;
            }
            if (disposed || !canvasRef.current) return;
            const payload = { payload: "stream", binary: "raw", unix: socket, host: cockpit.transport.host };
            const bytes = new TextEncoder().encode(JSON.stringify(payload));
            const query = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(""));
            const url = cockpit.transport.uri("channel/" + cockpit.transport.csrf_token) + "?" + query;
            const rfb = new RfbConstructor(canvasRef.current, url, { shared: true });
            rfbRef.current = rfb;
            rfb.scaleViewport = true;
            rfb.resizeSession = false;
            applyQuality(rfb, qualityRef.current);
            rfb.addEventListener("connect", () => {
                if (disposed) return;
                setConnected(true);
                setConnectionError("");
            });
            rfb.addEventListener("disconnect", () => {
                if (disposed) return;
                setConnected(false);
                if (retries < 3) {
                    retries += 1;
                    retryTimer = setTimeout(connect, retries * 1000);
                } else {
                    setConnectionError(_("Connection lost. Reconnect to continue your session."));
                }
            });
            rfb.addEventListener("clipboard", event => {
                if (!disposed) setClipboard((event as CustomEvent<{ text: string }>).detail.text);
            });
            rfb.addEventListener("securityfailure", () => {
                if (!disposed) setConnectionError(_("The graphical session refused this connection."));
            });
        };
        cockpit.transport.wait(connect);
        return () => {
            disposed = true;
            clearTimeout(retryTimer);
            rfbRef.current?.disconnect();
            rfbRef.current = null;
        };
    }, [socket, generation]);

    const shortcut = (key: number, code: string) => {
        const rfb = rfbRef.current;
        if (!rfb || !connected) return;
        rfb.focus();
        rfb.sendKey(0xffe3, "ControlLeft", true);
        rfb.sendKey(key, code, true);
        rfb.sendKey(key, code, false);
        rfb.sendKey(0xffe3, "ControlLeft", false);
    };
    const paste = () => {
        rfbRef.current?.clipboardPasteFrom(clipboard);
        shortcut(0x76, "KeyV");
    };

    return (
        <div ref={rootRef} className="browser-vnc">
            <div className="browser-vnc-actions">
                <span role="status">{connected ? _("Connected") : _("Connecting…")}</span>
                <Button
                    data-testid="remote-address-focus" variant="secondary" isDisabled={!connected}
                        onClick={() => shortcut(0x6c, "KeyL")}
                >
                    {_("Focus address bar")}
                </Button>
                <Button variant="link" onClick={() => setClipboardOpen(!clipboardOpen)}>
                    {_("Clipboard")}
                </Button>
                <Button variant="link" onClick={() => setGeneration(value => value + 1)}>
                    {_("Reconnect")}
                </Button>
            </div>
            {connectionError && <Alert isInline variant="warning" title={connectionError} />}
            {clipboardOpen && (
                <div className="browser-clipboard">
                    <TextArea
                        aria-label={_("Clipboard text")} value={clipboard}
                              onChange={(_event, value) => setClipboard(value)}
                    />
                    <Button variant="secondary" isDisabled={!connected || !clipboard} onClick={paste}>
                        {_("Paste into browser")}
                    </Button>
                    <p>{_("Remote copied text appears here. Select it to copy it to your computer.")}</p>
                </div>
            )}
            <div data-testid="remote-canvas" className="browser-vnc-canvas" ref={canvasRef} />
        </div>
    );
});
VncSurface.displayName = "VncSurface";

function applyQuality(rfb: RFB, quality: BrowserSettings["quality"]) {
    rfb.qualityLevel = quality === "sharp" ? 9 : quality === "low" ? 3 : 6;
    rfb.compressionLevel = quality === "low" ? 6 : 2;
}
