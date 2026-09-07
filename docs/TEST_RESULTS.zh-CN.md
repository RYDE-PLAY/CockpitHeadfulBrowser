# Cockpit Browser 0.1.0 验收记录

测试日期：2026-09-07。目标主机 Ubuntu 22.04.5 ARM64，Cockpit 346，Chromium Snap 152.0.7977.64（revision 3524）。

## 空白页面修复（2026-09-07）

用户从正式 Cockpit 菜单打开时出现空白。复现确认 noVNC 顶层异步视频能力检测延迟，导致入口错过 DOMContentLoaded。已将 noVNC 改为连接时动态加载，并为挂载入口增加 readyState 检查。新增 Cockpit shell 菜单进入与 1500ms 解码检测延迟回归；完整 8 项浏览器测试及 11 项后端测试通过。修复包已重新安装，安装资源与构建产物一致。日志见 artifacts/blank-page-regression.log 和 artifacts/blank-page-check.log。

## 实现与安装

采用官方 Starter Kit 构建流程、React/PatternFly 6、noVNC 1.7.0。服务器运行完整 Chromium 窗口，保留地址栏、标签页及前进后退按钮，通过 Cockpit stream 通道传输真实画面和键鼠输入。页面没有把目标网站直接嵌入 iframe，因此不受目标网站禁止 iframe 的限制。

插件已安装到 `/usr/share/cockpit/cockpit-browser`，普通用户服务按需启动。刷新 Cockpit，进入“浏览器”，点击“启动浏览器”。外层界面跟随 Cockpit light/dark 模式；远端网页和 Chromium 自身主题由远端浏览器管理。

浏览器使用服务器网络和独立 profile，不自动继承本地浏览器的登录、扩展或文件。页面提供主页、固定分辨率、画质、断线保留时间设置以及全屏、地址栏聚焦和剪贴板。分辨率/主页/超时变更需要重启会话。默认下载目录在会话详情中显示。

## 已完成验证

- 后端单元测试 11 项通过：配置类型/范围/URL、原子持久化、权限、符号链接/异主目录拒绝、root 拒绝、状态返回。
- 真实服务生命周期通过：重复启动复用服务、RFB 握手、停止清理 socket 和浏览器进程、重启保留设置。
- Playwright 在系统安装目录上运行 8 项测试：从 Cockpit 菜单进入页面（包含延迟视频能力检测）；简体中文界面及翻译脚本无初始化异常；真实页面与 VNC 连接；Cockpit 主题事件使工具栏颜色变化且保留同一 canvas；远端地址栏导航、键盘输入及提交表单；中文剪贴板粘贴及远端提交；设置草稿跨轮询保留、非法主页拒绝。另外一项为 HTTP fixture 自测，不将其计作远端交互证明。
- 新增移动端 WebKit 回归：iPhone 13 模拟视口下，noVNC 内层屏幕和 canvas 均有非零尺寸，页面和控制台无错误，并通过受控 HTTP fixture 验证手机地址输入桥能导航远程浏览器、页面文本桥能填写并提交表单。修复了 WebKit 将 noVNC `height: 100%` 解析为零导致移动端空白的问题；此项仍不替代真实 iOS 设备验收。
- 画布布局回归通过：桌面和移动视口均以可用宽度铺满，并按照服务器浏览器的实际 framebuffer 宽高比计算高度；canvas 与容器尺寸一致，不再因为固定最小高度产生上下或左右灰边。
- `make codecheck` 通过：前端 ESLint、Stylelint、TypeScript 及 Python Ruff。可选 mypy/vulture 未安装，未计作通过。`skipLibCheck` 仅跳过第三方类型声明检查。
- VNC socket 为 0600、其目录为 0700；以 nobody 连接被拒绝。VNC 与 X11 没有新增 TCP 监听。
- 生产构建使用官方 `.js.gz` / `.css.gz` 资源；Cockpit 已识别系统安装目录。中文语言 Cookie 可取得简体中文翻译资源。
- 包依赖及生命周期的容器验证见 [PACKAGE_TEST_RESULTS.zh-CN.md](PACKAGE_TEST_RESULTS.zh-CN.md)。

开发测试服务仅监听 `127.0.0.1:9099`，通过当前普通用户的 Cockpit bridge 测试。未创建临时 sudoer，未读取登录密码，也未修改生产 Cockpit 的 Origins 或认证配置。系统依赖和包安装使用当前环境已有 sudo 权限。

日志与截图保存在项目 `artifacts/`（不纳入源码）：`backend-tests.log`、`lifecycle-tests.json`、`browser-tests.log`、`installed-browser-tests.log`、`codecheck.log`、`light.png` 和 `dark.png`。

## 已知限制和后续验收

- Chromium 在停止后再次启动可能显示“恢复页面”提示；当前不能保证运行中标签页总是自动恢复。profile 和下载不因停止/卸载而删除。
- 已验证中文剪贴板输入、WebKit 移动视口渲染和手机地址输入桥；原生中文输入法、真实 iOS 系统键盘/触摸/全屏、Firefox 客户端、AMD64 和其他发行版尚未验收。
- 未通过真实 PAM 密码登录执行生产面板端到端测试；登录/退出失效、两个真实 Cockpit 用户隔离、服务器重启、网络故障和完整超时回收仍需专项验证。
- 音频、摄像头、本地文件直接拖放上传、视频流畅度及量化延迟/带宽没有作为本版交付能力。下载保存到服务器，可通过已有文件管理功能取回。
- 原计划中的自动分辨率、Files 自动跳转、多人接管提示及全面故障/性能矩阵属于后续范围；本版同用户连接共享同一浏览器会话。

开发复现步骤见 [TESTING.zh-CN.md](TESTING.zh-CN.md)，安装和卸载见 [INSTALL.zh-CN.md](INSTALL.zh-CN.md)。
