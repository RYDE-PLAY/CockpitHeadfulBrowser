# Cockpit Headful Browser

Cockpit Headful Browser adds a full Chromium or Chrome window to the Cockpit web console. The remote window keeps normal browser controls, including the address bar, tabs, navigation, downloads, keyboard input and mouse or touch interaction.

This is not an official Cockpit Project application. It is built with the official [Cockpit Starter Kit](https://github.com/cockpit-project/starter-kit).

## Features

- Live browser display and input through Cockpit and noVNC.
- Mobile input support for the address bar and page fields.
- Responsive light and dark Cockpit UI with fullscreen and reconnect controls.
- Per-user browser profile, downloads and systemd service on the server.

The browser runs on the Cockpit server, so its network access, profile and downloads stay on that server.

## Requirements

Ubuntu 22.04 or newer, Cockpit 346 or newer, a logged-in systemd user session, and Chromium or Chrome. The Debian package declares the runtime dependencies: TigerVNC, Openbox, D-Bus X11, X11 utilities, `xauth` and `wmctrl`. Ubuntu's Chromium Snap must be installed and usable by the Cockpit user.

Other distributions, architectures and browser packages need separate validation.

## Installation

Download the latest `.deb` from [Releases](https://github.com/RYDE-PLAY/CockpitHeadfulBrowser/releases), then install it with:

```sh
sudo apt install ./cockpit-browser_*.deb
```

Refresh Cockpit, open **Tools → Browser**, and click **Start browser**.

## Manual installation

To build the package from source, use Node.js 22 or newer:

```sh
sudo apt install gettext make
npm ci
make deb VERSION=0.1.0
sudo apt install ./cockpit-browser_0.1.0_all.deb
```

The package does not install a browser or start a session during installation. See the [Chinese installation guide](docs/INSTALL.zh-CN.md) for dependency checks, upgrades and uninstall details.

Maintainers can push a numeric version tag such as `0.1.1` to build and publish a Debian package, checksum and source archive automatically.

## Development

```sh
npm ci
make
./scripts/devel-install.sh
make check
```

See the [Chinese testing guide](docs/TESTING.zh-CN.md) for the isolated Cockpit GUI test setup.

## License

Cockpit Headful Browser is licensed under the LGPL-2.1-or-later. See [LICENSE](LICENSE).
