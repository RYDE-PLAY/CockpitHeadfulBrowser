# 安装 Cockpit Browser

本文说明当前 Ubuntu 优先的安装方式。当前交付包版本为 `0.1.0`，目标环境是 Ubuntu 22.04、Cockpit 346 或更新版本；在其他发行版、架构或 Cockpit 版本上请先完成实际验证。

## 安装 `.deb`

在项目根目录已有前端构建产物 `dist/`、`backend/session.py` 和 `backend/cockpit-browser.service` 时，运行：

```sh
./scripts/build-deb.sh
sudo apt install ./cockpit-browser_0.1.0_all.deb
```

也可以先用 `dpkg-deb -I cockpit-browser_0.1.0_all.deb` 检查元数据。安装包会把前端放在 `/usr/share/cockpit/cockpit-browser`，会话 helper 放在 `/usr/libexec/cockpit-browser/session.py`，用户服务放在 `/usr/lib/systemd/user/cockpit-browser.service`。

包依赖 `cockpit-bridge (>= 346)`、Python 3、TigerVNC、Openbox、`dbus-x11`、`x11-utils`、`xauth` 和 `wmctrl`，并推荐中文字体、Chromium 以及 fcitx5 中文输入组件。安装时不会安装 Node/npm，也不会自动启动浏览器、启用 linger 或删除用户数据。

Ubuntu 的 Chromium 可能来自 Snap。`chromium-browser | chromium` 只是包依赖提示，不能保证 Snap 的显示、沙箱、profile、下载目录和用户服务环境已经适配；首次使用前应在目标机器上完成这些检查。若发行版没有可解析的候选包，请按目标系统的浏览器来源单独安装并重新运行页面预检。

安装后刷新 Cockpit 并进入“浏览器”。浏览器会以当前 Cockpit 用户身份按需启动。不要以 root 身份手工启动用户服务，也不要把 VNC 端口、显示编号或密码写入页面配置。

## 开发安装

开发时先生成 `dist/`，然后运行：

```sh
./scripts/devel-install.sh
```

这只会把 `dist/` 链接到当前用户的 `~/.local/share/cockpit/cockpit-browser`，用于 Cockpit 前端开发；它不会安装系统 helper 或用户服务。修改代码并重新构建后刷新 Cockpit 页面即可。要删除开发链接：

```sh
rm ~/.local/share/cockpit/cockpit-browser
```

需要完整运行时（包括 helper 和 systemd 用户服务）时，请使用 `.deb`。包安装到系统路径后，前端仍由 Cockpit 按标准模块路径加载。

## 升级、卸载与数据

升级前请保存浏览器工作。升级包会保留用户 profile 和下载目录；浏览器 profile 的跨版本兼容性不保证，重要数据应另行备份。卸载包只移除包文件，默认保留用户数据；如需删除 profile 或下载目录，请在确认具体路径后手工执行。

## 当前支持范围

首发目标是 Ubuntu 22.04 或更新版本、Cockpit 346 或更新版本，以及 Chromium 或 Chrome。其他发行版、架构、浏览器来源和 Safari 需要在目标环境中单独验证。可复现的开发和 GUI 测试命令见 [浏览器测试指南](TESTING.zh-CN.md)。
