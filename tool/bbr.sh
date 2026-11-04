#!/usr/bin/env bash

set -euo pipefail

PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin
export PATH

CUR_DIR="$(cd -P -- "$(dirname -- "$0")" && pwd -P)"
readonly CUR_DIR
PROJECT_ROOT="$(cd -P -- "${CUR_DIR}/.." && pwd -P)"
readonly PROJECT_ROOT
readonly SCRIPT_CONFIG_DIR="${HOME}/.xray-script"
readonly SCRIPT_CONFIG_PATH="${SCRIPT_CONFIG_DIR}/config.json"
readonly SYSCTL_CONFIG="/etc/sysctl.d/99-xray-script-bbr.conf"
readonly MODULES_CONFIG="/etc/modules-load.d/99-xray-script-bbr.conf"

WORK_DIR="$(mktemp -d)"
cleanup() {
    rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

load_i18n() {
    local lang
    lang="$(jq -r '.language // "zh"' "${SCRIPT_CONFIG_PATH}" 2>/dev/null || echo zh)"
    if [[ "${lang}" == "auto" ]]; then
        lang="${LANG%%_*}"
    fi
    [[ -f "${PROJECT_ROOT}/i18n/${lang}.json" ]] || lang='zh'
    I18N_DATA="$(jq -c '.' "${PROJECT_ROOT}/i18n/${lang}.json")"
}

message() {
    echo "${I18N_DATA}" | jq -r --arg key "$1" '.bbr[$key]'
}

print_info() {
    printf "\033[32m[Info]\033[0m %s\n" "$1"
}

print_warn() {
    printf "\033[33m[Warning]\033[0m %s\n" "$1"
}

print_error() {
    printf "\033[31m[Error]\033[0m %s\n" "$1" >&2
    exit 1
}

load_i18n

[[ "$(id -u)" -eq 0 ]] || print_error "$(message not_root)"

virt=''
if command -v systemd-detect-virt >/dev/null 2>&1; then
    virt="$(systemd-detect-virt --container 2>/dev/null || true)"
fi
case "${virt}" in
lxc | openvz)
    print_error "$(message unsupported_virt)"
    ;;
esac

print_info "$(message checking)"
modprobe tcp_bbr >/dev/null 2>&1 || true

available_cc="$(sysctl -n net.ipv4.tcp_available_congestion_control 2>/dev/null || true)"
if ! tr ' ' '\n' <<<"${available_cc}" | grep -qx 'bbr'; then
    print_error "$(message module_missing)"
fi

fq_available='0'
if modprobe sch_fq >/dev/null 2>&1 || [[ "$(sysctl -n net.core.default_qdisc 2>/dev/null || true)" == 'fq' ]]; then
    fq_available='1'
fi

old_cc="$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || true)"
old_qdisc="$(sysctl -n net.core.default_qdisc 2>/dev/null || true)"

sysctl_backup=''
modules_backup=''
if [[ -f "${SYSCTL_CONFIG}" ]]; then
    sysctl_backup="${WORK_DIR}/sysctl.backup"
    cp -p "${SYSCTL_CONFIG}" "${sysctl_backup}"
fi
if [[ -f "${MODULES_CONFIG}" ]]; then
    modules_backup="${WORK_DIR}/modules.backup"
    cp -p "${MODULES_CONFIG}" "${modules_backup}"
fi

rollback() {
    if [[ -n "${sysctl_backup}" ]]; then
        cp -p "${sysctl_backup}" "${SYSCTL_CONFIG}"
    else
        rm -f "${SYSCTL_CONFIG}"
    fi
    if [[ -n "${modules_backup}" ]]; then
        cp -p "${modules_backup}" "${MODULES_CONFIG}"
    else
        rm -f "${MODULES_CONFIG}"
    fi
    [[ -n "${old_cc}" ]] && sysctl -q -w "net.ipv4.tcp_congestion_control=${old_cc}" >/dev/null 2>&1 || true
    [[ -n "${old_qdisc}" ]] && sysctl -q -w "net.core.default_qdisc=${old_qdisc}" >/dev/null 2>&1 || true
}

if [[ "${old_cc}" == 'bbr' ]] && { [[ "${fq_available}" == '0' ]] || [[ "${old_qdisc}" == 'fq' ]]; }; then
    print_info "$(message already_enabled)"
else
    print_info "$(message enabling)"
fi

mkdir -p "$(dirname "${SYSCTL_CONFIG}")" "$(dirname "${MODULES_CONFIG}")"

{
    echo '# Managed by Xray-script'
    echo 'net.ipv4.tcp_congestion_control = bbr'
    if [[ "${fq_available}" == '1' ]]; then
        echo 'net.core.default_qdisc = fq'
    fi
} >"${WORK_DIR}/sysctl.conf"

{
    echo '# Managed by Xray-script'
    echo 'tcp_bbr'
    [[ "${fq_available}" == '1' ]] && echo 'sch_fq'
} >"${WORK_DIR}/modules.conf"

if ! install -m 0644 "${WORK_DIR}/sysctl.conf" "${SYSCTL_CONFIG}" ||
    ! install -m 0644 "${WORK_DIR}/modules.conf" "${MODULES_CONFIG}"; then
    rollback
    print_error "$(message apply_failed)"
fi
sysctl --system >/dev/null 2>&1 || true

if ! sysctl -q -w 'net.ipv4.tcp_congestion_control=bbr' >/dev/null 2>&1; then
    rollback
    print_error "$(message apply_failed)"
fi

if [[ "${fq_available}" == '1' ]] && ! sysctl -q -w 'net.core.default_qdisc=fq' >/dev/null 2>&1; then
    rollback
    print_error "$(message apply_failed)"
fi

if [[ "$(sysctl -n net.ipv4.tcp_congestion_control)" != 'bbr' ]]; then
    rollback
    print_error "$(message verify_failed)"
fi

if [[ "${fq_available}" == '0' ]]; then
    print_warn "$(message fq_unavailable)"
fi

print_info "$(message completed)"
printf '%s\n' "$(message status): net.ipv4.tcp_congestion_control=$(sysctl -n net.ipv4.tcp_congestion_control), net.core.default_qdisc=$(sysctl -n net.core.default_qdisc)"
