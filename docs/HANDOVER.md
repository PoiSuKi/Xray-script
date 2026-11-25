# Xray-script 接手文档（Handover）

- 仓库：`https://github.com/PoiSuKi/Xray-script`（fork 自 `zxcvos/Xray-script`）
- 接手时间：2026-11-25
- 接手位置：`C:\Users\YuuDaChi\Documents\deepseek-harness\default-workspace\Xray-script`
- 接手时 HEAD：`c52d1a8`（branch `main`，tracking `origin/main`，工作区干净）
- 规模：60 个跟踪文件，Bash 约 9.9k 行（`core/` + `service/` + `tool/` + `install.sh`）

## 0. 一句话结论

这是一套**纯 Bash 的 Xray 一键管理脚本**：`install.sh` 引导、`core/main.sh` 编排流程、`core/handler.sh` 是唯一执行体，用 `~/.xray-script/config.json` 保存脚本状态。功能界面是「9 项主菜单 + 88 BBR + 99 自更新」，二级菜单覆盖 7 种协议组合、分流、SNI 多站点、Cloudreve、证书厂商、自定义反代站点。历史需求由 README 的 13 版 changelog 与 19 个提交定义，没有独立设计文档；三轮独立审计报告是唯一的质量基线（已归档到 `docs/reviews/`）。接手动作：整树（含 `.git`）迁入本工作区、把 60 个文件从 CRLF 归一化回 LF、删除垃圾文件 `$null`、补齐本文档与审计归档。**未改动任何脚本逻辑**，43 条契约测试保持全绿。

---

## 1. 技术定位

| 维度 | 事实 |
| --- | --- |
| 语言 | Bash 4+（大量 `declare -A`、`${var,,}`、`printf '%s\n'`） |
| 外部依赖 | `jq` 必备；`curl`/`wget`、`git`、`qrencode`、`socat`、`openssl`、`cron`、`iproute2`、`procps`、`bind9-dnsutils`（Debian 12+）/`dnsutils`（bullseye）/`bind-utils`（CentOS） |
| 可选依赖 | Docker（WARP Proxy、Cloudreve v3/v4）、源码编译 nginx（CDN-XHTTP / SNI 模式必需） |
| 目标系统 | 代码支持 Debian 9+ / Ubuntu 16+ / CentOS 7+；README 只承诺 **Debian 11/12/13** |
| 运行身份 | 必须 root（`install.sh` 直接 `$EUID` 检查），Xray 以专用 `xray` 用户、Nginx 以 `nginx`/`nobody` 非特权 worker 运行 |
| 状态文件 | `~/.xray-script/config.json`（版本、语言、Xray 参数、Nginx 参数、分流规则、`.target` 映射） |
| 运行文件 | `/usr/local/etc/xray/config.json`、`/usr/local/nginx/conf/**`、`/run/xray-script/{xray,nginx}/*.sock` |

三种角色分工是理解全部代码的钥匙：

1. **`install.sh`**：只做引导（依赖、下载、版本对比、语言），最后 `bash core/main.sh "$QUICK_INSTALL"`。
2. **`core/main.sh`**：只做流程编排，不做文件操作。它把 `menu.sh` 的 **exit code** 当作"用户的选择"。
3. **`core/handler.sh`**：唯一的执行体。所有写文件、装服务、签发证书、重启都在这里，`main()` 是一张 `--option` 分发表。

---

## 2. 历史与需求演进（19 个提交 = 5 个阶段）

| 阶段 | 提交 | 主题 | 主要改动 | 解决了什么需求 |
| --- | --- | --- | --- | --- |
| A 起点 | `4d5bde9` (2026-03-17) | Update handler.sh | 上游 zxcvos 快照被压成一个提交（**上游历史不在本仓**） | 建立可维护的 fork 基线 |
| B 兼容 | `9f9b5a1` | 安装器兼容 | handler +33，geodata 改为委托 | 官方 `install-release.sh` 改了参数（去掉 `-u root`） |
| | `c880f63` | nginx 安装对齐 + 关闭探测 | nginx.sh +24，所有模板 `sniffing.enabled=false` | 默认不探测入站流量 |
| | `481272f` | Reality 客户端输出对齐 Mihomo | share.sh +9 | 分享链接能被 Mihomo 直接吃 |
| C 功能 | `1b6a479` | 脚本自更新 + REALITY 域名编辑 | install.sh +66/−40（tarball + `.backup.$$`）、menu 99、配置菜单 7 | 不想重装就能更新脚本 / 换 REALITY 域名 |
| | `bb307ed` | 一键 BBR | 新增 `tool/bbr.sh`、menu 88 | 网络优化一键化 |
| | `b74ea9b` | xray-only 跳过 nginx 检查 | check.sh 判定 | 非 SNI 模式不该被 nginx 状态卡住 |
| | `fd5cda4` | 保留自定义 UUID / 显示 ML-KEM | generate.sh +35/−16 | 用户手填 UUID 被覆盖；新版 Xray 的 `support-x25519mlkem768` 提示 |
| D 硬化 | `af31ba1` | SNI 运行时重构 | UDS 拆成 `/run/xray-script/{xray,nginx}`，`stream-one`，H2 ALPN，最低版本校验，+76 测试行 | SNI 混合模式下的 socket 权限与 ALPN 协商 |
| | `cebca27` `b3edd62` `2a5f698` | 版本对齐 / 文档 / 依赖表 | README −114 | 发布一致性 |
| | `90929d7` | 大硬化 | handler +388/−131、check +113、nginx +171、docker +69、tests +218 | 安装事务、非 root worker、原子替换、DNS 精确比对、路由单次写入 |
| | `429ec51` | Debian 依赖名 | install.sh | `bind9-dnsutils` 只存在于 12+ |
| | `06a9e9d` | 不再引用过期 raw 链接 | README/install 自更新地址 | 链接随分支变化失效 |
| | `b344f40` | 安装与传输兼容硬化 | handler +281、generate +79/−48 | mKCP `FinalMask`、UUID 拒绝采样、安装失败回滚、安装器 SHA 钉死 |
| E 新模式 | `0eaba70` | CDN-XHTTP Nginx 前置模式 | handler +394，新增 `config/nginx/cdn-xhttp/*`、`config/xray/CDNXHTTP.json`、share +70、ssl +17、tests +78 | 套 CDN 时用 Nginx 收 443、XHTTP 走 UDS，避免直接暴露 REALITY |
| | `c52d1a8` | 建 `/var/www` 再放诱饵站 | handler +1 | 首次安装时目录不存在导致 nginx 启动失败 |

**历史需求的可追溯性**：README 的 changelog 条目 1–13 与上表一一对应（v2026.11.05 → v2026.11.09-r1）。没有 issue 记录、没有设计文档；任何"为什么这么写"的问题，答案只能来自提交信息 + 代码注释 + 三轮审计。

---

## 3. 代码结构与调用链

```
install.sh                       # 引导：依赖/下载/版本/语言 → 交给 main.sh
└── core/main.sh                 # 流程编排（唯一消费菜单 exit code 的地方）
    ├── core/menu.sh             # 所有菜单；print_banner / print_status；exit code = 选项号
    ├── core/handler.sh          # 全部实际动作（3220 行，main() 是 --option 分发表）
    │   ├── core/generate.sh     # 随机值：port / uuid / password / target / x25519 / shortId / path
    │   ├── core/check.sh        # 输入校验 + 环境探测（结果全走 stderr）
    │   ├── core/share.sh        # vless:// / trojan:// 链接 + Mihomo YAML + 二维码
    │   ├── core/read.sh         # 单行输入（i18n 提示，参数名 → 配置字段）
    │   ├── service/nginx.sh     # 源码编译 nginx（1.25.1+，含 http_v2）
    │   ├── service/ssl.sh       # acme.sh（zerossl / letsencrypt，HTTP-01 webroot）
    │   ├── service/docker.sh    # WARP Proxy、Cloudreve v3/v4
    │   └── tool/{bbr,traffic,geodata}.sh
    └── （自更新后 re-exec 自己）
```

贯穿全仓的四条约定，改代码前必须知道：

1. **`menu.sh` 的退出码就是用户选择**（`get_choose` 用 `return "${choose}"`），所以 88/99 能直接工作，但 **>255 会回绕**；`main.sh` 里 `exec_menu` 直接 `$?`。
2. **人看的输出一律 `>&2`**，只有 `share.sh` 的链接、`check.sh --proxy-target`、`generate.sh` 的随机值走 stdout 供 `$(...)` 捕获。
3. **i18n 键名 = `<脚本名>.<区块>.<键>`**，`CUR_FILE` 由 `basename` 自动得出，例如 `handler.script.config_update`、`menu.protocol_config.option1`、`read.uuid`。新增文案必须同时改 `i18n/zh.json` 与 `i18n/en.json`（契约测试会断言两边都存在）。
4. **函数前有一整块 `# ====` 注释**（功能/参数/返回值），是本项目的书写风格；新增函数请沿用。

---

## 4. 功能界面 → 命令 → 实现 全映射

### 4.1 主菜单 `menu --index`

| 编号 | 文案 | `main.sh` 流程 | 最终 `handler.sh` 命令 |
| --- | --- | --- | --- |
| 1 | 完整安装 | `processes_full_installation` → `menu --full` | 1 → `--quick Vision`；2 → `processes_xray n` |
| 2 | 仅安装/更新 Xray | `processes_xray` → `menu --xray` | `--install <ver> y` / `--version` |
| 3 | 卸载 | `handler` | `--purge` |
| 4/5/6 | 启动/停止/重启 | `handler` | `--start` / `--stop` / `--restart` |
| 7 | 分享链接与二维码 | `handler` | `--share` |
| 8 | 信息统计 | `handler` | `--traffic` |
| 9 | 管理配置 | `processes_config` → `menu --management` | 见 4.3 |
| 88 | 一键安装 BBR | `handler` | `--bbr` |
| 99 | 更新脚本 | `processes_script_update` | `bash install.sh --update` 后 re-exec |
| 0 | 退出 | `exit` | — |

### 4.2 协议配置 `menu --config`（安装主流程）

| 编号 | tag | 模板 | `handler.sh` 序列（`processes_xray_config`） |
| --- | --- | --- | --- |
| 1 | `mKCP` | `config/xray/mKCP.json` | `--check-version` → `--install release` → `--script-config mKCP` → `--xray-config` → `--restart` → `--share` |
| 2 | `Vision` | `Vision.json` | 同上 |
| 3 | `XHTTP` | `XHTTP.json` | 同上 |
| 4 | `Trojan` | `Trojan.json` | 同上 |
| 5 | `Fallback` | `Fallback.json` | 同上（双协议复合） |
| 6 | `SNI` | `SNI.json` | 先 `processes_ca_vendor init`，再 `processes_web_config n`：`--sni-ports` → `--install release` → `--script-config SNI` → `--nginx-install` → `--xray-config sni` → `--restart` → `--share` |
| 7 | `CDNXHTTP` | `CDNXHTTP.json` | `--cdn-xhttp-ports` → `--check-version` → `--install release` → `--script-config CDNXHTTP` → `--xray-config` → `--cdn-xhttp-install` → `--share` |

`handler --xray-config` 的内部顺序固定为 `handler_x25519_config` → `handler_xray_config` → `handler_sni_config`（tag 为 `CDNXHTTP` 时跳过 x25519 与 sni）。

### 4.3 管理配置 `menu --management`

| 编号 | 文案 | 调用 |
| --- | --- | --- |
| 1 | 更新配置 | `processes_xray_config`（= 4.2 全套） |
| 2 | 分流管理 | `menu --route` → `--warp` / `--reset-warp` / `--routing block ip\|block domain\|warp ip\|warp domain` + `--restart` |
| 3 | SNI 配置管理 | `menu --sni` → 见 4.4（要求 `.xray.tag == sni`，否则报"不支持"） |
| 4 | 修改 Xray 端口 | `--change-port` → `handler_change_xray_port` + `handler_xray_config` + `handler_restart` + `handler_share` |
| 5 | geodata 自动更新 | `--geodata-cron` |
| 6 | 设置语言 | `menu --language` → 改 `.language` → re-exec |
| 7 | 修改 REALITY 域名 | `--change-reality-domain` → `handler_change_reality_domain` + `--share`（SNI 模式会拒绝，提示走 SNI 菜单） |

### 4.4 SNI 配置 `menu --sni`

| 编号 | 动作 | 实现 |
| --- | --- | --- |
| 1 | 修改默认域名 | `--change-domain domain` → `handler_change_domain domain` → 重建 stream.conf、重签证书 |
| 2 | 修改 CDN 域名 | `--change-domain cdn` → `handler_change_domain cdn`（空值由 `--required-domain` 拦下） |
| 3 | 强制续签 | `--renew-certificate` → `handler_renew_ssl force` |
| 4 | 更新 nginx | `--nginx-update` |
| 5 | nginx 自动更新开关 | `--nginx-cron` |
| 6 | Web 配置 | `processes_web_config` → 默认页 / Cloudreve v3 / v4 → `--web <type>` |
| 7 | 重置 Cloudreve v3 管理员 | `--v3-reset` |
| 8 | 切换 CA 厂商 | `processes_ca_vendor switch` → `--ca-server` |
| 9 | 自定义域名与反代 | `menu --custom-sites` → `--custom-sites list\|add\|update\|delete` |

**分流菜单 `menu --route`** 的提示文字 `info1..info3` 都以 `1.` 开头、`info4..8` 依次是 `2.`…`6.`：这是**按选项分组的有意排版**，不是编号错乱，别"修"。

---

## 5. 状态与配置模型

### 5.1 `~/.xray-script/config.json`

```
version   脚本自身版本（v2026.11.09-r1），自更新对比用
path      PROJECT_ROOT（安装目录），install.sh 据此定位
language  zh | en | auto
xray      version / warp(0|1) / tag / port / uuid / fallback / trojan / kcp / path
          privateKey / publicKey / hash32 / target / serverNames[] / shortIds[]
          rules{reset,bt,cn,ad}（0|1）
nginx     version / deployment / ca / ca_server(zerossl|letsencrypt) / domain / cdn
          web(normal|v3|v4) / web_root / custom_sites[]
target    <诱饵域名> : [该域名可用的 serverNames...]（REALITY 伪装目标库）
rules[]   [ {type:"field", ...}, {type:"field", ip:["geoip:private"], outboundTag:"block"} ]
```

`generate_target` 从 `.target` 里随机取 key，`generate_server_names` 取对应的 serverNames 列表；`handler_change_domain` 会把 `.target[key]` 删掉并覆写 `.xray.target/.serverNames`（见 §8-4）。

### 5.2 Xray 模板矩阵（`config/xray/`，`inbounds[0]` 恒为 api dokodemo-door 127.0.0.1:32768）

| 模板 | `inbounds[1]` | 传输/安全 | `inbounds[2]` |
| --- | --- | --- | --- |
| `Vision.json` | `VLESS-Vision-REALITY` 0.0.0.0:443 | raw + reality，`xtls-rprx-vision` | — |
| `XHTTP.json` | `VLESS-XHTTP-REALITY` 0.0.0.0:443 | xhttp + reality，`/yourpath/` | — |
| `Trojan.json` | `Trojan-XHTTP-REALITY` 0.0.0.0:443 | xhttp + reality | — |
| `mKCP.json` | `VLESS-mKCP` 0.0.0.0:9527 | kcp（+ FinalMask） | — |
| `Fallback.json` | `VLESS-Vision-REALITY` 0.0.0.0:443 | raw + reality | `VLESS-XHTTP-REALITY` 监听抽象 socket `@uds2xhttp.sock` |
| `SNI.json` | `VLESS-Vision-REALITY` 监听 `/run/xray-script/xray/nginx_to_xray_vision.sock,0666`，xver=1、`acceptProxyProtocol` | raw + reality；reality target 指向 `/run/xray-script/nginx/xray_reality_to_nginx.sock` | `VLESS-XHTTP-REALITY` 监听 `/run/xray-script/xray/to_xray_xhttp.sock,0666` |
| `CDNXHTTP.json` | `VLESS-XHTTP-CDN` 监听 `/run/xray-script/xray/cdn_xhttp.sock,0660` | xhttp + none（TLS 由前置 Nginx 终结） | — |

`handler_xray_config` 的占位替换点（改模板要同步改这里）：

- 除 `sni`/`cdnxhttp` 外：`inbounds[1].port`
- 全部：`inbounds[1].settings.clients[0].id`（或 `.password`）
- `mKCP`：`inbounds[1].streamSettings.finalmask.udp[0].settings.value`
- `vision|xhttp|trojan|fallback`：`realitySettings.{target,serverNames,privateKey,shortIds}`
- `xhttp|trojan|cdnxhttp`：`inbounds[1].streamSettings.xhttpSettings.path`
- `fallback|sni`：`inbounds[2].settings.clients[0].id` + `inbounds[2].streamSettings.xhttpSettings.path`
- 全部：`inbounds[] | .sniffing.enabled = false`
- 版本闸门：xhttp/trojan/fallback/sni/cdnxhttp 需 `xray -version >= v25.3.6`；mKCP 需 `>= v26.6.1`

### 5.3 关键路径常量（`handler.sh` 头部 1–96 行）

| 常量 | 值 |
| --- | --- |
| `SCRIPT_CONFIG_PATH` | `$HOME/.xray-script/config.json` |
| `XRAY_CONFIG_PATH` | `/usr/local/etc/xray/config.json` |
| `XRAY_BIN_PATH` | `/usr/local/bin/xray` |
| `XRAY_RUNTIME_DIR` | `/run/xray-script/xray` |
| `NGINX_RUNTIME_DIR` | `/run/xray-script/nginx` |
| `NGINX_CONFIG_DIR` | `/usr/local/nginx/conf` |
| `MANAGED_NGINX_BINARY` | `/usr/local/nginx/sbin/nginx` |
| `CDN_XHTTP_SOCKET` | `/run/xray-script/xray/cdn_xhttp.sock` |
| `CDN_XHTTP_WEB_ROOT` | `/var/www/xray-cdn` |
| `ACME_PATH` | `$HOME/.acme.sh/acme.sh` |
| `XRAY_INSTALL_COMMIT` / `_SHA256` | `e42df6a772e60dd7b058f852262c4dbeb0bc231d` / `954666bb028ba8561b2218372b7db76ba051f8252b2db9195321e672263aab94`（`tool/geodata.sh` 里有一份副本） |

---

## 6. 事务与回滚：四层，别混用

| 层 | 载体 | 开启 | 提交 | 回滚 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 1 脚本配置事务 | `config.json.xray-config-transaction.bak` | `begin_script_config_transaction` | `commit_script_config_transaction` | `rollback_script_config_transaction` | **begin 会先把已存在的备份恢复回去**（即上次失败留下的备份会先"延迟回滚"一次），这是刻意的自愈语义 |
| 2 Xray 配置备份 | `config.json.transaction.$$` | `handler_xray_config` 开头 | 删除 | 失败时 `cat` 回去 | 只覆盖一次配置替换 |
| 3 CDN-XHTTP 事务 | `config.json.cdn-xhttp-transaction.bak` / `.absent` | `handler_xray_config`（tag=CDNXHTTP） | `handler_cdn_xhttp_install` 末尾 | `restore_cdn_xhttp_install_failure` | 因为 CDN 模式要先改 Xray 配置、再装前置 Nginx，跨两个命令 |
| 4 安装快照 | `.xray-install.XXXXXX` / `.cdn-xhttp-install.XXXXXX` | `handler_install` / `handler_cdn_xhttp_install` | 删除 | `restore_xray_install_state` / 嵌套 `restore_..._failure` | 二进制与 service 启停状态的快照 |

第 1 层是**跨 `handler.sh` 进程**的：`--script-config` 开启、`--xray-config` 才提交，中间隔着 `--nginx-install`。`core/main.sh` 的 `exec_handler` 在任一步非零退出时统一执行 `handler.sh --rollback-script-config`，这是整套机制的安全网。`handler_change_xray_port` 结尾故意不提交（注释写"由主流程继续处理，成功后再提交整个事务"）。

---

## 7. 验证方式（接手人怎么复现）

```powershell
# 契约测试（43 条，纯源码文本断言；cwd 必须是项目根）
& "C:\Program Files\nodejs\node.exe" tests\installer-contract.test.js

# 静态检查（0 error 是基线）
& "...\work\tools\shellcheck\shellcheck.exe" -s bash -f gcc -S warning install.sh core\*.sh service\*.sh tool\*.sh
```

当前基线：**测试 43/43 通过；shellcheck 0 error / 213 warning**（SC2155 182、SC2034 30、SC2124 1；按文件 handler 65、ssl 25、nginx 23、main 21、menu 15、share 15、docker 13、install 10、check 10、generate 7、read 7、traffic 2）。

注意：

- 本机**没有可用的 bash 运行时**（WSL/MSYS 均因沙箱禁止命名管道而启动失败），所以 `bash -n` 只能靠 shellcheck 代偿；真正的运行验证必须在 Linux 上做。
- `node --test` 在本机会以 `spawn EPERM` 失败（同样原因），必须用 `node tests/installer-contract.test.js` 直接执行。
- **CRLF 陷阱**：仓库原本没有 `.gitattributes`，而系统 gitconfig 里 `core.autocrlf=true`。Windows 检出会把 50 个文件变成 CRLF，shellcheck 会喷满 SC1017，且 `git status` 因为自动归一化显示"干净"，问题很难察觉。接手时已设 `core.autocrlf false` 并用 `git rm --cached -r .` + `git reset --hard` 重建索引，现在全部 60 个文件是 LF；并补了 `.gitattributes`（`eol=lf`）防止再次发生。**若在别的机器上 clone，请确认 `git config core.autocrlf` 不要覆盖仓库属性。**

---

## 8. 已知问题清单（按优先级，含位置与建议）

### P1 — 会造成用户可见故障或状态丢失

1. **`handler_web` 直写配置文件（`core/handler.sh:3090-3092`）**
   ```bash
   SCRIPT_CONFIG="$(echo "${SCRIPT_CONFIG}" | jq --arg web "${web}" '.nginx.web = $web')"
   echo "${SCRIPT_CONFIG}" >"${SCRIPT_CONFIG_PATH}" && sleep 2
   ```
   两个问题：`jq` 没有 `|| return 1`，一旦失败 `SCRIPT_CONFIG` 为空字符串，`>` 会把整个 `config.json` 截断成空文件；其次绕过 `persist_script_config`（无 `jq -e` 校验、无 `chmod 0600`、非原子 `mv`），`sleep 2` 也是历史遗留的盲目等待。
   **建议**：`SCRIPT_CONFIG="$(... | jq ...)" || return 1`，然后 `persist_script_config || return 1`，删掉 `sleep 2`。

2. **8 处 `persist_script_config` 未检查返回码**：`handler.sh:889, 1164, 1559, 1669, 1712, 1767, 1805, 2140`。磁盘满 / 权限异常时会静默继续，后续步骤基于"以为已保存"的状态执行。
   **建议**：统一改成 `persist_script_config || return 1`（注意：`handler_change_xray_port:1805` 处要保留"事务未提交"的语义，只加返回码检查）。

3. **`handler_change_reality_domain` 非原子双写（`handler.sh:1855-1867`）**：用 `cat "${new_config}" >"${XRAY_CONFIG_PATH}"` 和 `echo ... >"${SCRIPT_CONFIG_PATH}"` 覆盖，中途崩溃会留下半截文件（有 `.bak` 兜底，但只在后续分支才用）。它**不在**第 1 层事务里。
   **建议**：改用 `write_xray_config` + `persist_script_config`（两者都已是"临时文件 + 校验 + mv"），再保留现有 restart 校验。

4. **`handler_change_domain` 破坏 `.target` 映射（`handler.sh:2921-2924`）**：`del(.target[$key])`（key=`domain`）并把 `.xray.target/.serverNames` 覆写成新域名。SNI 场景语义正确，但从 SNI 切回 Vision/XHTTP 时，原来的"诱饵域名 → serverNames"条目已丢，只能重新生成。
   **建议**：切换回非 SNI 模式时若 `.target` 为空，自动补一条默认映射；或在文档/菜单里明确说明。

### P2 — 健壮性与安全边缘

5. **空域名校验已按输入类型分级，但仍有两条漏网**：当前 `exec_read`（`handler.sh:256-314`）对 `domain` 用 `--dns`（先 `valid_domain`，空值被拒）、对 `cdn` 用 `--required-domain`、`handler_change_domain` 自己还有 `-z` 兜底（`handler.sh:2876`）——**第 2 轮审计指出的"空 CDN 域名写出半成品站点"已修复**。剩下的缺口是 `target` 与 `reality-domain` 走 `--domain`（`check_domain_security` 默认 `required=n`，空值 `_pass`），而 `handler_change_reality_domain` 读入后没有 `-z` 检查，会把 `realitySettings.target` 写成 `":443"`；虽然 `validate_xray_config` 大概率拦下，但报错信息指向"配置非法"而不是"你没输入"。
   **建议**：`reality-domain` / `target` 也改成必填（或至少加 `-z` 早退）。

6. **第 1 层事务跨越多个进程**：`--script-config` 开启、`--xray-config` 提交，中间失败依赖 `main.sh` 的 `exec_handler` 兜底回滚。改动 `core/main.sh` 的步骤顺序时必须同步考虑；`begin` 的"先恢复旧备份"语义也意味着**陈旧备份会静默覆盖用户后续的改动**。
   **建议**：给备份加时间戳/pid 元信息，恢复前打一行 `>&2` 提示。

7. **Cloudreve v4 镜像漂移与端口暴露**：base compose 钉 `postgres:17`，但 watchtower override 用 `:latest`，重启后会漂移；`6888` 发布在所有接口（`5212` 已绑回环）。
   **建议**：watchtower 覆盖里也钉版本；`6888` 默认绑 `127.0.0.1`，需要外部访问时由 nginx 反代。

8. **`nginx.sh` 的 OpenSSL 版本探测用 `wget --no-check-certificate`**（约 568 行），与全仓"下载必校验"的风格不一致。
   **建议**：改成 `curl -fsSL`（证书正常）或对探测结果做降级处理而不是跳过校验。

9. **`generate_uuid_from_string` 的 UUIDv5 兜底分支无测试覆盖**：只有在既没有 `xray` 二进制、也没有 `/proc/sys/kernel/random/uuid` 时才走到，属于"永远测不到"的死角。
   **建议**：拆成独立可测函数，用固定输入断言 SHA1→UUIDv5 排布（含 variant nibble `((16#${digest:16:1} & 3) | 8)`）。

### P3 — 整洁度与可维护性

10. **安装器 pin 重复**：`handler.sh:85-87` 与 `tool/geodata.sh:5` 各存一份 commit + SHA256，契约测试只做字符串断言。离线无法验证 SHA 是否真实对应那个 commit。
11. **`load_i18n` / `_error` 在 `install.sh` 与 `core/handler.sh` 各有一份**（引导期不能依赖 core，属合理重复，但改动时要双边同步）。
12. **`config/nginx/nginx.service` 是死文件**：真正的 unit 由 `service/nginx.sh` 里的 heredoc 生成，这份文件没有任何引用。
13. **`Fallback.json` 的 `inbounds[2]` 用抽象 socket `@uds2xhttp.sock`**，与其它 UDS 常量（`/run/xray-script/...`）风格不一致；`handler_xray_config` 也不会改写它的 listen。需确认是有意（抽象 socket 免权限问题）还是历史遗留。
14. **README 只承诺 Debian，代码含 CentOS/Ubuntu 分支**，没有任何 CI 覆盖 → 非 Debian 路径实质上是"未验证代码"。
15. **`share.sh` 里 `fallbak_vision_reality` / `fallbak_xhttp_reality` 是拼写错误的 tag**（历史遗留），但已经进入用户可见的分享链接，**不要擅自改**，否则老配置无法复用。

### 已确认"不是 bug"的两处（避免误改）

- `menu --route` 的 `info1..info3` 都以 `1.` 开头：按选项分组的有意排版。
- `Fallback` 分享链接里的 `fallbak_*` 拼写：见 P3-15。

---

## 9. 本次接手实际做了什么

| 动作 | 细节 |
| --- | --- |
| 整树迁入 | `robocopy` 从 `...\Codex\2026-11-05\https-github-com-zxcvos-xray-script\work\fork` → `default-workspace\Xray-script`，**含 `.git`**，保留 `origin` remote 与 19 个提交 |
| 行尾归一化 | 仓库级 `git config core.autocrlf false`；`git rm --cached -r -q .` + `git reset -q --hard HEAD`；结果 60 文件全部 `w/lf`（`core/handler.sh` 149759 bytes、CR=0），`git status` 干净 |
| 防复发 | 新增 `.gitattributes`（`* text=auto eol=lf` + 各扩展名显式 `eol=lf`），以后任何人重新 clone 都不会再被 `core.autocrlf=true` 改写 |
| 清理垃圾 | 删除未跟踪的 60 字节 `$null`（内容是一条走错重定向的 rg 报错），源目录里也有同样的残留 |
| 归档审计 | 三轮审计报告 + 旧补丁 → `docs/reviews/`（见该目录） |
| 文档 | 新增本文件 `docs/HANDOVER.md` |
| **未做** | 没有改任何 `.sh`、`.json`、i18n 文案；43 条契约测试基线保持不变 |

`docs/reviews/` 内容：

| 文件 | 内容 |
| --- | --- |
| `final-independent-review.txt` | 第 1 轮：结论"有条件发布"，38/38 测试；5 项发现（陈旧事务备份、Debian 11 依赖、`xray` 用户未强制、`latest` 未排除预发布、孤儿事务文件） |
| `final-independent-review-round2.txt` | 第 2 轮：2 个 Medium（空 CDN 域名、跨命令事务）+ 3 个 Low（端口切换重启两次、Cloudreve 镜像/端口） |
| `final-independent-review-round3.txt` | 第 3 轮：结论"可发布"，39/39；仅剩 Low/Info（`persist` 未检查、REALITY 双写非原子、pin 重复、SNI CDN 强制为有意变更） |
| `xray-install-compat.patch` | 旧思路补丁（`-u root` → `--no-update-service`），现已被 `b344f40` 的"钉死 commit + SHA256 + `bash -s --`"方案取代，仅作历史留档 |

---

## 10. 建议的后续路线（按性价比排序）

1. **修 P1-1 / P1-2 / P1-3**：三个独立提交，每个都在 `tests/installer-contract.test.js` 加一条断言（例如 `assert(!/echo "\$\{SCRIPT_CONFIG\}" >/.test(handler))`），保持 43 → 46 条全绿。
2. **补齐域名必填**（P2-5）：`reality-domain` / `target` 从 `--domain` 换成必填校验，补一条"空输入被拒"的测试。
3. **Cloudreve 加固**（P2-7）：钉镜像版本、`6888` 绑回环。
4. **加 CI**（`.github/workflows/ci.yml`）：`shellcheck -S warning` + `node tests/installer-contract.test.js` + `bash -n`（runner 是 Linux，天然可跑）。
5. **决定是否接入上游**：加 `upstream = zxcvos/Xray-script` 并定期 rebase；当前 fork 已经把 handler 改得面目全非，直接 merge 大概率冲突，建议"只 cherry-pick 明确修复"。
6. **发版**：把 `config.json.version` 提到 `v2026.11.10`，README changelog 加第 14 条（对应上面 1–3 的修复）。

---

## 11. 需要主人拍板的事

1. P1 三项是否现在就修？（会改动脚本逻辑，但不改行为契约）
2. 是否把 `zxcvos/Xray-script` 设为 `upstream` 并跟踪？
3. 是否顺手把 README 的"支持系统"与代码能力对齐（要么补验证，要么明说不支持 CentOS/Ubuntu）？
4. 是否需要我把 `reality-domain` / `target` 的输入从"可空"改成"必须输入"？（会轻微改变交互体验）

---

## 附录 A：`handler.sh` 命令速查

```
--quick <Vision|XHTTP|Fallback>     一键安装
--install <ver> [y] [n]             安装/更新 Xray（y=强制）
--version [latest|custom]           查询/交互选择版本
--check-version <tag>               校验协议所需最低 Xray 版本
--purge                             卸载
--nginx-install|--nginx-update|--nginx-purge
--script-config <tag>               生成脚本参数（事务开启）
--xray-config [<web>]               写 Xray 配置（事务提交；CDN 模式延后）
--sni-ports | --cdn-xhttp-ports     端口/防火墙预检
--cdn-xhttp-install                 CDN-XHTTP 前置 Nginx 安装
--routing <block|warp> <ip|domain>  添加分流规则
--change-domain <domain|cdn>        改域名（重建 stream + 重签证书）
--renew-certificate [force]
--web <normal|v3|v4>
--v3-reset | --ca-server <zerossl|letsencrypt>
--custom-sites <list|add|update|delete>
--share | --traffic | --bbr | --warp | --reset-warp | --geodata-cron | --nginx-cron
--change-port | --change-reality-domain
--start | --stop | --restart
--rollback-script-config            （dispatcher 兜底用）
```

## 附录 B：i18n 结构

```
title      error / info / warning / tip / route
main       handler_failed
menu       choose / status / index / full_installation / xray_version / protocol_config
           web_config / ca_vendor / config_management / route_management / sni_config / custom_sites
handler    domain / script / xray / reality / warp / geodata / nginx / custom_sites / sni / cdn_xhttp
read       version / rules / block_bt / block_cn / block_ad / auto_geo / port / uuid / fallback
           seed / password / target / reality_domain / only_change_domain / domain / cdn
           custom_domain / proxy_target / site_index / email / switch_ca / short / short_id_tip
           path / warp_ip / warp_domain / block_ip / block_domain
share      client / extra / link / qr
check / docker / ssl / nginx / bbr
```

新增任何 key 必须 **zh.json 与 en.json 同时加**，否则契约测试会失败。
