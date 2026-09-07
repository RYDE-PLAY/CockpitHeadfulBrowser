// SPDX-License-Identifier: LGPL-2.1-or-later
declare module "@novnc/novnc" {
    export default class RFB extends EventTarget {
        constructor(target: HTMLElement, url: string, options?: { shared?: boolean });
        scaleViewport: boolean;
        resizeSession: boolean;
        viewOnly: boolean;
        qualityLevel: number;
        compressionLevel: number;
        focus(): void;
        disconnect(): void;
        sendKey(keysym: number, code?: string, down?: boolean): void;
        clipboardPasteFrom(text: string): void;
    }
}
