# Debian 包生命周期测试记录

测试日期：2026-09-07。最终包：`cockpit-browser_0.1.0_all.deb`。

SHA-256：`efa20366270de724625ec32b1a067d3e67b999de6f3346948959fe37b12ef77d`。

## 后续前端修复包

空白页面修复后重新打包并在宿主重装，SHA-256 为 `2b260d96021ad8087dc5ef24617f1505846e5fa20da7f8cd80ff0009292d7745`。仅前端初始化方式改变；宿主安装资源与构建产物一致，8 项 GUI 回归通过。下文完整容器生命周期记录对应修复前包，未对本次纯前端变更重复整轮容器测试。

## 最终结果

干净 Ubuntu 22.04 ARM64 Docker 容器，使用真实 `cockpit-bridge 360-1~bpo22.04.1` 包（来自 Ubuntu jammy-backports）。依赖安装全部使用 `--no-install-recommends`，验证：

1. 首次安装与真实 Depends 解析成功。
2. 同版本 `--reinstall` 重装成功。
3. remove 后 helper 文件移除，用户配置标记保留。
4. 再次安装成功。
5. purge 后插件前端目录移除，用户配置标记仍保留。

最终输出 `FINAL_PACKAGE_LIFECYCLE_OK`，日志保存在 `artifacts/final-package-tests.log`。容器以 `--rm` 运行并已清理。包包含官方压缩资源 `index.js.gz`、`index.css.gz`、HTML、manifest、helper、systemd 用户服务和安装文档。宿主机上已安装同一校验值的包，且安装资源与构建输出一致。

## 验证边界

容器不运行 systemd 用户 manager，也不验证 Snap 图形浏览器；因此明确禁用推荐包，图形浏览器、中文字体和输入组件在实际目标主机上验证/配置。实际 GUI、主题、中文剪贴板和服务启停的主机结果见 [TEST_RESULTS.zh-CN.md](TEST_RESULTS.zh-CN.md)。

早期曾用临时空壳 bridge 验证包脚本；最终结论以上述真实 bridge 测试为准。一次复验遗漏了后续安装命令的 `--no-install-recommends`，触发不适用于该容器的 Snap 安装，已删除该容器并使用一致的参数重新完成整轮测试。未将这次中断计作通过。
