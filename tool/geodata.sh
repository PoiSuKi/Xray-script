#!/usr/bin/env bash

set -e

readonly XRAY_INSTALL_COMMIT="e42df6a772e60dd7b058f852262c4dbeb0bc231d"
readonly XRAY_INSTALL_SHA256="954666bb028ba8561b2218372b7db76ba051f8252b2db9195321e672263aab94"
readonly XRAY_INSTALL_URL="https://raw.githubusercontent.com/XTLS/Xray-install/${XRAY_INSTALL_COMMIT}/install-release.sh"

installer="$(curl -fsSL --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 300 "${XRAY_INSTALL_URL}")"
digest="$(printf '%s\n' "${installer}" | sha256sum | awk '{print $1}')"
[[ "${digest}" == "${XRAY_INSTALL_SHA256}" ]]
bash -n <<<"${installer}"
bash -s -- update-geodata <<<"${installer}"

if systemctl -q is-active xray; then
    systemctl restart xray
fi
