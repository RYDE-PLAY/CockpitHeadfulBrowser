#!/usr/bin/python3
"""User-scoped Cockpit browser session. All public commands return JSON.

The VNC endpoint is a mode-0600 Unix socket under a mode-0700 directory.
No privileged browser, TCP VNC listener, or remote debugging port is used.
"""

import fcntl
import json
import os
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

SERVICE = "cockpit-browser.service"
DEFAULTS = {"homepage": "about:blank", "width": 1440, "height": 900, "quality": "balanced", "idle_minutes": 30}


class SessionError(Exception):
    def __init__(self, message, code="session-error"):
        super().__init__(message)
        self.code = code


def private_dir(path):
    """Do not follow an existing symlink or accept another user's directory."""
    path = Path(path)
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid():
        raise SessionError("Session directory is not owned by the current user.", "unsafe-directory")
    path.chmod(0o700)
    return path


def atomic_json(path, value):
    path = Path(path)
    tmp = path.with_name(path.name + "." + secrets.token_hex(6))
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w") as output:
            json.dump(value, output, ensure_ascii=False)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def read_json(path, default):
    try:
        if path.is_symlink():
            raise SessionError("Refusing a symbolic link in session configuration.", "unsafe-file")
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default
    except (json.JSONDecodeError, UnicodeError):
        raise SessionError(
            "Saved settings are invalid. Restore the configuration from backup.", "invalid-json"
        ) from None


def validate_settings(value):
    if not isinstance(value, dict) or set(value) - set(DEFAULTS):
        raise SessionError("Unsupported settings fields.", "invalid-settings")
    result = {**DEFAULTS, **value}
    for name, low, high in (("width", 800, 3840), ("height", 600, 2160), ("idle_minutes", 0, 1440)):
        if type(result[name]) is not int or not low <= result[name] <= high:
            raise SessionError(f"{name} must be an integer from {low} to {high}.", "invalid-settings")
    if result["quality"] not in ("balanced", "sharp", "low"):
        raise SessionError("Choose balanced, sharp, or low quality.", "invalid-settings")
    url = result["homepage"]
    if not isinstance(url, str) or len(url) > 4096 or any(ord(c) < 32 for c in url):
        raise SessionError("Invalid homepage.", "invalid-settings")
    try:
        parsed = urlsplit(url)
        valid = url == "about:blank" or (parsed.scheme in ("http", "https") and bool(parsed.hostname))
    except ValueError:
        valid = False
    if not valid:
        raise SessionError("Homepage must be an http(s) URL or about:blank.", "invalid-settings")
    return result


def execute(args, timeout=10, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, **kwargs)


def find_browser():
    for name in ("chromium", "chromium-browser", "google-chrome-stable", "google-chrome"):
        found = shutil.which(name)
        if found:
            # Ubuntu's /usr/bin/chromium-browser is a Snap launcher too.
            snap = found.startswith("/snap/") or (name == "chromium-browser" and Path("/snap/bin/chromium").exists())
            return found, snap
    if Path("/snap/bin/chromium").exists():
        return "/snap/bin/chromium", True
    return None, False


class Session:
    def __init__(self):
        if os.getuid() == 0 or os.geteuid() != os.getuid():
            raise SessionError("Run the browser as a regular Cockpit user, not root.", "root-not-supported")
        self.home = Path.home()
        self.config_dir = private_dir(self.home / ".config/cockpit-browser")
        self.config_file = self.config_dir / "settings.json"
        self.runtime_root = Path(f"/run/user/{os.getuid()}")
        if not self.runtime_root.is_dir() or self.runtime_root.stat().st_uid != os.getuid():
            raise SessionError(
                "A systemd user login session is required. Log out and log in again.", "no-user-session"
            )
        self.runtime = private_dir(self.runtime_root / "cockpit-browser")
        self.socket = self.runtime / "vnc.sock"
        self.state_file = self.runtime / "state.json"
        self.browser, self.is_snap = find_browser()
        self.data = self.home / (
            "snap/chromium/common/cockpit-browser" if self.is_snap else ".local/share/cockpit-browser"
        )
        self.downloads = self.data / "Downloads"
        self.env = {
            **os.environ,
            "XDG_RUNTIME_DIR": str(self.runtime_root),
            "DBUS_SESSION_BUS_ADDRESS": f"unix:path={self.runtime_root}/bus",
        }

    def systemctl(self, *args):
        return execute(["systemctl", "--user", *args, SERVICE], env=self.env, timeout=40)

    def settings(self):
        saved = read_json(self.config_file, {"version": 1, "settings": DEFAULTS})
        if not isinstance(saved, dict) or saved.get("version") != 1:
            raise SessionError("Settings version is not supported.", "settings-version")
        return validate_settings(saved.get("settings", {}))

    def checks(self):
        items = []
        for name, label in (
            ("Xtigervnc", "Virtual display"),
            ("openbox", "Window manager"),
            ("xauth", "Display authentication"),
            ("xdpyinfo", "Display readiness"),
            ("dbus-daemon", "Session message bus"),
            ("wmctrl", "Window lifecycle"),
        ):
            items.append(
                {
                    "id": name,
                    "label": label,
                    "ok": bool(shutil.which(name)),
                    "detail": "Available" if shutil.which(name) else f"Missing executable: {name}",
                }
            )
        items.append(
            {
                "id": "browser",
                "label": "Browser",
                "ok": bool(self.browser),
                "detail": "Chromium Snap" if self.is_snap else (self.browser or "Install Chromium or Google Chrome"),
            }
        )
        userbus = self.runtime_root.joinpath("bus").exists()
        items.append(
            {
                "id": "user-session",
                "label": "User session",
                "ok": userbus,
                "detail": "Available" if userbus else "Log in with a systemd user session",
            }
        )
        unit = self.systemctl("show", "--property=LoadState", "--value")
        installed = unit.returncode == 0 and unit.stdout.strip() == "loaded"
        items.append(
            {
                "id": "service",
                "label": "Browser service",
                "ok": installed,
                "detail": "Installed" if installed else "Install the cockpit-browser package",
            }
        )
        return items

    def status(self):
        checks = self.checks()
        saved = read_json(self.state_file, {})
        active = self.systemctl("is-active").stdout.strip()
        running = active == "active" and self.socket.exists() and saved.get("state") == "running"
        state = "running" if running else ("starting" if active in ("active", "activating") else "stopped")
        if active == "failed" or (saved.get("state") == "error" and state == "stopped"):
            state = "error"
        return {
            "ok": True,
            "state": state,
            "ready": all(item["ok"] for item in checks),
            "checks": checks,
            "settings": self.settings(),
            "socket": str(self.socket) if running else None,
            "downloads": str(self.downloads),
            "error": saved.get("error") if state == "error" else None,
        }

    def start(self):
        initial = self.status()
        if not initial["ready"]:
            raise SessionError(
                "Install the missing dependencies before starting the browser.", "missing-dependencies"
            )
        if initial["state"] == "running":
            return initial
        execute(["systemctl", "--user", "daemon-reload"], env=self.env)
        result = self.systemctl("start")
        if result.returncode:
            raise SessionError("The user service could not start. Check the browser service journal.", "start-failed")
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            current = self.status()
            if current["state"] == "running":
                return current
            if current["state"] in ("error", "stopped"):
                raise SessionError(current.get("error") or "Browser session stopped during startup.", "start-failed")
            time.sleep(0.3)
        raise SessionError("The browser is still starting. Retry the connection shortly.", "start-timeout")

    def stop(self):
        if self.systemctl("stop").returncode:
            raise SessionError("Could not stop the browser service.", "stop-failed")
        atomic_json(self.state_file, {"state": "stopped"})
        return self.status()

    def save(self, value):
        settings = validate_settings(value)
        atomic_json(self.config_file, {"version": 1, "settings": settings})
        return self.status()

    def run(self):
        lock = open(self.runtime / "session.lock", "a")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SessionError("A browser session is already running.", "already-running") from None
        children = []
        auth = None
        browser = None
        display_env = None
        bus_path = self.runtime / "bus"
        stopping = False

        def stop_signal(_signum, _frame):
            nonlocal stopping
            stopping = True

        signal.signal(signal.SIGTERM, stop_signal)
        signal.signal(signal.SIGINT, stop_signal)
        atomic_json(self.state_file, {"state": "starting"})
        try:
            settings = self.settings()
            # Keep Python as the systemd MainPID so SIGTERM reaches the cleanup
            # handler before the display disappears. Desktop helpers get their
            # own D-Bus; Snap itself needs the real user manager for confinement.
            bus_path.unlink(missing_ok=True)
            bus = subprocess.Popen(
                ["dbus-daemon", "--session", "--nofork", f"--address=unix:path={bus_path}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            children.append(bus)
            for _ in range(50):
                if bus_path.exists():
                    break
                if bus.poll() is not None:
                    raise SessionError("Private desktop message bus failed to start.", "bus-failed")
                time.sleep(0.1)
            else:
                raise SessionError("Private desktop message bus did not become ready.", "bus-timeout")
            private_dir(self.data)
            private_dir(self.downloads)
            profile = private_dir(self.data / "profile")
            default_profile = private_dir(profile / "Default")
            # Seed a new profile once. Existing preferences belong to Chromium;
            # never rewrite them while a surviving browser might still own it.
            if not (default_profile / "Preferences").exists():
                atomic_json(
                    default_profile / "Preferences",
                    {
                        "download": {"default_directory": str(self.downloads), "prompt_for_download": False},
                    },
                )
            # A per-user lock plus the X server's own atomic lock prevents collision.
            display = next(
                (
                    d
                    for d in range(90, 200)
                    if not Path(f"/tmp/.X{d}-lock").exists() and not Path(f"/tmp/.X11-unix/X{d}").exists()
                ),
                None,
            )
            if display is None:
                raise SessionError("No free virtual display is available.", "no-display")
            # Snap's x11 interface permits /run/user/UID/xauth_*; an arbitrary
            # subdirectory is denied even when Unix permissions permit access.
            auth = self.runtime_root / ("xauth_cockpit_browser_" + secrets.token_hex(8))
            auth.touch(mode=0o600, exist_ok=False)
            if execute(
                ["xauth", "-f", str(auth), "add", f":{display}", "MIT-MAGIC-COOKIE-1", secrets.token_hex(16)]
            ).returncode:
                raise SessionError("Cannot prepare display authentication.")
            self.socket.unlink(missing_ok=True)
            vnc = subprocess.Popen(
                [
                    "Xtigervnc",
                    f":{display}",
                    "-auth",
                    str(auth),
                    "-geometry",
                    f"{settings['width']}x{settings['height']}",
                    "-depth",
                    "24",
                    "-rfbport",
                    "-1",
                    "-rfbunixpath",
                    str(self.socket),
                    "-rfbunixmode",
                    "0600",
                    "-SecurityTypes",
                    "None",
                    "-localhost",
                    "-nolisten",
                    "tcp",
                    "-MaxDisconnectionTime",
                    str(settings["idle_minutes"] * 60),
                    "-desktop",
                    "Cockpit Browser",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            children.append(vnc)
            env = {
                **os.environ,
                "DBUS_SESSION_BUS_ADDRESS": f"unix:path={bus_path}",
                "DISPLAY": f":{display}",
                "XAUTHORITY": str(auth),
                "XDG_RUNTIME_DIR": str(self.runtime_root),
                "GTK_IM_MODULE": "fcitx",
                "QT_IM_MODULE": "fcitx",
                "XMODIFIERS": "@im=fcitx",
            }
            display_env = env
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline and not stopping:
                if vnc.poll() is not None:
                    raise SessionError("Virtual display failed to start.", "display-failed")
                if execute(["xdpyinfo"], env=env, timeout=2).returncode == 0:
                    break
                time.sleep(0.2)
            else:
                raise SessionError("Virtual display did not become ready.", "display-timeout")
            wm_config = self.runtime / "openbox.xml"
            wm_config.write_text(
                '<openbox_config xmlns="http://openbox.org/3.4/rc"><applications>'
                '<application class="*"><decor>no</decor><maximized>yes</maximized>'
                "</application></applications></openbox_config>"
            )
            wm = subprocess.Popen(
                ["openbox", "--config-file", str(wm_config)],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            children.append(wm)
            if shutil.which("fcitx5"):
                ime_env = {**env, "XDG_CONFIG_HOME": str(private_dir(self.data / "desktop-config"))}
                ime = private_dir(Path(ime_env["XDG_CONFIG_HOME"]) / "fcitx5")
                if not (ime / "profile").exists():
                    (ime / "profile").write_text(
                        "[Groups/0]\nName=Default\nDefault Layout=us\nDefaultIM=pinyin\n"
                        "[Groups/0/Items/0]\nName=keyboard-us\nLayout=\n"
                        "[Groups/0/Items/1]\nName=pinyin\nLayout=\n[GroupOrder]\n0=Default\n"
                    )
                children.append(
                    subprocess.Popen(["fcitx5"], env=ime_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                )
            browser_env = dict(env)
            if self.is_snap:
                # snap run asks the user's real systemd manager to create its
                # confinement scope; a private D-Bus cannot provide that manager.
                browser_env["DBUS_SESSION_BUS_ADDRESS"] = self.env["DBUS_SESSION_BUS_ADDRESS"]
            browser = subprocess.Popen(
                [
                    self.browser,
                    "--ozone-platform=x11",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--start-maximized",
                    f"--user-data-dir={profile}",
                    settings["homepage"],
                ],
                env=browser_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            children.append(browser)
            time.sleep(2)
            if browser.poll() is not None:
                raise SessionError(
                    "Browser failed to start. Check browser sandbox, Snap interfaces and display access.",
                    "browser-failed",
                )
            atomic_json(self.state_file, {"state": "running"})
            while not stopping:
                if browser.poll() is not None or vnc.poll() is not None:
                    break
                if wm.poll() is not None:
                    raise SessionError("Window manager stopped unexpectedly.", "window-manager-failed")
                time.sleep(0.5)
            atomic_json(self.state_file, {"state": "stopped"})
        except Exception as exc:
            message = (
                str(exc)
                if isinstance(exc, SessionError)
                else "Browser session failed. Run diagnostics to check dependencies and permissions."
            )
            atomic_json(self.state_file, {"state": "error", "error": message})
            raise
        finally:
            if browser is not None and browser.poll() is None and display_env is not None:
                # WM_DELETE lets Chromium flush preferences/cookies and mark a
                # clean exit. Only windows on this plugin's display are visible.
                try:
                    windows = execute(["wmctrl", "-lx"], env=display_env, timeout=2)
                    for line in windows.stdout.splitlines():
                        parts = line.split(None, 4)
                        if len(parts) >= 3 and any(name in parts[2].lower() for name in ("chromium", "chrome")):
                            execute(["wmctrl", "-ic", parts[0]], env=display_env, timeout=2)
                    browser.wait(timeout=8)
                except (OSError, subprocess.SubprocessError):
                    pass
            for child in reversed(children):
                if child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait()
            self.socket.unlink(missing_ok=True)
            bus_path.unlink(missing_ok=True)
            if auth is not None:
                auth.unlink(missing_ok=True)
            lock.close()


def main():
    os.umask(0o077)
    try:
        action = sys.argv[1] if len(sys.argv) > 1 else "status"
        session = Session()
        if action in ("status", "diagnostics"):
            result = session.status()
        elif action == "start":
            result = session.start()
        elif action == "stop":
            result = session.stop()
        elif action == "settings" and len(sys.argv) == 3:
            result = session.save(json.loads(sys.argv[2]))
        elif action == "run":
            session.run()
            return
        else:
            raise SessionError("Unknown operation.", "invalid-operation")
        print(json.dumps(result, ensure_ascii=False))
    except (SessionError, OSError, subprocess.SubprocessError, ValueError) as exc:
        message = (
            str(exc)
            if isinstance(exc, SessionError)
            else "Operation failed. Check dependencies and user session permissions."
        )
        print(json.dumps({"ok": False, "error": message, "code": getattr(exc, "code", "operation-failed")}))
        if len(sys.argv) > 1 and sys.argv[1] == "run":
            sys.exit(1)


if __name__ == "__main__":
    main()
