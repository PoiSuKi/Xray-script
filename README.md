# Xray-REALITY 管理脚本

* 一个纯 Shell 编写的 REALITY 管理脚本
* 使用 VLESS-XTLS-uTLS-REALITY 配置
* 实现 dest 的自选与自填
* 实现自填 dest 的 spiderX 的自定义
* 实现自填 dest 的 TLSv1.3 与 H2 验证
* 实现自填 dest 的 serverNames 自动获取
* 实现 serverNames 通配符域名与 CDN SNI 域名的过滤
* 默认配置禁回国流量、广告、bt
* 实现 geo 文件的自动更新

## 如何使用

* wget

  ```sh
  wget --no-check-certificate -O ${HOME}/Xray-script.sh https://raw.githubusercontent.com/zxcvos/Xray-script/main/reality.sh
  bash ${HOME}/Xray-script.sh
  ```

* curl

  ```sh
  curl -fsSL -o ${HOME}/Xray-script.sh https://raw.githubusercontent.com/zxcvos/Xray-script/main/reality.sh
  bash ${HOME}/Xray-script.sh
  ```

## 致谢

[Xray-core][Xray-core]

[REALITY][REALITY]

[chika0801 Xray 配置文件模板][chika0801-Xray-examples]

[Xray-core]: https://github.com/XTLS/Xray-core (THE NEXT FUTURE)
[REALITY]: https://github.com/XTLS/REALITY (THE NEXT FUTURE)
[chika0801-Xray-examples]: https://github.com/chika0801/Xray-examples (chika0801 Xray 配置文件模板)

**此脚本仅供交流学习使用，请勿使用此脚本行违法之事。网络非法外之地，行非法之事，必将接受法律制裁。**
