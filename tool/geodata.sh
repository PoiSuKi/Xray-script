#!/usr/bin/env bash

set -e

readonly XRAY_INSTALL_URL="https://github.com/XTLS/Xray-install/raw/main/install-release.sh"

installer="$(curl -fsSL --retry 5 --retry-delay 2 "${XRAY_INSTALL_URL}")"
bash -c "${installer}" @ update-geodata

if systemctl -q is-active xray; then
    systemctl restart xray
fi
