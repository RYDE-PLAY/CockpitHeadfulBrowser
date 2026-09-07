#!/usr/bin/env python3
"""Destructive-ish, user-scoped lifecycle check for cockpit-browser.service.

This script is intentionally opt-in: it does nothing unless invoked with
``--run``.  It only stops/starts the named user service and restores it to
running before exiting.  No settings are written.
"""

import argparse
import json
import os
import socket
import stat
import subprocess
import time
from pathlib import Path

SERVICE = "cockpit-browser.service"
SESSION = "/usr/libexec/cockpit-browser/session.py"
TIMEOUT = 30


class CheckError(RuntimeError):
    pass


def command(*args):
    try:
        return subprocess.run(args, check=False, capture_output=True, text=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired as error:
        raise CheckError(f"timed out: {args[0]}") from error


def session_status():
    result = command(SESSION, "status")
    if result.returncode:
        raise CheckError("session status failed")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise CheckError("session status was not JSON") from error


def service_pid():
    result = command("systemctl", "--user", "show", SERVICE, "--property=MainPID", "--value")
    if result.returncode or not result.stdout.strip().isdigit():
        raise CheckError("could not read service MainPID")
    return int(result.stdout.strip())


def wait_for_state(expected, timeout=TIMEOUT):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            state = session_status()["state"]
        except CheckError:
            state = None
        if state == expected:
            return session_status()
        time.sleep(0.25)
    raise CheckError(f"service did not reach {expected}")


def plugin_browser_pids(profile):
    """Return only PIDs whose argv has this exact plugin profile argument.

    Command lines are read only for this exact filter and never printed.  This
    avoids exposing URLs or unrelated browser sessions in test output.
    """
    needle = f"--user-data-dir={profile}"
    pids = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            argv = (entry / "cmdline").read_bytes().split(b"\0")
        except (FileNotFoundError, PermissionError):
            continue
        if any(needle.encode() in argument for argument in argv):
            pids.append(int(entry.name))
    return pids


def check_socket(socket_path):
    path = Path(socket_path)
    if not path.exists():
        raise CheckError("VNC socket is missing")
    socket_mode = stat.S_IMODE(path.stat().st_mode)
    if socket_mode != 0o600:
        raise CheckError(f"VNC socket mode is {socket_mode:o}, expected 600")
    parent = path.parent
    if stat.S_IMODE(parent.stat().st_mode) != 0o700:
        raise CheckError("VNC socket directory is not mode 700")
    if path.stat().st_uid != os.getuid() or parent.stat().st_uid != os.getuid():
        raise CheckError("VNC socket or directory has the wrong owner")
    client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    client.settimeout(TIMEOUT)
    try:
        client.connect(str(path))
        greeting = client.recv(12)
    finally:
        client.close()
    if not greeting.startswith(b"RFB "):
        raise CheckError("VNC socket did not return an RFB greeting")


def require(condition, message):
    if not condition:
        raise CheckError(message)


def run_lifecycle():
    initial = session_status()
    saved_settings = initial["settings"]
    if initial["state"] != "running":
        command("systemctl", "--user", "start", SERVICE)
        wait_for_state("running")
    running = session_status()
    require(running["state"] == "running", "service is not running")
    first_pid = service_pid()
    require(first_pid > 0, "service has no MainPID")
    check_socket(running["socket"])
    profile = Path(running["downloads"]).parent / "profile"
    browser_before = plugin_browser_pids(profile)
    require(browser_before, "plugin Chromium process was not found")

    command("systemctl", "--user", "start", SERVICE)
    require(service_pid() == first_pid, "repeated start changed service MainPID")

    command("systemctl", "--user", "stop", SERVICE)
    wait_for_state("stopped")
    require(not Path(running["socket"]).exists(), "VNC socket remained after stop")
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline and plugin_browser_pids(profile):
        time.sleep(0.25)
    require(not plugin_browser_pids(profile), "plugin Chromium process remained after stop")

    command("systemctl", "--user", "start", SERVICE)
    restarted = wait_for_state("running")
    require(restarted["settings"] == saved_settings, "settings changed during lifecycle")
    check_socket(restarted["socket"])
    return {"initial_state": initial["state"], "main_pid": first_pid, "settings_preserved": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="run the real service lifecycle check")
    args = parser.parse_args()
    if not args.run:
        parser.error("refusing to touch the service without --run")
    try:
        result = run_lifecycle()
    except Exception as error:
        # Always restore the user service for subsequent UI tests.
        try:
            command("systemctl", "--user", "start", SERVICE)
            wait_for_state("running")
        except Exception as restore_error:
            raise SystemExit(f"FAIL: {error}; restoration also failed: {restore_error}") from error
        raise SystemExit(f"FAIL: {error}; service restored to running") from error
    print(json.dumps({"ok": True, **result}, sort_keys=True))


if __name__ == "__main__":
    main()
