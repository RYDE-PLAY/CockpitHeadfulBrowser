# Cockpit Browser 开发、测试与安装计划

状态：首个实现 0.1.0 已构建并安装到目标服务器 Ubuntu 22.04 ARM64、Cockpit 346。以下保留原始里程碑及后续范围；已验证功能和限制以 TEST_RESULTS.zh-CN.md 为准，并非下列完整矩阵均已通过。

## 1. 产品范围与架构

在 Cockpit 工具菜单加入“浏览器”，持续显示服务器上的完整浏览器窗口，支持地址栏、标签页、前进后退、鼠标键盘、中文输入、剪贴板、断线重连和配置持久化。

首选架构：官方 Starter Kit 前端 + noVNC + Cockpit 已认证的二进制 stream 通道 + 每用户独立 TigerVNC 虚拟显示会话 + 轻量窗口管理器 + Chromium。

浏览器访问使用服务器网络；下载、Cookie 和配置保存在服务器。浏览器保留普通窗口的地址栏及标签页；窗口管理器负责最大化，不使用隐藏地址栏的 kiosk 模式。

原型先验证原生用户服务部署。Ubuntu Chromium Snap 的显示、沙箱、配置目录与会话兼容性是前置决策门：若不能可靠支持目标系统，由主代理评估维护中的容器运行时方案，并重新验证宿主机网络访问、用户隔离和升级，不默默禁用浏览器沙箱或添加第三方软件源。

## 2. 用户配置体验

- 安装成品包即可使用；Node/npm、编译工具仅用于开发和 CI。
- 首次进入页面自动检测依赖、浏览器版本、用户服务、权限与启动条件；显示“就绪 / 需要安装依赖 / 需要修复”及具体下一步。
- 普通用户不配置显示编号、VNC 地址、端口、WebSocket URL 或 VNC 密码。
- 默认按需启动；切换菜单不断开后台浏览器会话；短暂断线自动重连。建议无人连接 30 分钟后停止，可在设置中改为持续保留；停止保留配置和登录数据，运行中的标签页恢复由浏览器恢复机制处理。
- “退出 Cockpit”与“停止浏览器”行为需明确区分；退出后连接失效，服务按所选保留策略运行。开机自动运行默认关闭，不默认开启用户 linger。
- 第一版基本设置：主页、分辨率自动/固定、画质均衡/清晰/省流量、断线保留时间。高级设置折叠，任何设置变更均有校验和恢复默认值。
- 文件默认写入独立下载目录；页面显示目录并提供经过兼容性检测的 Cockpit Files 跳转。没有 Files 插件时给出路径。第一版通过文件管理器完成本地上传下载。
- 页面状态明确区分：未启动、启动中、连接中、已连接、重连中、已停止、启动失败、缺少依赖；错误提示提供重试和诊断详情。
- 简体中文及英文文案；日志默认不采集访问地址、Cookie、剪贴板或凭据。

## 3. 权限、数据和服务约定

- 浏览器和图形会话使用普通用户权限，保留浏览器沙箱；安装系统依赖才需要提权。
- 每用户独立运行目录、配置、下载目录和 systemd 用户服务；同一 profile 不允许被多个浏览器进程同时打开。
- 优先 Unix socket，目录 0700、socket 0600，关闭 VNC TCP 和 X11 TCP 监听。若使用 socket 权限作为 VNC 认证边界，需专门验证不同用户不可访问。
- Cockpit bridge 通道保持原登录用户身份，不因管理员模式给浏览器提升权限。
- 用户配置使用版本化 schema、原子写入和迁移；服务配置、profile、下载目录分开管理。
- 停止时优雅退出浏览器，然后清理图形会话；异常启动清理只处理本插件拥有的进程和路径。
- 用户服务管理器、D-Bus、XDG_RUNTIME_DIR 和登录/退出生命周期在目标系统实测；不假设 SSH 或 Cockpit 登录一定提供所有桌面会话环境。

## 4. light/dark mode

- 采用 Starter Kit 当前使用的 PatternFly 主版本及 Cockpit 官方主题初始化机制；锁定与目标 Cockpit 兼容的依赖组合。
- 当前官方入口在 src/index.tsx：先 import "cockpit-dark-theme" 和 import "patternfly/patternfly-6-cockpit.scss"，再加载插件自身样式。沿用 PF6，不混入 PF5 class 或再加载一套基础 CSS。核查目标版本 iframe 页面布局，避免重复侧栏和双滚动条。
- 插件工具栏、卡片、空状态、菜单、弹窗、错误提示、焦点及滚动区域均使用 PatternFly 语义颜色变量；不硬编码黑白背景和文字，不使用全局颜色反转。
- 跟随 Cockpit 的 light/dark/system 选择，验证系统偏好和显式选择冲突时以 Cockpit 用户选择为准。
- 验证初始载入、运行时切换、重新进入插件、全屏、断线页面和弹窗，无明显主题闪烁。
- noVNC canvas 展示真实远端画面；插件主题不能通过 CSS 改变其中的网站。远端浏览器自身主题作为独立体验项，先验证 GTK/桌面主题联动，不能可靠热切换时明确采用浏览器自己的设置。
- 外层主题改变不得重启浏览器、清除页面或丢失输入。

## 5. 开发步骤及交付门槛

### M0：环境与技术原型

1. 检测发行版、架构、Cockpit/bridge 版本、现有浏览器与包来源、用户服务和可用资源；确定首发支持矩阵。
2. 固定 Starter Kit/Cockpit 测试工具版本；验证 Unix socket 的 Cockpit 通道到 noVNC 的原始 RFB 连接。
3. 在干净虚拟机中启动普通用户 Chromium、虚拟显示器和窗口管理器，验证沙箱、中文字体/输入法、地址栏、多标签及访问宿主机服务。
4. 测量 1080p 普通网页的启动、输入响应、CPU、内存和带宽，验证无人连接时资源行为。

开发基本流程：复制官方模板并重命名包、manifest、metainfo 与文案，安装匹配锁定工具链的开发依赖，运行 make、make devel-install；迭代时 make watch，静态检查 make codecheck。首次运行需核对当前依赖实际 Node 要求，不能仅凭模板中最低 engines 字段选择版本。

通过条件：目标系统无需人工配置显示或端口即可连接；完整浏览器可操作；主题机制与会话权限已验证。失败项由主代理决定架构调整后再推进。

### M1：会话管理

实现固定操作接口 status/start/stop/settings/diagnostics，结构化返回错误；参数使用参数数组，不拼接 shell。实现启动互斥、并发连接规则、超时、限次恢复、用户数据持久化及 systemd 生命周期。

### M2：Cockpit 页面

加入菜单和原生 PatternFly 布局；实现状态机、noVNC 生命周期、全屏/缩放、重连、剪贴板面板、“聚焦远端地址栏”快捷操作、设置与诊断。

同一用户两个客户端默认提示已有会话并明确共享/接管行为；避免两个客户端自动调整分辨率互相争抢。

### M3：配置与打包

实现依赖检查、安装后预检、配置迁移、诊断输出；Ubuntu 优先交付 .deb。标准包文件进入 /usr/share/cockpit/cockpit-browser，开发安装使用用户目录；其他资源遵守发行版打包规范。

运行时依赖由包声明；需要额外浏览器安装来源时在安装说明和界面明确展示。安装器可重复运行，保留已有配置；失败后可重试并说明哪一步未完成。

### M4：回归与发布候选

完成下方测试矩阵，制作安装、升级、卸载说明，记录精确版本和已知限制。主代理审查架构、权限、主题行为、包安装副作用及测试证据后汇总可安装产物。

## 6. 测试步骤

1. 静态检查：沿用 Starter Kit 的 make codecheck 和生产构建；新增配置/状态机逻辑进行必要单元测试。
2. 服务测试：重复启动、并发启动、启动失败、浏览器崩溃、服务重启、停止清理、配置写入失败、磁盘不足与用户退出。
3. 集成测试：沿用 Cockpit 测试框架，在适配好的目标 Ubuntu VM 上跑真实安装包。Starter Kit 默认 make check 使用 RPM/测试 VM，不能直接当成 Ubuntu DEB 验证。
4. 交互测试：受控测试网站覆盖导航、表单、滚动、右键、新标签、弹窗、文件选择和下载。通过实际 noVNC 输入触发操作，并由测试网站结果/远端状态校验；不能只断言 canvas 存在。
5. 主题与可访问性：light/dark/system × 就绪/连接/断线/报错/设置弹窗，验证实时切换、键盘焦点、对比度、缩放和全屏。截图使用固定网站，避免外部网站变化影响基准。
6. 中文与客户端：中文输入、混合文本、剪贴板、Mac Command/远端 Ctrl 差异；Chrome/Chromium、Firefox、Safari 实测，无法覆盖的明确列为未验证。
7. 隔离与连接：两个 Cockpit 用户不能连接或读取彼此会话；管理员模式不改变浏览器 UID；退出 Cockpit 后新连接失败且现有通道关闭；无意外 VNC/X11 公网监听。
8. 持久化与恢复：刷新、切换菜单、网络中断、超时回收、重启服务器、升级后重进；核查 profile 和下载保留，明确运行中标签页恢复边界。
9. 安装生命周期：干净 VM 安装、已有依赖、包管理器锁冲突、依赖下载失败后重试、重复安装、升级迁移、卸载保留数据、显式清理数据。
   若采用 Snap，补测 snap info/connections 的实际状态、受限 HOME/profile/download 路径、自动刷新对运行会话的影响、刷新失败恢复及 revision 回退；不假设浏览器回退会恢复公共用户数据。
10. 性能：记录 1080p/1440p、不同 RTT/带宽下的输入到画面响应 p50/p95、滚动效果、CPU/RSS 和带宽。原型后确定量化门槛，不事先承诺固定帧率或零延迟。

## 7. 安装、升级和卸载流程

当前交付 `cockpit-browser_0.1.0_all.deb`；本机安装已完成，以下供后续安装与升级参考。

1. 用户下载匹配系统/架构的版本化 .deb，核对发布校验信息。
2. 使用 apt 安装本地包并解析发行版依赖；若浏览器来源需额外步骤，安装说明明确给出，并在预检中显示完成状态。
3. 刷新 Cockpit，进入“浏览器”；预检显示环境结果，按提示完成缺失依赖安装或修复。
4. 点击“启动浏览器”；自动创建本用户配置与运行目录，启动虚拟显示器和浏览器，通过 Cockpit 通道连接。
5. 实际输入地址、中文、前进后退，断开重连，确认登录数据和下载目录。
6. 升级前提示保存工作、优雅停止会话，保留配置并备份需迁移的数据；升级后跑预检和最小交互冒烟测试。浏览器 profile 不保证可降级，二进制回退不能代替 profile 备份恢复。
7. 卸载停止本插件会话并移除包文件；默认保留用户 profile 和下载。“删除浏览数据”单独明确选择，不能借助卸载递归删除未知用户目录或共享依赖。

## 8. 分工

主代理负责架构选择、支持矩阵、服务与权限边界、主题接口约定、跨模块整合、失败决策、审查和最终验收。

luna_worker 负责边界确定后的独立工作：官方资料核查、既定界面组件与翻译、固定测试用例与截图矩阵、DEB 元数据及文档、重复安装/升级测试。每项明确输入、交付物、允许修改的文件和验收命令；并行任务不同时修改同一文件。

## 官方参考

- Starter Kit：https://github.com/cockpit-project/starter-kit
- Cockpit VNC 集成：https://github.com/cockpit-project/cockpit-machines/blob/main/src/components/vm/consoles/vnc.tsx
- Cockpit stream 协议：https://github.com/cockpit-project/cockpit/blob/main/doc/protocol.md
- noVNC API：https://novnc.com/noVNC/docs/API.html
- Ubuntu TigerVNC 手册：https://manpages.ubuntu.com/manpages/noble/man1/Xtigervnc.1.html
- Ubuntu Chromium 包来源：https://wiki.ubuntu.com/DesktopTeam/ChromiumMaintenance
- Starter Kit 主题入口：https://github.com/cockpit-project/starter-kit/blob/main/src/index.tsx
- Cockpit PF6 适配建议：https://github.com/cockpit-project/cockpit/discussions/21753
- Snap 环境目录：https://snapcraft.io/docs/reference/development/environment-variables/
- Snap 更新：https://snapcraft.io/docs/how-to-guides/manage-snaps/manage-updates/
