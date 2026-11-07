中文 | [English](/.github/README.en.md)

# Xray 管理脚本 :sparkles:

* 一个纯 Shell 编写的 Xray 管理脚本
* 可选配置:
  * mKCP (VLESS-mKCP-seed)
  * Vision (VLESS-Vision-REALITY)
  * XHTTP (VLESS-XHTTP-REALITY)
  * trojan (Trojan-XHTTP-REALITY)
  * Fallback (包含 VLESS-Vision-REALITY、VLESS-XHTTP-REALITY)
  * SNI (包含 Vision_REALITY、XHTTP_REALITY、XHTTP_TLS)
* SNI 配置由 Nginx 实现 SNI 分流，适合过 CDN、上下行分离、多网站共存等需求
* SNI 分享链接实现了上下行分离(上行 xhttp+TLS+CDN | 下行 xhttp+Reality、上行 xhttp+Reality | 下行 xhttp+TLS+CDN)
* SNI 配置支持管理自定义域名与反代应用，每个站点拥有独立证书、独立站点配置、独立 stream 映射与 UDS
* 规则配置与自填:
  * 禁止 bittorrent 流量(可选)
  * 禁止回国 ip 流量(可选)
  * 屏蔽广告(可选)
  * 添加自定义 WARP Proxy 分流
  * 添加自定义屏蔽分流
* 开关 Cloudflare WARP Proxy( :whale: Docker 部署)
* 开关 geodata 自动更新功能
* xray 端口默认与自填:
  * VLESS-mKCP: 随机生成
  * ALL-REALITY: 443
* UUID 默认与自填:
  * 随机生成
  * 自定义输入标准 UUID
  * 非标准 UUID 映射转化为 UUID
* kcp(seed) 和 trojan(password) 默认与自填:
  * 随机生成(格式: cw-GEMDYgwIV3_g#)
  * 自定义输入
* target 默认与自填:
  * 随机在 serverNames.json 中获取
  * 实现自填 target 的 TLSv1.3 与 H2 验证
  * 实现自填 target 的 serverNames 自动获取
* shortId 默认与自填:
  * 随机生成(默认两个 shortId 例如: 01234567, 0123456789abcdef)
  * 实现自填 shortId
  * 实现输入值为 0 到 8, 则自动生成对 0-16 长度的 shortId
  * 支持逗号分隔的多个值
* path 默认与自填:
  * 随机生成(格式: /8ugSUeNJ.9OEnTErb.dVZMUAFu)
  * 自定义输入(格式: /8ugSUeNJ, 加不加 `/` 都可以)

## 问题

1. 如果安装成功，但无法使用，请检查服务器是否开启对应端口，可通过 `https://tcp.ping.pe/ip:port` 验证服务器端口是否开放。
2. 使用 SNI 配置前，请确保 VPS 的 HTTP(80) 与 HTTPS(443) 端口开放。
3. 使用 SNI 配置前，请不要开启 CDN 保护，不然无法正常申请 SSL 证书。
4. 上下行分离详情请看 [XHTTP: Beyond REALITY][XHTTP] 与 [xhttp 五合一配置][xhttp 五合一配置] 了解。
5. 使用 SNI 获取证书时遇到 【Could not get nonce, let's try again】 请查看 [ZeroSSL 状态页](https://status.zerossl.com/)，大概率是 ZeroSSL 的【Free ACME Service】处于 【Service disruption】或【Service outage】状态。

## 更新日志

1. v2026.11.05 版本适配新版 Xray 官方安装器：移除已废弃的 `-u root` 参数，兼容专用 `xray` 运行用户与配置权限，GeoData 更新改用官方 `update-geodata`，并将脚本自更新地址切换至 PoiSuKi fork。
2. v2026.11.05-r2 版本将 Nginx 主线版本来源切换为 Nginx 官方下载页，修复版本相同时重复编译，并确保 SNI 模式始终使用脚本管理的 `/usr/local/nginx`；同时默认关闭所有 Xray 入站流量探测。
3. v2026.11.05-r3 版本将客户端传输名称统一为 Mihomo/Clash 使用的 `tcp`，并为 Reality 分享链接添加 `support-x25519mlkem768=true`，以兼容 Xray v26.9.8+ 的 REALITY 握手要求。
4. v2026.11.05-r4 版本在主菜单新增 `99. 更新脚本`，并新增仅修改 REALITY 域名、保留其余设置的管理功能。
5. v2026.11.05-r5 版本新增 `88. 一键安装 BBR`，通过内核 `tcp_bbr` 模块、`fq` 队列和 `sysctl.d`/`modules-load.d` 实现即时启用与开机持久化。
6. v2026.11.05-r6 版本修复纯 Xray 配置在未安装 Nginx 时仍检查 `nginx.service`，导致 systemd 输出 `Failed to get unit file state for nginx.service` 的问题。
7. v2026.11.05-r7 版本修复自定义 UUID 输入被 shell 拆分的问题，并在终端客户端配置中显示 `SupportX25519MLKEM768`。
8. v2026.11.07 版本重构 SNI 运行时 Socket 目录，使 Nginx 与 Xray 专用用户权限和启停生命周期隔离；同时增加 XHTTP/TLS `stream-one`、H2 ALPN 校验、最低 Xray 版本检查和 SNI 域名修改保护。升级后请重新应用一次 SNI 配置以迁移 Socket 路径。
9. v2026.11.07-r1 版本将已测试系统更新为 Debian 11、12、13，并调整其他系统的兼容性说明。
10. v2026.11.08 版本按实际版本同步官方 Xray 安装器，增加 Xray 配置事务回滚、Nginx 非 root worker 与二进制/模块原子更新、DNS 分族校验、TCP 超时和 HTTP 重定向检测；XHTTP+Cloudflare 普通 TLS 链接改用兼容性更好的 `packet-up`，上下行分离链接按官方要求使用 `stream-up`。

## 分享链接

基于[VMessAEAD / VLESS 分享链接标准提案](https://github.com/XTLS/Xray-core/discussions/716)与[v2rayN](https://github.com/2dust/v2rayN)实现，如果其他客户端无法正常使用，请自行根据分享链接进行修改。

SNI 配置中，CDN 的分享链接 Alpn 默认为 H2，如有 H3 需求，请自行在客户端修改。

## 如何使用

* 获取

  ```sh
  wget --no-check-certificate -O ${HOME}/Xray-script.sh https://raw.githubusercontent.com/PoiSuKi/Xray-script/main/install.sh
  ```

* 使用
  * 启动界面

    ```sh
    bash ${HOME}/Xray-script.sh
    ```

  * 快速安装 Vision

    ```sh
    bash ${HOME}/Xray-script.sh --vision
    ```

  * 快速安装 XHTTP

    ```sh
    bash ${HOME}/Xray-script.sh --xhttp
    ```

  * 快速安装 Fallback

    ```sh
    bash ${HOME}/Xray-script.sh --fallback
    ```

* 快速启动(界面)

  ```sh
  wget --no-check-certificate -O ${HOME}/Xray-script.sh https://raw.githubusercontent.com/PoiSuKi/Xray-script/main/install.sh && bash ${HOME}/Xray-script.sh
  ```

## 脚本界面

```sh
 __   __  _    _   _______   _______   _____  
 \ \ / / | |  | | |__   __| |__   __| |  __ \ 
  \ V /  | |__| |    | |       | |    | |__) |
   > <   |  __  |    | |       | |    |  ___/ 
  / . \  | |  | |    | |       | |    | |     
 /_/ \_\ |_|  |_|    |_|       |_|    |_|     

Copyright (C) zxcvos | https://github.com/zxcvos/Xray-script

-------------------------------------------
Xray       : v25.7.26
CONFIG     : VLESS-Vision-REALITY
WARP Proxy : 已启动
-------------------------------------------

--------------- Xray-script ---------------
 Version      : v2025-07-25
 Description  : Xray 管理脚本
----------------- 装载管理 ----------------
1. 完整安装
2. 仅安装/更新
3. 卸载
----------------- 操作管理 ----------------
4. 启动
5. 停止
6. 重启
----------------- 配置管理 ----------------
7. 分享链接与二维码
8. 信息统计
9. 管理配置
88. 一键安装 BBR
99. 更新脚本
-------------------------------------------
0. 退出
```

## 已测试系统

| Platform | Version    |
| -------- | ---------- |
| Debian   | 11, 12, 13 |

以上发行版均通过测试安装。

其他系统可能能用，但未测试过，可能存在问题。

## 安装位置

| 项目 | 路径 |
| --- | --- |
| Xray-script | `/usr/local/xray-script` |
| 脚本配置 | `$HOME/.xray-script` |
| Xray 二进制 | `/usr/local/bin/xray` |
| Xray 配置 | `/usr/local/etc/xray` |
| Xray GeoData | `/usr/local/share/xray` |
| Xray 日志 | `/var/log/xray` |
| Xray 运行时 Socket | `/run/xray-script/xray` |
| Nginx | `/usr/local/nginx` |
| Nginx 日志 | `/var/log/nginx` |
| Nginx 运行时 Socket | `/run/xray-script/nginx` |
| systemd 服务 | `/etc/systemd/system/xray.service`、`/etc/systemd/system/nginx.service` |
| Cloudreve v3 | `$HOME/.xray-script/docker/cloudreve/v3` |
| Cloudreve v4 | `$HOME/.xray-script/docker/cloudreve/v4` |
| Cloudflare WARP | `$HOME/.xray-script/docker/cloudflare-warp` |
| acme.sh | `$HOME/.acme.sh` |

## 依赖列表

脚本会按需检查并安装以下 Debian 依赖。Xray、Docker 和 Nginx 的软件源组件由各自官方安装流程处理。

| 用途 | 依赖 |
| --- | --- |
| 基础运行与下载 | `ca-certificates`、`curl`、`wget`、`git`、`jq`、`tzdata`、`qrencode`、`socat` |
| 系统管理 | `cron`、`bsdmainutils`、`iproute2`、`procps`、`bind9-dnsutils` |
| Nginx 编译基础 | `gcc`、`g++`、`make`、`tar`、`gzip`、`perl-base`、`perl` |
| Nginx 编译库 | `libpcre2-dev`、`zlib1g-dev`、`libxml2-dev`、`libxslt1-dev`、`libgd-dev`、`libgeoip-dev`、`libgoogle-perftools-dev`、`libperl-dev`、`libbrotli-dev` |
| SSL 与证书 | `openssl`、`curl`、`cron` |
| Xray | 由 [Xray-install](https://github.com/XTLS/Xray-install) 安装并提供所需运行环境 |
| SNI Web 组件 | 按需安装 Docker Engine、Docker Compose，并构建 Cloudreve、Cloudflare WARP 容器 |
| BBR | Linux 内核需提供 `tcp_bbr` 模块，推荐提供 `sch_fq` 队列模块 |

## 致谢

[Xray-core][Xray-core]

[REALITY][REALITY]

[XHTTP: Beyond REALITY][XHTTP]

[integrated-examples][lxhao61/integrated-examples]

[xhttp 五合一配置][xhttp 五合一配置]

[部署 Cloudflare WARP Proxy][haoel]

[cloudflare-warp 镜像][e7h4n]

[V2Ray 路由规则文件加强版][v2ray-rules-dat]

[kirin10000/Xray-script][kirin10000/Xray-script]

[Cloudreve][cloudreve]

**此脚本仅供交流学习使用，请勿使用此脚本行违法之事。网络非法外之地，行非法之事，必将接受法律制裁。**

[Xray-core]: https://github.com/XTLS/Xray-core (THE NEXT FUTURE)
[REALITY]: https://github.com/XTLS/REALITY (THE NEXT FUTURE)
[XHTTP]: https://github.com/XTLS/Xray-core/discussions/4113 (XHTTP: Beyond REALITY)
[lxhao61/integrated-examples]: https://github.com/lxhao61/integrated-examples (以 V2Ray（v4 版） 或 Xray、Nginx 或 Caddy（v2 版）、Hysteria 等打造常用科学上网的优化配置及最优组合示例，且提供集成特定插件的 Caddy（v2 版） 文件，分享给大家食用及自己备份。)
[xhttp 五合一配置]: https://github.com/XTLS/Xray-core/discussions/4118 (xhttp 五合一配置 \( reality 直连与过 CDN 共存, 附小白可抄的配置\))
[haoel]: https://github.com/haoel/haoel.github.io#943-docker-%E4%BB%A3%E7%90%86 (使用 Docker 快速部署 Cloudflare WARP Proxy)
[e7h4n]: https://github.com/e7h4n/cloudflare-warp (cloudflare-warp 镜像)
[v2ray-rules-dat]: https://github.com/Loyalsoldier/v2ray-rules-dat (V2Ray 路由规则文件加强版)
[kirin10000/Xray-script]: https://github.com/kirin10000/Xray-script (kirin10000/Xray-script)
[cloudreve]: https://github.com/cloudreve/cloudreve (cloudreve)
