# Security policy

Cockpit Headful Browser launches a browser as the logged-in Cockpit user and exposes its display through the authenticated Cockpit connection. It is intended for a trusted Cockpit installation, not as a public standalone VNC service.

Please report security issues privately to the repository maintainers before opening a public issue. Include the affected version, distribution, Cockpit version and a minimal reproduction. Do not include passwords, cookies, browser profiles, downloaded files or private URLs in a report.

When reporting a suspected data-isolation problem, describe which users or paths could cross the boundary. The helper is expected to reject root, use a private Unix socket, disable VNC/X11 TCP listeners and keep each user's profile under that user's home directory.

The development server in `scripts/test-server.sh` is intentionally unauthenticated and binds to loopback only. Never expose it through a reverse proxy or bind it to a public address.
