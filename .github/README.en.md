<!-- Translated by AI -->
[中文](/README.md) | English

# Xray Management Script :sparkles:

* A pure Shell-based Xray management script
* Optional configurations:
  * mKCP (VLESS-mKCP-seed)
  * Vision (VLESS-Vision-REALITY)
  * XHTTP (VLESS-XHTTP-REALITY)
  * Trojan (Trojan-XHTTP-REALITY)
  * Fallback (includes VLESS-Vision-REALITY and VLESS-XHTTP-REALITY)
  * SNI (includes Vision_REALITY, XHTTP_REALITY, XHTTP_TLS)
* SNI configuration uses Nginx to implement SNI traffic splitting, suitable for CDN routing, upstream/downstream separation, and multi-site coexistence
* SNI share links support upstream/downstream separation (upstream xhttp+TLS+CDN | downstream xhttp+Reality, upstream xhttp+Reality | downstream xhttp+TLS+CDN)
* SNI configuration supports managing custom domains and reverse proxy apps, with independent certificates, site configs, stream mappings, and UDS per site
* Rule configuration and custom input:
  * Block BitTorrent traffic (optional)
  * Block China-bound IP traffic (optional)
  * Ad blocking (optional)
  * Add custom WARP Proxy routing rules
  * Add custom blocking routing rules
* Toggle Cloudflare WARP Proxy ( :whale: Docker deployment)
* Toggle geodata auto-update
* Xray port defaults and custom input:
  * VLESS-mKCP: randomly generated
  * ALL-REALITY: 443
* UUID defaults and custom input:
  * Randomly generated
  * Custom standard UUID input
  * Non-standard UUID mapped to UUID
* kcp(seed) and trojan(password) defaults and custom input:
  * Randomly generated (example: cw-GEMDYgwIV3_g#)
  * Custom input
* target defaults and custom input:
  * Randomly selected from serverNames.json
  * TLSv1.3 and H2 validation for custom target
  * Automatic serverNames lookup for custom target
* shortId defaults and custom input:
  * Random generation (default two shortIds, e.g. 01234567, 0123456789abcdef)
  * Custom shortId input
  * If input is 0 to 8, shortIds with length 0-16 are auto-generated
  * Supports multiple values separated by commas
* path defaults and custom input:
  * Randomly generated (example: /8ugSUeNJ.9OEnTErb.dVZMUAFu)
  * Custom input (example: /8ugSUeNJ, with or without `/`)

## FAQ

1. If installation succeeds but service is unusable, check whether the server ports are open. You can verify using `https://tcp.ping.pe/ip:port`.
2. Before using SNI configuration, ensure VPS HTTP (80) and HTTPS (443) ports are open.
3. Before using SNI configuration, do not enable CDN protection, otherwise SSL issuance may fail.
4. For upstream/downstream separation details, see [XHTTP: Beyond REALITY][XHTTP] and [xhttp 五合一配置][xhttp 五合一配置].
5. If you encounter 【Could not get nonce, let's try again】 while issuing certificates with SNI, check the [ZeroSSL status page](https://status.zerossl.com/). Most likely ZeroSSL 【Free ACME Service】 is in 【Service disruption】 or 【Service outage】.

## Changelog

1. v2026.11.05 adapts to the current Xray installer by removing the obsolete `-u root` option, supporting the dedicated `xray` runtime user and configuration permissions, delegating GeoData updates to the official `update-geodata` action, and moving script self-updates to the PoiSuKi fork.
2. v2026.11.05-r2 resolves the Nginx mainline version from the official Nginx download page, avoids recompiling when versions are unchanged, ensures SNI mode uses the script-managed `/usr/local/nginx`, and disables inbound traffic sniffing for every Xray template by default.
3. v2026.11.05-r3 uses the Mihomo/Clash transport name `tcp` in client output and adds `support-x25519mlkem768=true` to Reality share links for Xray v26.9.8+ REALITY handshakes.
4. v2026.11.05-r4 adds menu option `99. Update Script` and a management action that changes only the REALITY domain while preserving all other settings.
5. v2026.11.05-r5 adds `88. One-click BBR Install`, using the kernel `tcp_bbr` module, `fq` qdisc, and persistent `sysctl.d`/`modules-load.d` configuration.
6. v2026.11.05-r6 skips `nginx.service` state checks when the script-managed Nginx is not installed, removing the systemd `Failed to get unit file state for nginx.service` message from Xray-only configurations.
7. v2026.11.05-r7 preserves custom UUID input as a single argument and displays `SupportX25519MLKEM768` in the terminal client configuration.
8. v2026.11.07 separates SNI runtime socket directories for the Nginx and Xray service users, and adds XHTTP/TLS `stream-one`, H2 ALPN validation, minimum Xray version checks, and SNI domain-edit protection. Re-apply SNI configuration once after upgrading to migrate socket paths.
9. v2026.11.07-r1 updates the tested systems to Debian 11, 12, and 13, and clarifies the compatibility note for other systems.
10. v2026.11.08 synchronizes the official Xray installer with the installed version, adds transactional Xray config rollback, an unprivileged Nginx worker with atomic binary/module updates, DNS family checks, TCP timeouts, and HTTP redirect detection. Regular XHTTP TLS links through Cloudflare now use the more compatible `packet-up` mode, while split up/down links use `stream-up` as required by the official behavior.

## Share Links

Implemented based on [VMessAEAD / VLESS share link proposal](https://github.com/XTLS/Xray-core/discussions/716) and [v2rayN](https://github.com/2dust/v2rayN). If other clients do not work, adjust based on the generated share link manually.

In SNI configuration, CDN share links use H2 as default ALPN. If you need H3, modify it in your client.

## How to Use

* Download

  ```sh
  wget --no-check-certificate -O ${HOME}/Xray-script.sh https://github.com/PoiSuKi/Xray-script/raw/refs/heads/main/install.sh
  ```

* Usage
  * Launch UI

    ```sh
    bash ${HOME}/Xray-script.sh
    ```

  * Quick install Vision

    ```sh
    bash ${HOME}/Xray-script.sh --vision
    ```

  * Quick install XHTTP

    ```sh
    bash ${HOME}/Xray-script.sh --xhttp
    ```

  * Quick install Fallback

    ```sh
    bash ${HOME}/Xray-script.sh --fallback
    ```

* Quick start (UI)

  ```sh
  wget --no-check-certificate -O ${HOME}/Xray-script.sh https://github.com/PoiSuKi/Xray-script/raw/refs/heads/main/install.sh && bash ${HOME}/Xray-script.sh
  ```

## Script UI

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
WARP Proxy : Running
-------------------------------------------

--------------- Xray-script ---------------
 Version      : v2025-07-25
 Description  : Xray Management Script
----------------- Install -----------------
1. Full installation
2. Install/Update only
3. Uninstall
----------------- Operation ----------------
4. Start
5. Stop
6. Restart
---------------- Configuration -------------
7. Share links and QR codes
8. Statistics
9. Manage configuration
88. One-click BBR install
99. Update script
-------------------------------------------
0. Exit
```

## Tested Systems

| Platform | Version    |
| -------- | ---------- |
| Debian   | 11, 12, 13 |

The distributions above have been tested successfully.

Other systems may work, but are untested and may have issues.

## Install Paths

| Item | Path |
| --- | --- |
| Xray-script | `/usr/local/xray-script` |
| Script configuration | `$HOME/.xray-script` |
| Xray binary | `/usr/local/bin/xray` |
| Xray configuration | `/usr/local/etc/xray` |
| Xray GeoData | `/usr/local/share/xray` |
| Xray logs | `/var/log/xray` |
| Xray runtime socket | `/run/xray-script/xray` |
| Nginx | `/usr/local/nginx` |
| Nginx logs | `/var/log/nginx` |
| Nginx runtime socket | `/run/xray-script/nginx` |
| systemd services | `/etc/systemd/system/xray.service`, `/etc/systemd/system/nginx.service` |
| Cloudreve v3 | `$HOME/.xray-script/docker/cloudreve/v3` |
| Cloudreve v4 | `$HOME/.xray-script/docker/cloudreve/v4` |
| Cloudflare WARP | `$HOME/.xray-script/docker/cloudflare-warp` |
| acme.sh | `$HOME/.acme.sh` |

## Dependency List

The script checks and installs the following Debian dependencies as needed. Xray, Docker, and Nginx repository components are handled by their respective official installation flows.

| Purpose | Dependencies |
| --- | --- |
| Base runtime and downloads | `ca-certificates`, `curl`, `wget`, `git`, `jq`, `tzdata`, `qrencode`, `socat` |
| System management | `cron`, `bsdmainutils`, `iproute2`, `procps`, `bind9-dnsutils` |
| Nginx build basics | `gcc`, `g++`, `make`, `tar`, `gzip`, `perl-base`, `perl` |
| Nginx build libraries | `libpcre2-dev`, `zlib1g-dev`, `libxml2-dev`, `libxslt1-dev`, `libgd-dev`, `libgeoip-dev`, `libgoogle-perftools-dev`, `libperl-dev`, `libbrotli-dev` |
| SSL and certificates | `openssl`, `curl`, `cron` |
| Xray | Installed and managed by [Xray-install](https://github.com/XTLS/Xray-install) |
| SNI web components | Docker Engine and Docker Compose are installed on demand; Cloudreve and Cloudflare WARP containers are built when selected |
| BBR | The Linux kernel must provide the `tcp_bbr` module; `sch_fq` is recommended |

## Acknowledgements

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

**This script is for study and communication only. Do not use it for illegal purposes. Illegal acts on the network are still illegal and will be punished by law.**

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
