// SPDX-License-Identifier: LGPL-2.1-or-later
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertActionCloseButton } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState/index.js";
import { Form, FormGroup } from "@patternfly/react-core/dist/esm/components/Form/index.js";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core/dist/esm/components/Modal/index.js";
import { Page } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import cockpit from "cockpit";
import { browserAction, DEFAULT_SETTINGS, type BrowserSettings, type BrowserStatus } from "./api.js";
import { VncSurface } from "./vnc.js";

const _ = cockpit.gettext;
const statusText = () => ({ stopped: _("Stopped"), starting: _("Starting"), running: _("Running"), error: _("Failed") });
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export const Application = () => {
    const [status, setStatus] = useState<BrowserStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [draft, setDraft] = useState<BrowserSettings | null>(null);
    const [notice, setNotice] = useState<{ variant: "danger" | "success"; title: string } | null>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const mounted = useRef(true);
    const refresh = useCallback(async () => {
        try {
            const result = await browserAction("status");
            if (mounted.current) setStatus(result);
        } catch (error) {
            if (mounted.current) setNotice({ variant: "danger", title: messageOf(error) });
        }
    }, []);
    useEffect(() => {
        mounted.current = true;
        refresh();
        const timer = window.setInterval(refresh, 5000);
        return () => { mounted.current = false; window.clearInterval(timer) };
    }, [refresh]);

    const perform = async (action: "start" | "stop") => {
        setBusy(true);
        setNotice(null);
        try {
            const result = await browserAction(action);
            if (mounted.current) setStatus(result);
        } catch (error) {
            if (mounted.current) setNotice({ variant: "danger", title: messageOf(error) });
            await refresh();
        } finally {
            if (mounted.current) setBusy(false);
        }
    };
    const save = async () => {
        if (!draft) return;
        setBusy(true);
        try {
            const result = await browserAction("settings", draft);
            setStatus(result);
            setDraft(null);
            setNotice({ variant: "success", title: _("Settings saved. Restart the session to apply homepage, size and timeout changes.") });
        } catch (error) {
            setNotice({ variant: "danger", title: messageOf(error) });
        } finally {
            setBusy(false);
        }
    };
    const fullscreen = () => {
        surfaceRef.current?.requestFullscreen().catch(error => setNotice({ variant: "danger", title: messageOf(error) }));
    };
    const running = status?.state === "running" && !!status.socket;
    const failedChecks = status?.checks.filter(check => !check.ok) ?? [];

    return (
        <Page className="browser-page pf-m-no-sidebar">
            <div className="browser-shell">
                <div className="browser-toolbar" data-testid="remote-toolbar">
                    <div className="browser-state-copy">
                        <Title headingLevel="h1">{_("Browser")}</Title>
                        {status && <Label color={running ? "green" : "grey"}>{statusText()[status.state]}</Label>}
                    </div>
                    <div className="browser-actions">
                        {running && <Button variant="secondary" onClick={fullscreen}>{_("Fullscreen")}</Button>}
                        {running && <Button variant="secondary" isDisabled={busy} onClick={() => perform("stop")}>{_("Stop browser")}</Button>}
                        {!running && (
                            <Button
                                data-testid="start-browser" variant="primary" isDisabled={busy || !status?.ready}
                                      isLoading={busy} onClick={() => perform("start")}
                            >{_("Start browser")}
                            </Button>
                        )}
                        <Button
                            variant="secondary" isDisabled={!status || busy}
                                onClick={() => setDraft({ ...status!.settings })}
                        >{_("Settings")}
                        </Button>
                        <Button variant="link" isDisabled={busy} onClick={refresh}>{_("Refresh")}</Button>
                    </div>
                </div>
                {notice && (
                    <Alert
isInline variant={notice.variant} title={notice.title}
                                  actionClose={<AlertActionCloseButton onClose={() => setNotice(null)} />}
                    />
                )}
                {status?.error && <Alert isInline variant="danger" title={status.error} />}
                {failedChecks.length > 0 && (
                    <Card>
                        <CardBody>
                            <Title headingLevel="h2">{_("Finish setting up the browser")}</Title>
                            <p>{_("Install the missing dependencies, then refresh this page.")}</p>
                            <ul>{failedChecks.map(check => <li key={check.id}><strong>{check.label}</strong>: {check.detail}</li>)}</ul>
                        </CardBody>
                    </Card>
                )}
                {!status && !notice && <Spinner aria-label={_("Checking browser")} />}
                {running && status?.socket && <VncSurface ref={surfaceRef} socket={status.socket} quality={status.settings.quality} />}
                {!running && (
                    <Card className="browser-empty-card">
                        <CardBody>
                            <EmptyState titleText={busy ? _("Preparing your browser…") : _("A browser on your server")} headingLevel="h2">
                                <EmptyStateBody>
                                    {_("Use a full browser with tabs and an address bar. Your profile and downloads stay on this server.")}
                                </EmptyStateBody>
                            </EmptyState>
                        </CardBody>
                    </Card>
                )}
                {status?.downloads && (
                    <details className="browser-downloads">
                        <summary>{_("Downloads and session details")}</summary>
                        <p>{_("Downloads are saved to")} <code>{status.downloads}</code></p>
                        <p>{_("Use Cockpit Files to transfer files between this server and your computer.")}</p>
                        <p>{_("Disconnecting keeps the browser running until the configured timeout. Stopping keeps your saved browser data.")}</p>
                        <p>{_("Other windows signed in as this user share this browser session.")}</p>
                    </details>
                )}
            </div>
            <Modal isOpen={draft !== null} onClose={() => setDraft(null)} variant="small" aria-labelledby="settings-title">
                <ModalHeader title={_("Browser settings")} labelId="settings-title" />
                <ModalBody>
                    {notice?.variant === "danger" && <Alert isInline variant="danger" title={notice.title} />}
                    {draft && (
                        <Form>
                            <FormGroup label={_("Homepage")} fieldId="homepage">
                                <TextInput
                                    id="homepage" value={draft.homepage}
                                       onChange={(_event, value) => setDraft({ ...draft, homepage: value })}
                                />
                            </FormGroup>
                            <FormGroup label={_("Display size")} fieldId="width">
                                <div className="browser-size-fields">
                                    <TextInput
                                        id="width" aria-label={_("Width")} type="number" min={800} max={3840}
                                           value={draft.width} onChange={(_event, value) => setDraft({ ...draft, width: Number(value) })}
                                    />
                                    <span>×</span>
                                    <TextInput
                                        id="height" aria-label={_("Height")} type="number" min={600} max={2160}
                                           value={draft.height} onChange={(_event, value) => setDraft({ ...draft, height: Number(value) })}
                                    />
                                </div>
                            </FormGroup>
                            <FormGroup label={_("Image quality")} fieldId="quality">
                                <FormSelect
                                    id="quality" value={draft.quality}
                                        onChange={(_event, value) => setDraft({ ...draft, quality: value as BrowserSettings["quality"] })}
                                >
                                    <FormSelectOption value="balanced" label={_("Balanced")} />
                                    <FormSelectOption value="sharp" label={_("Sharp")} />
                                    <FormSelectOption value="low" label={_("Low bandwidth")} />
                                </FormSelect>
                            </FormGroup>
                            <FormGroup label={_("Stop when no windows are connected")} fieldId="idle">
                                <FormSelect
                                    id="idle" value={draft.idle_minutes}
                                        onChange={(_event, value) => setDraft({ ...draft, idle_minutes: Number(value) })}
                                >
                                    <FormSelectOption value={0} label={_("Keep running")} />
                                    <FormSelectOption value={30} label={_("30 minutes")} />
                                    <FormSelectOption value={60} label={_("1 hour")} />
                                </FormSelect>
                            </FormGroup>
                        </Form>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button variant="primary" isDisabled={busy} onClick={save}>{_("Save")}</Button>
                    <Button variant="link" onClick={() => setDraft(null)}>{_("Cancel")}</Button>
                    <Button variant="link" onClick={() => setDraft({ ...DEFAULT_SETTINGS })}>{_("Restore defaults")}</Button>
                </ModalFooter>
            </Modal>
        </Page>
    );
};
