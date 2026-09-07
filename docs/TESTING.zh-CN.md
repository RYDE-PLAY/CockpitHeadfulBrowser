# 浏览器冒烟测试

浏览器测试使用 Playwright 连接本地 Cockpit WebSocket，并通过插件真实 canvas 操作浏览器会话。测试不会创建用户、写入用户设置或修改主机的 Cockpit 配置；它也不依赖 Cockpit Machines、虚拟机或 VNC 组件，项目自己的 session helper 会提供所需的本地显示和 Unix socket。

开发环境准备（需要 Node.js 22、npm、make，以及可运行的 Cockpit `cockpit-ws`）：

```sh
npm ci
make
npx playwright install chromium
```

`make` 会构建前端及 `pkg/lib` 运行时资源。若只运行 TypeScript 检查，`tsconfig.json` 中的 `skipLibCheck` 只跳过 PatternFly 等第三方声明文件；项目自身 `src/` 代码仍会被检查。

先在一个终端启动仓库提供的本地测试服务，再在另一个终端执行 Playwright：

```sh
./scripts/test-server.sh
npm run test:browser
```

`scripts/test-server.sh` 会绑定回环地址 `127.0.0.1:9099`，为测试建立隔离的 `.dev-config/` 和 `.dev-data/`，配置允许该地址的页面和 WebSocket Origin，并从当前 checkout 的 `dist/` 提供 `cockpit-browser`。默认测试地址是：

```text
http://127.0.0.1:9099/cockpit/@localhost/cockpit-browser/index.html
```

可以用 `COCKPIT_TEST_URL` 覆盖地址。若 UI 提供稳定的就绪选择器或文案，可以设置 `COCKPIT_READY_SELECTOR` 或 `COCKPIT_READY_TEXT`。会话处于 stopped 状态时，测试会点击默认 `data-testid="start-browser"` 或文案为 `Start browser` 的按钮，等待真实 `HTMLCanvasElement` 有非零尺寸并等待地址栏按钮启用；可用 `COCKPIT_START_SELECTOR` 覆盖启动按钮。

插件测试通过地址栏焦点按钮（默认 `data-testid="remote-address-focus"`）把受控 fixture URL 输入到 canvas，再用键盘 `Tab` 和 `Enter` 操作页面表单；fixture 会记录真实 GET 和 POST。测试也确认主题事件前后的 canvas 是同一个 DOM 节点。UI 使用不同稳定选择器时，可以设置 `COCKPIT_CANVAS_SELECTOR`、`COCKPIT_ADDRESS_FOCUS_SELECTOR`、`COCKPIT_TOOLBAR_SELECTOR` 和 `COCKPIT_START_SELECTOR`。最后的 `fixture self-test` 只检查 fixture 自身 HTTP 处理，不能替代插件测试。

主题测试通过官方 `cockpit-style` 事件请求 `light` 和 `dark`，检查 `pf-v6-theme-dark` 类及工具栏实际计算背景色的变化。失败截图和 Playwright 报告放在系统临时目录（可通过 `PLAYWRIGHT_OUTPUT_DIR` 指定），不会提交到仓库。

生产运行时与开发测试是两套准备方式。生产环境需要安装构建出的 Debian 包；它提供 `/usr/libexec/cockpit-browser/session.py`、用户 systemd service 及 TigerVNC/Openbox 等运行依赖。生产安装不需要 Node.js/npm，也不会自动启动浏览器。修改运行时 helper 或 service 后，应重新构建并安装 Debian 包，再通过 session status/start 做生命周期验证。
