# Cockpit Headful Browser

Cockpit Headful Browser adds a real browser window to the Cockpit web console. It runs Chromium or Chrome on the server and streams the complete window through Cockpit, so the page keeps its address bar, tabs, navigation buttons, downloads, keyboard input and mouse interaction.

This is an independent Cockpit application based on the official Starter Kit. It is not an official Cockpit Project application. The source repository is [RYDE-PLAY/CockpitHeadfulBrowser](https://github.com/RYDE-PLAY/CockpitHeadfulBrowser).

## What it provides

- A per-user browser session with a normal browser window rather than an iframe or kiosk page.
- Live keyboard, mouse, clipboard and navigation controls through noVNC and Cockpit's stream channel.
- Light and dark Cockpit themes, fullscreen mode, reconnect, address-bar focus and basic session settings.
- A private per-user profile and download directory on the server.
- A user systemd service that starts on demand and stops without exposing a VNC TCP port.

The browser uses the server's network and credentials are stored in the server-side profile. It does not import the browser profile, cookies or extensions from the administrator's local computer.

## Requirements

The supported first target is Ubuntu 22.04 or newer with Cockpit 346 or newer, a logged-in systemd user session, and Chromium or Chrome. The runtime also needs TigerVNC, Openbox, D-Bus X11, X11 utilities, `xauth` and `wmctrl`. The Debian package declares the Linux dependencies and recommends Chromium, CJK fonts and fcitx5 where available.

Ubuntu's Chromium Snap is supported by the current helper, but the Snap must be installed and usable by the Cockpit user. The package does not install a browser from a third-party repository, enable user lingering, or start a browser during installation. AMD64, other distributions and browsers other than Chromium/Chrome need their own validation.

## Install on Ubuntu/Debian

Build a package from a checkout or download a matching release artifact:

```sh
npm ci
make deb
sudo apt install ./cockpit-browser_0.1.0_all.deb
```

Refresh Cockpit, open **Tools → Browser**, and click **Start browser**. The package installs the frontend under `/usr/share/cockpit/cockpit-browser`, the helper under `/usr/libexec/cockpit-browser/session.py`, and the user unit under `/usr/lib/systemd/user/cockpit-browser.service`.

The package never asks for a browser password and does not require a separate sudo-only user. The browser is launched as the logged-in Cockpit user. See the [Chinese installation guide](docs/INSTALL.zh-CN.md) for dependency checks, Snap details, upgrades and uninstall behavior.

## Development

Use Node.js 22 or newer, then install the build tools and dependencies:

```sh
sudo apt install gettext make
npm ci
make
```

`make` downloads the pinned Cockpit build helpers and writes the frontend to `dist/`. For a frontend-only checkout install, use:

```sh
./scripts/devel-install.sh
```

For a complete local GUI test, start the isolated loopback Cockpit instance in one terminal and run Playwright in another:

```sh
./scripts/test-server.sh
npx playwright install chromium   # first run only
npm run test:browser
```

The test server listens only on `127.0.0.1:9099`, uses `.dev-config/` and `.dev-data/`, and must never be exposed through a public reverse proxy. `make check` runs the static checks and backend unit tests. The [testing guide](docs/TESTING.zh-CN.md) describes the real GUI coverage and the remaining validation boundaries.

## Security and data

The helper refuses to run as root. The VNC endpoint is a mode-0600 Unix socket inside a mode-0700 runtime directory; VNC TCP and X11 TCP listeners are disabled. Each Cockpit user gets a separate profile, download directory and user service. Stopping or uninstalling the package does not delete profile data or downloads.

Treat sites opened in the server browser as server-side activity. The browser can reach the server's network, and downloaded files remain on the server until you remove or retrieve them.

## Current limitations

Chromium may show a restore-pages prompt after a forced or interrupted stop. Native IME behavior, audio/video, drag-and-drop uploads, Safari/Firefox clients, automatic resolution negotiation, multi-user session handoff and long-duration performance measurements are not part of the first validated release. The current validation record is in [docs/TEST_RESULTS.zh-CN.md](docs/TEST_RESULTS.zh-CN.md).

## License

Cockpit Headful Browser is licensed under the LGPL-2.1-or-later. See [LICENSE](LICENSE).
