#!/usr/bin/env bash
# =============================================================================
# 注释: 通过 Qwen3-Coder 生成。
# 脚本名称: nginx.sh
# 脚本仓库: https://github.com/zxcvos/Xray-script
# 功能描述: 用于从源代码编译、安装、更新和卸载 Nginx 的脚本。
#           支持集成最新版 OpenSSL 和可选的 Brotli 压缩模块。
#           负责管理 Nginx 的 systemd 服务配置。
# 作者: zxcvos
# 时间: 2025-07-25
# 版本: 1.0.0
# 依赖: bash, curl, wget, git, gcc, make, awk, grep, sed, sort, tr, systemctl, jq,
#       dnf/yum/apt (用于安装编译依赖)
# 配置:
#   - ${TMPFILE_DIR}/: 用于下载和编译的临时工作目录
#   - ${NGINX_PATH}/: Nginx 的安装目录 (/usr/local/nginx)
#   - ${NGINX_LOG_PATH}/: Nginx 的日志目录 (/var/log/nginx)
#   - /etc/systemd/system/nginx.service: Nginx systemd 服务文件
#   - ${SCRIPT_CONFIG_DIR}/config.json: 用于读取语言设置 (language)
#   - ${I18N_DIR}/${lang}.json: 用于读取具体的提示文本 (i18n 数据文件)
# 相关链接:
#   - NGINX 官方文档: https://nginx.org/en/linux_packages.html
#   - NGINX 更新参考: https://zhuanlan.zhihu.com/p/193078620
#   - GCC 优化参考: https://github.com/kirin10000/Xray-script
#   - Brotli 模块参考: https://www.nodeseek.com/post-37224-1
#   - ngx_brotli 模块: https://github.com/google/ngx_brotli
#
# Copyright (C) 2025 zxcvos
# =============================================================================

# set -Eeuxo pipefail

# --- 环境与常量设置 ---
PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin:/snap/bin
export PATH

# 注册一个退出时执行的清理函数 egress
trap egress EXIT

# 定义颜色代码，用于在终端输出带颜色的信息
readonly RED='\033[31m'    # 红色
readonly GREEN='\033[32m'  # 绿色
readonly YELLOW='\033[33m' # 黄色
readonly NC='\033[0m'      # 无颜色（重置）

# 获取当前脚本的目录、文件名（不含扩展名）和项目根目录的绝对路径
readonly CUR_DIR="$(cd -P -- "$(dirname -- "$0")" && pwd -P)" # 当前脚本所在目录
readonly CUR_FILE="$(basename "$0" | sed 's/\..*//')"         # 当前脚本文件名 (不含扩展名)
readonly PROJECT_ROOT="$(cd -P -- "${CUR_DIR}/.." && pwd -P)" # 项目根目录

# 定义项目中各个重要目录与配置文件的路径
readonly SCRIPT_CONFIG_DIR="${HOME}/.xray-script"              # 主配置文件目录
readonly I18N_DIR="${PROJECT_ROOT}/i18n"                       # 国际化文件目录
readonly SCRIPT_CONFIG_PATH="${SCRIPT_CONFIG_DIR}/config.json" # 脚本主要配置文件路径

# 创建一个唯一的临时目录用于编译工作，并在脚本退出时清理
# 如果创建失败则退出脚本
readonly TMPFILE_DIR="$(mktemp -d -p "${PROJECT_ROOT}" -t nginxtemp.XXXXXXXX)" || exit 1

# 定义 Nginx 和其日志的安装/存储路径
readonly NGINX_PATH="/usr/local/nginx"   # Nginx 安装主目录
readonly NGINX_LOG_PATH="/var/log/nginx" # Nginx 日志目录
readonly NGINX_SYSTEM_BIN="/usr/sbin/nginx"
readonly NGINX_SYSTEM_BIN_BACKUP="/usr/sbin/nginx.xray-script.bak"
readonly NGINX_SERVICE_PATH="/etc/systemd/system/nginx.service"
readonly NGINX_SERVICE_BACKUP="/etc/systemd/system/nginx.service.xray-script.bak"

# --- 全局变量声明 ---
# 声明用于存储是否启用 Brotli 模块选项、语言参数和国际化数据的全局变量
declare IS_ENABLE_BROTLI="" # 存储用户是否选择启用 Brotli ('Y' 或 '')
declare LANG_PARAM=''       # (未在脚本中实际使用，可能是预留)
declare I18N_DATA=''        # 存储从 i18n JSON 文件中读取的全部数据
declare APT_UPDATED=0       # 本次运行是否已经刷新过 apt 索引
# 声明用于存储编译器优化标志的全局数组
declare -a cflags=() # 存储 GCC 编译优化选项

function install_nginx_binary_link() {
    if [[ ( -e "${NGINX_SYSTEM_BIN}" || -L "${NGINX_SYSTEM_BIN}" ) && ! -e "${NGINX_SYSTEM_BIN_BACKUP}" ]] &&
        [[ ! -L "${NGINX_SYSTEM_BIN}" || "$(readlink -f "${NGINX_SYSTEM_BIN}")" != "$(readlink -f "${NGINX_PATH}/sbin/nginx")" ]]; then
        cp -a "${NGINX_SYSTEM_BIN}" "${NGINX_SYSTEM_BIN_BACKUP}" || return 1
    fi
    ln -sf "${NGINX_PATH}/sbin/nginx" "${NGINX_SYSTEM_BIN}"
}

function restore_nginx_binary_link() {
    rm -f "${NGINX_SYSTEM_BIN}"
    if [[ -e "${NGINX_SYSTEM_BIN_BACKUP}" ]]; then
        mv -f "${NGINX_SYSTEM_BIN_BACKUP}" "${NGINX_SYSTEM_BIN}"
    fi
}

function configure_nginx_worker_user() {
    local nginx_conf="${NGINX_PATH}/conf/nginx.conf"
    local temp_conf="${nginx_conf}.tmp.$$"

    [[ -f "${nginx_conf}" ]] || return 0
    {
        printf 'user nginx xray;\n'
        awk '!/^[[:space:]]*user[[:space:]]+/' "${nginx_conf}"
    } >"${temp_conf}" || {
        rm -f "${temp_conf}"
        return 1
    }
    chmod --reference="${nginx_conf}" "${temp_conf}" || {
        rm -f "${temp_conf}"
        return 1
    }
    chown --reference="${nginx_conf}" "${temp_conf}" || {
        rm -f "${temp_conf}"
        return 1
    }
    mv -f "${temp_conf}" "${nginx_conf}"
}

# =============================================================================
# 函数名称: egress
# 功能描述: 在脚本退出时执行的清理操作。
#           主要用于删除临时工作目录。
# 参数: 无
# 返回值: 无 (直接执行清理命令)
# =============================================================================
function egress() {
    # 如果 swap 文件存在，则关闭 swap
    [[ -e "${TMPFILE_DIR}/swap" ]] && swapoff "${TMPFILE_DIR}/swap"
    # 删除临时工作目录
    rm -rf "${TMPFILE_DIR}"
}

# =============================================================================
# 函数名称: load_i18n
# 功能描述: 加载国际化 (i18n) 数据。
#           1. 从 config.json 读取语言设置。
#           2. 如果设置为 "auto"，则尝试从系统环境变量 $LANG 推断语言。
#           3. 根据确定的语言，加载对应的 JSON i18n 文件。
#           4. 将文件内容读入全局变量 I18N_DATA。
# 参数: 无
# 返回值: 无 (直接修改全局变量 I18N_DATA)
# 退出码: 如果 i18n 文件不存在，则输出错误信息并退出脚本 (exit 1)
# =============================================================================
function load_i18n() {
    # 从配置文件中读取语言设置
    local lang="$(jq -r '.language' "${SCRIPT_CONFIG_PATH}")"

    # 如果语言设置为 "auto"，则使用系统环境变量 LANG 的第一部分作为语言代码
    if [[ "$lang" == "auto" ]]; then
        lang=$(echo "$LANG" | cut -d'_' -f1)
    fi

    # 构造 i18n 文件的完整路径
    local i18n_file="${I18N_DIR}/${lang}.json"

    # 检查 i18n 文件是否存在
    if [[ ! -f "${i18n_file}" ]]; then
        # 文件不存在时，根据语言输出不同的错误信息
        if [[ "$lang" == "zh" ]]; then
            echo -e "${RED}[错误]${NC} 文件不存在: ${i18n_file}" >&2
        else
            echo -e "${RED}[Error]${NC} File Not Found: ${i18n_file}" >&2
        fi
        # 退出脚本，错误码为 1
        exit 1
    fi

    # 读取 i18n 文件的全部内容到全局变量 I18N_DATA
    I18N_DATA="$(jq '.' "${i18n_file}")"
}

# =============================================================================
# 函数名称: print_info
# 功能描述: 以绿色打印信息级别的提示消息。
# 参数:
#   $@: 消息内容 (msg)
# 返回值: 无 (直接打印到标准错误输出 >&2)
# =============================================================================
function print_info() {
    # 从 i18n 数据中读取 "信息" 标题，然后用绿色打印消息
    printf "${GREEN}[$(echo "$I18N_DATA" | jq -r '.title.info')] ${NC}%s\n" "$*" >&2
}

# =============================================================================
# 函数名称: print_warn
# 功能描述: 以黄色打印警告级别的提示消息。
# 参数:
#   $@: 消息内容 (msg)
# 返回值: 无 (直接打印到标准错误输出 >&2)
# =============================================================================
function print_warn() {
    # 从 i18n 数据中读取 "警告" 标题，然后用黄色打印消息
    printf "${YELLOW}[$(echo "$I18N_DATA" | jq -r '.title.warn')] ${NC}%s\n" "$*" >&2
}

# =============================================================================
# 函数名称: print_error
# 功能描述: 以红色打印错误级别的提示消息，并退出脚本。
# 参数:
#   $@: 消息内容 (msg)
# 返回值: 无 (直接打印到标准错误输出 >&2，然后 exit 1)
# =============================================================================
function print_error() {
    # 从 i18n 数据中读取 "错误" 标题，然后用红色打印消息
    printf "${RED}[$(echo "$I18N_DATA" | jq -r '.title.error')] ${NC}%s\n" "$*" >&2
    # 打印错误信息后退出脚本，错误码为 1
    exit 1
}

# =============================================================================
# 函数名称: cmd_exists
# 功能描述: 检查指定的命令是否存在于系统中。
# 参数:
#   $1: 要检查的命令名称
# 返回值: 0-命令存在 1-命令不存在 (由命令检查工具的退出码决定)
# =============================================================================
function cmd_exists() {
    local cmd="$1" # 获取命令名称参数

    # 尝试使用不同的方法检查命令是否存在
    if eval type type >/dev/null 2>&1; then
        # 使用 type 命令检查
        eval type "$cmd" >/dev/null 2>&1
    elif command >/dev/null 2>&1; then
        # 使用 command -v 命令检查
        command -v "$cmd" >/dev/null 2>&1
    else
        # 使用 which 命令检查
        which "$cmd" >/dev/null 2>&1
    fi
}

function ensure_nginx_runtime_user() {
    local nologin_shell=''

    if ! getent group xray >/dev/null 2>&1; then
        groupadd --system xray || print_error "failed to create xray group"
    fi
    if ! id -u xray >/dev/null 2>&1; then
        nologin_shell="$(command -v nologin || echo /bin/false)"
        useradd --system --gid xray --home-dir /var/empty --shell "${nologin_shell}" xray ||
            print_error "failed to create xray user"
    fi
    if ! getent group nginx >/dev/null 2>&1; then
        groupadd --system nginx || print_error "failed to create nginx group"
    fi
    if ! id -u nginx >/dev/null 2>&1; then
        nologin_shell="$(command -v nologin || echo /bin/false)"
        useradd --system --gid nginx --home-dir /var/lib/nginx --shell "${nologin_shell}" nginx ||
            print_error "failed to create nginx user"
    fi
    if getent group xray >/dev/null 2>&1 && ! id -nG nginx 2>/dev/null | tr ' ' '\n' | grep -Fxq 'xray'; then
        usermod -aG xray nginx || print_error "failed to add nginx user to xray group"
    fi
    install -d -m 0755 -o nginx -g nginx /var/lib/nginx || print_error "failed to create nginx home"
}

# =============================================================================
# 函数名称: _os
# 功能描述: 检测当前操作系统的发行版名称。
# 参数: 无
# 返回值: 操作系统名称 (echo 输出: debian/ubuntu/centos/amazon/...)
# =============================================================================
function _os() {
    local os="" # 声明局部变量存储操作系统名称

    # 检查 Debian/Ubuntu 系列
    if [[ -f "/etc/debian_version" ]]; then
        # 读取 /etc/os-release 文件并提取 ID 字段
        source /etc/os-release && os="${ID}"
        # 输出检测到的操作系统名称
        printf -- "%s" "${os}" && return
    fi

    # 检查 Red Hat/CentOS 系列
    if [[ -f "/etc/redhat-release" ]]; then
        os="centos"
        # 输出检测到的操作系统名称
        printf -- "%s" "${os}" && return
    fi
}

# =============================================================================
# 函数名称: _os_full
# 功能描述: 获取当前操作系统的完整发行版信息。
# 参数: 无
# 返回值: 完整的操作系统版本信息 (echo 输出)
# =============================================================================
function _os_full() {
    # 检查 Red Hat/CentOS 系列
    if [[ -f /etc/redhat-release ]]; then
        # 从 /etc/redhat-release 文件中提取发行版名称和版本号
        awk '{print ($1,$3~/^[0-9]/?$3:$4)}' /etc/redhat-release && return
    fi

    # 检查通用的 os-release 文件
    if [[ -f /etc/os-release ]]; then
        # 从 /etc/os-release 文件中提取 PRETTY_NAME 字段
        awk -F'[= "]' '/PRETTY_NAME/{print $3,$4,$5}' /etc/os-release && return
    fi

    # 检查 LSB (Linux Standard Base) 发布文件
    if [[ -f /etc/lsb-release ]]; then
        # 从 /etc/lsb-release 文件中提取 DESCRIPTION 字段
        awk -F'[="]+' '/DESCRIPTION/{print $2}' /etc/lsb-release && return
    fi
}

# =============================================================================
# 函数名称: _os_ver
# 功能描述: 获取当前操作系统的主版本号。
# 参数: 无
# 返回值: 操作系统的主版本号 (echo 输出)
# =============================================================================
function _os_ver() {
    # 调用 _os_full 函数获取完整版本信息，然后提取其中的数字和点
    local os_full=''
    local main_ver=''
    os_full="$(_os_full)" || return 1
    main_ver="$(printf '%s\n' "${os_full}" | grep -oE '[0-9.]+' | head -n 1)" || true
    # 输出主版本号 (第一个点号前的部分)
    printf -- "%s" "${main_ver%%.*}"
}

# =============================================================================
# 函数名称: _error_detect
# 功能描述: 执行命令并检查其退出状态，如果失败则打印错误并退出。
# 参数:
#   $1: 要执行的命令字符串
# 返回值: 无 (执行成功或失败后退出)
# =============================================================================
function _error_detect() {
    local cmd="$1"                                                                                 # 获取要执行的命令
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.compile.executing' | sed "s|\${cmd}|${cmd}|")" # 打印将要执行的命令
    eval "${cmd}"                                                                                  # 执行命令
    # 检查命令执行的退出状态
    if [[ $? -ne 0 ]]; then
        print_error "$(echo "$I18N_DATA" | jq -r '.nginx.compile.fail_exec_cmd' | sed "s|\${cmd}|${cmd}|")" # 如果失败则打印错误并退出
    fi
}

# =============================================================================
# 函数名称: _version_ge
# 功能描述: 比较两个版本号字符串，判断第一个是否大于等于第二个。
# 参数:
#   $1: 第一个版本号
#   $2: 第二个版本号
# 返回值: 0-第一个版本 >= 第二个版本 1-否则 (由 test 命令决定)
# =============================================================================
function _version_ge() {
    # 使用 sort -rV (版本号逆序排序) 来比较版本
    test "$(echo "$@" | tr " " "\n" | sort -rV | head -n 1)" == "$1"
}

function _version_gt() {
    _version_ge "$1" "$2" && [[ "$1" != "$2" ]]
}

function get_latest_nginx_version() {
    local version
    version="$(
        curl -fsSL --retry 5 --retry-delay 2 https://nginx.org/en/download.html |
            grep -oE 'nginx-[0-9]+\.[0-9]+\.[0-9]+\.tar\.gz' |
            head -n 1 |
            sed 's/\.tar\.gz$//'
    )"
    [[ -n "${version}" ]] || return 1
    printf '%s\n' "${version}"
}

# =============================================================================
# 函数名称: _install
# 功能描述: 根据操作系统类型安装指定的软件包。
# 参数:
#   $@: 要安装的软件包名称列表
# 返回值: 无 (执行包管理器命令安装软件)
# =============================================================================
function _install() {
    local packages_name="$@"    # 获取所有要安装的包名
    local installed_packages="" # 存储已安装的包列表

    case "$(_os)" in # 根据操作系统类型进行分支处理
    centos)
        # 检查是否使用 dnf 包管理器 (较新版本 CentOS/Fedora)
        if cmd_exists "dnf"; then
            # 添加必要的 dnf 插件和 EPEL 源
            packages_name="dnf-plugins-core epel-release epel-next-release ${packages_name}"
            installed_packages="$(dnf list installed 2>/dev/null)" # 获取已安装包列表
            # 针对 CentOS 9 的特殊处理
            if [[ -n "$(_os_ver)" && "$(_os_ver)" -eq 9 ]]; then
                # 启用 EPEL 和 Remi 仓库
                if [[ "${packages_name}" =~ geoip\-devel ]] && ! echo "${installed_packages}" | grep -iwq "geoip-devel"; then
                    dnf update -y
                    # 安装 EPEL 和 EPEL-Next 源
                    _error_detect "dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm"
                    _error_detect "dnf install -y https://dl.fedoraproject.org/pub/epel/epel-next-release-latest-9.noarch.rpm"
                    _error_detect "dnf install -y https://rpms.remirepo.net/enterprise/remi-release-9.rpm"
                    # 启用 Remi 模块化仓库
                    _error_detect "dnf config-manager --set-enabled remi-modular"
                    # 刷新包信息
                    _error_detect "dnf update --refresh"
                    # 安装 GeoIP-devel，指定使用 Remi 仓库
                    dnf update -y
                    _error_detect "dnf --enablerepo=remi install -y GeoIP-devel"
                fi
            # 针对 CentOS 8 的特殊处理
            elif [[ -n "$(_os_ver)" && "$(_os_ver)" -eq 8 ]]; then
                # 禁用可能冲突的 container-tools 模块流
                if ! dnf module list 2>/dev/null | grep container-tools | grep -iwq "\[x\]"; then
                    _error_detect "dnf module disable -y container-tools"
                fi
            fi
            dnf update -y # 更新包列表
            # 遍历并安装每个包（如果尚未安装）
            for package_name in ${packages_name}; do
                if ! echo "${installed_packages}" | grep -iwq "${package_name}"; then
                    _error_detect "dnf install -y ${package_name}"
                fi
            done
        else
            # 使用 yum 包管理器 (较旧版本 CentOS)
            packages_name="epel-release yum-utils ${packages_name}"
            installed_packages="$(yum list installed 2>/dev/null)"
            yum update -y
            for package_name in ${packages_name}; do
                if ! echo "${installed_packages}" | grep -iwq "${package_name}"; then
                    _error_detect "yum install -y ${package_name}"
                fi
            done
        fi
        ;;
    # 处理 Debian 和 Ubuntu 系统
    ubuntu | debian)
        if [[ ${APT_UPDATED} -eq 0 ]]; then
            apt update -y || print_error "failed to update apt package lists"
            APT_UPDATED=1
        fi
        installed_packages="$(apt list --installed 2>/dev/null)" # 获取已安装包列表
        for package_name in ${packages_name}; do
            if ! echo "${installed_packages}" | grep -iwq "${package_name}"; then
                _error_detect "apt install -y ${package_name}"
            fi
        done
        ;;
    esac
}

# =============================================================================
# 函数名称: check_os
# 功能描述: 检查操作系统是否受支持。
# 参数: 无
# 返回值: 无 (受支持则继续，不受支持则 print_error 退出)
# =============================================================================
function check_os() {
    # 检查是否能识别操作系统
    [[ -z "$(_os)" ]] && print_error "$(echo "$I18N_DATA" | jq -r '.nginx.os.unsupported_os')"

    # 根据识别到的操作系统进行版本检查
    case "$(_os)" in
    ubuntu)
        # Ubuntu 需要 20.04 或更高版本
        [[ -n "$(_os_ver)" && "$(_os_ver)" -lt 20 ]] && print_error "$(echo "$I18N_DATA" | jq -r '.nginx.os.unsupported_ubuntu')"
        ;;
    debian)
        # Debian 需要 10 或更高版本
        [[ -n "$(_os_ver)" && "$(_os_ver)" -lt 10 ]] && print_error "$(echo "$I18N_DATA" | jq -r '.nginx.os.unsupported_debian')"
        ;;
    centos)
        # CentOS/RHEL 需要 7 或更高版本
        [[ -n "$(_os_ver)" && "$(_os_ver)" -lt 7 ]] && print_error "$(echo "$I18N_DATA" | jq -r '.nginx.os.unsupported_centos')"
        ;;
    *)
        # 其他识别到但不支持的系统
        print_error "$(echo "$I18N_DATA" | jq -r '.nginx.os.unsupported_os')"
        ;;
    esac
}

# =============================================================================
# 函数名称: swap_on
# 功能描述: 创建并启用临时 swap 空间。
# 参数:
#   $1: 请求的 swap 大小 (MB)
# 返回值: 无 (执行 swap 文件创建和启用)
# =============================================================================
function swap_on() {
    local mem=${1}                # 获取请求的 swap 大小 (MB)
    if [[ ${mem} -ne '0' ]]; then # 如果大小不为 0
        # 使用 dd 创建 swap 文件
        if dd if=/dev/zero of="${TMPFILE_DIR}/swap" bs=1M count=${mem} 2>&1; then
            chmod 0600 "${TMPFILE_DIR}/swap" # 设置文件权限
            mkswap "${TMPFILE_DIR}/swap"     # 格式化为 swap
            swapon "${TMPFILE_DIR}/swap"     # 启用 swap
        fi
    fi
}

# =============================================================================
# 函数名称: backup_files
# 功能描述: 备份指定目录下的所有文件。
# 参数:
#   $1: 要备份的目录路径
# 返回值: 无 (执行文件备份操作)
# =============================================================================
function backup_files() {
    local backup_dir="$1"            # 获取要备份的目录路径
    local current_date="$(date +%F_%H%M%S)" # 获取当前时间，避免同日覆盖
    # 遍历目录中的所有文件
    for file in "${backup_dir}/"*; do
        if [[ -f "$file" ]]; then                                          # 检查是否为普通文件
            local file_name="$(basename "$file")"                          # 获取文件名
            local backup_file="${backup_dir}/${file_name}_${current_date}" # 构造备份文件名
            mv "$file" "$backup_file"                                      # 重命名文件以进行备份
            echo "$(echo "$I18N_DATA" | jq -r '.nginx.backup_files.backup'): ${file} -> ${backup_file}。"
        fi
    done
}

# =============================================================================
# 函数名称: compile_dependencies
# 功能描述: 安装编译 Nginx 所需的依赖包。
# 参数: 无
# 返回值: 无 (调用 _install 安装依赖)
# =============================================================================
function compile_dependencies() {
    # 打印安装依赖信息
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.compile.install_deps')"
    # 安装基础工具和库
    _install ca-certificates curl wget gcc make git openssl tzdata socat
    case "$(_os)" in
    centos)
        # 安装 CentOS 特定的工具和开发库
        _install bind-utils gcc-c++ perl-IPC-Cmd perl-Getopt-Long perl-Data-Dumper perl-Time-Piece
        _install pcre2-devel zlib-devel libxml2-devel libxslt-devel gd-devel geoip-devel perl-ExtUtils-Embed gperftools-devel perl-devel brotli-devel
        # 检查并安装 Perl 模块 FindBin
        if ! perl -e "use FindBin" &>/dev/null; then
            _install perl-FindBin
        fi
        ;;
    debian | ubuntu)
        # 安装 Debian/Ubuntu 特定的工具和开发库
        _install bind9-dnsutils g++ perl-base perl
        _install libpcre2-dev zlib1g-dev libxml2-dev libxslt1-dev libgd-dev libgeoip-dev libgoogle-perftools-dev libperl-dev libbrotli-dev
        ;;
    esac
}

# =============================================================================
# 函数名称: gen_cflags
# 功能描述: 生成优化的 C 编译器标志 (CFLAGS)。
# 参数: 无
# 返回值: 无 (直接修改全局数组 cflags)
# =============================================================================
function gen_cflags() {
    # 只保留常规优化，不关闭栈保护、CFI、CET 等编译器保护项。
    cflags=('-g0' '-O3')
}

# =============================================================================
# 函数名称: source_compile
# 功能描述: 下载源码并编译 Nginx。
# 参数: 无
# 返回值: 无 (执行下载、配置和编译过程)
# =============================================================================
function source_compile() {
    cd "${TMPFILE_DIR}" || print_error "failed to enter Nginx build directory" # 切换到临时目录
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.compile.fetch_versions')"
    # 从 Nginx 官方下载页获取当前主线版本
    local nginx_version
    nginx_version="$(get_latest_nginx_version)" || print_error "failed to fetch the latest Nginx version"
    # 获取最新的 OpenSSL 标签名 (格式为 openssl-x.y.z)
    local openssl_version="openssl-$(wget -qO- --no-check-certificate https://api.github.com/repos/openssl/openssl/tags | grep 'name' | cut -d\" -f4 | grep -Eoi '^openssl-([0-9]\.?){3}$' | head -1)"
    [[ "${openssl_version}" != 'openssl-' ]] || print_error "failed to fetch the latest OpenSSL version"

    # 生成编译器优化标志
    gen_cflags

    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.compile.download_nginx')"
    # 下载 Nginx 源码包
    _error_detect "curl -fsSL -o ${nginx_version}.tar.gz https://nginx.org/download/${nginx_version}.tar.gz"
    # 解压 Nginx 源码
    tar -zxf "${nginx_version}.tar.gz"

    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.compile.download_openssl')"
    # 下载 OpenSSL 源码包 (注意 URL 结构)
    _error_detect "curl -fsSL -o ${openssl_version}.tar.gz https://github.com/openssl/openssl/archive/${openssl_version#*-}.tar.gz"
    # 解压 OpenSSL 源码
    tar -zxf "${openssl_version}.tar.gz"

    # 如果启用了 Brotli，则下载并初始化 ngx_brotli 模块
    if [[ "${is_enable_brotli}" =~ ^[Yy]$ ]]; then
        print_info "$(echo "$I18N_DATA" | jq -r '.nginx.compile.fetch_brotli')"
        _error_detect "git clone https://github.com/google/ngx_brotli && cd ngx_brotli && git submodule update --init"
        cd "${TMPFILE_DIR}" || print_error "failed to return to Nginx build directory" # 返回临时目录
    fi

    # 进入 Nginx 源码目录
    cd "${nginx_version}" || print_error "failed to enter Nginx source directory"

    # 对 Nginx 源码进行一些 sed 修改，以优化 Perl 模块的编译
    sed -i "s/OPTIMIZE[ \\t]*=>[ \\t]*'-O'/OPTIMIZE          => '-O3'/g" src/http/modules/perl/Makefile.PL
    sed -i 's/NGX_PERL_CFLAGS="$CFLAGS `$NGX_PERL -MExtUtils::Embed -e ccopts`"/NGX_PERL_CFLAGS="`$NGX_PERL -MExtUtils::Embed -e ccopts` $CFLAGS"/g' auto/lib/perl/conf
    sed -i 's/NGX_PM_CFLAGS=`$NGX_PERL -MExtUtils::Embed -e ccopts`/NGX_PM_CFLAGS="`$NGX_PERL -MExtUtils::Embed -e ccopts` $CFLAGS"/g' auto/lib/perl/conf

    # 执行 Nginx 的 configure 脚本，设置各种编译选项和模块
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.compile.configure')"
    if [[ "${is_enable_brotli}" =~ ^[Yy]$ ]]; then
        # 如果启用 Brotli，则添加 --add-module 选项
        ./configure --prefix="${NGINX_PATH}" --user=nginx --group=xray --with-threads --with-file-aio --with-http_ssl_module --with-http_v2_module --with-http_v3_module --with-http_realip_module --with-http_addition_module --with-http_xslt_module=dynamic --with-http_image_filter_module=dynamic --with-http_geoip_module=dynamic --with-http_sub_module --with-http_dav_module --with-http_flv_module --with-http_mp4_module --with-http_gunzip_module --with-http_gzip_static_module --with-http_auth_request_module --with-http_random_index_module --with-http_secure_link_module --with-http_degradation_module --with-http_slice_module --with-http_stub_status_module --with-http_perl_module=dynamic --with-mail=dynamic --with-mail_ssl_module --with-stream --with-stream_ssl_module --with-stream_realip_module --with-stream_geoip_module=dynamic --with-stream_ssl_preread_module --with-google_perftools_module --add-module="../ngx_brotli" --with-compat --with-cc-opt="${cflags[*]}" --with-openssl="../${openssl_version}" --with-openssl-opt="${cflags[*]}"
    else
        # 不启用 Brotli
        ./configure --prefix="${NGINX_PATH}" --user=nginx --group=xray --with-threads --with-file-aio --with-http_ssl_module --with-http_v2_module --with-http_v3_module --with-http_realip_module --with-http_addition_module --with-http_xslt_module=dynamic --with-http_image_filter_module=dynamic --with-http_geoip_module=dynamic --with-http_sub_module --with-http_dav_module --with-http_flv_module --with-http_mp4_module --with-http_gunzip_module --with-http_gzip_static_module --with-http_auth_request_module --with-http_random_index_module --with-http_secure_link_module --with-http_degradation_module --with-http_slice_module --with-http_stub_status_module --with-http_perl_module=dynamic --with-mail=dynamic --with-mail_ssl_module --with-stream --with-stream_ssl_module --with-stream_realip_module --with-stream_geoip_module=dynamic --with-stream_ssl_preread_module --with-google_perftools_module --with-compat --with-cc-opt="${cflags[*]}" --with-openssl="../${openssl_version}" --with-openssl-opt="${cflags[*]}"
    fi

    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.compile.swap')"
    # 创建并启用 512MB swap 空间以辅助编译
    swap_on 512

    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.compile.start_compile')"
    # 使用所有 CPU 核心并行编译
    _error_detect "make -j$(nproc)"
}

# =============================================================================
# 函数名称: source_install
# 功能描述: 编译并安装 Nginx。
# 参数: 无
# 返回值: 无 (执行编译和安装过程)
# =============================================================================
function source_install() {
    source_compile || return 1 # 先执行编译
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.install.start_install')"
    make install || print_error "failed to install Nginx files"
    mkdir -p "${NGINX_LOG_PATH}" || print_error "failed to create Nginx log directory"
    install_nginx_binary_link || print_error "failed to install Nginx command link"
}

# =============================================================================
# 函数名称: source_update
# 功能描述: 检查并更新 Nginx (如果需要)。
# 参数: 无
# 返回值: 0-执行了更新 1-无需更新 (由 return 语句决定)
# =============================================================================
function source_update() {
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.update.fetch_versions')"
    # 获取最新的版本号
    local latest_nginx_version
    latest_nginx_version="$(get_latest_nginx_version)" || print_error "failed to fetch the latest Nginx version"
    local latest_openssl_version="$(wget -qO- --no-check-certificate https://api.github.com/repos/openssl/openssl/tags | grep 'name' | cut -d\" -f4 | grep -Eoi '^openssl-([0-9]\.?){3}$' | head -1)"
    [[ "${latest_openssl_version}" != 'openssl-' ]] || print_error "failed to fetch the latest OpenSSL version"

    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.update.read_current_versions')"
    # 获取当前安装的 Nginx 和 OpenSSL 版本
    local current_version_nginx="$(nginx -V 2>&1 | grep "^nginx version:.*" | cut -d / -f 2)"
    local current_version_openssl="$(nginx -V 2>&1 | grep "^built with OpenSSL" | awk '{print $4}')"

    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.update.check_update')"
    # 仅当任一组件存在更高版本时更新，避免版本相同时重复编译
    if _version_gt "${latest_nginx_version#*-}" "${current_version_nginx}" || _version_gt "${latest_openssl_version#*-}" "${current_version_openssl}"; then
        compile_dependencies
        source_compile || print_error "failed to compile the new Nginx version"
        print_info "$(echo "$I18N_DATA" | jq -r '.nginx.update.start_update')"
        local old_binary="${NGINX_PATH}/sbin/nginx"
        local new_binary="${old_binary}.new"
        local binary_backup="${old_binary}.backup.$(date +%Y%m%d%H%M%S)"
        local modules_dir="${NGINX_PATH}/modules"
        local modules_backup="${TMPFILE_DIR}/modules.backup"
        local modules_staged="${TMPFILE_DIR}/modules.new"

        mkdir -p "${modules_backup}" "${modules_staged}" || print_error "failed to prepare Nginx module staging"
        if [[ -d "${modules_dir}" ]]; then
            cp -a "${modules_dir}/." "${modules_backup}/" || print_error "failed to back up Nginx modules"
        fi
        if ! cp -f objs/nginx "${new_binary}"; then
            print_error "failed to stage the new Nginx binary"
        fi
        if ! cp -f objs/*.so "${modules_staged}/"; then
            rm -f "${new_binary}"
            print_error "failed to stage the new Nginx modules"
        fi
        if ! mv -f "${old_binary}" "${binary_backup}"; then
            rm -f "${new_binary}"
            print_error "failed to back up the old Nginx binary"
        fi
        if ! mv -f "${new_binary}" "${old_binary}"; then
            mv -f "${binary_backup}" "${old_binary}"
            print_error "failed to activate the new Nginx binary"
        fi
        if ! rm -rf "${modules_dir}" || ! mkdir -p "${modules_dir}" || ! cp -a "${modules_staged}/." "${modules_dir}/"; then
            mv -f "${binary_backup}" "${old_binary}"
            rm -rf "${modules_dir}"
            cp -a "${modules_backup}" "${modules_dir}" || true
            print_error "failed to install new Nginx modules"
        fi
        # 更新软链接，并保留发行版原有的 /usr/sbin/nginx
        if ! install_nginx_binary_link; then
            rm -rf "${modules_dir}"
            cp -a "${modules_backup}" "${modules_dir}" || true
            mv -f "${binary_backup}" "${old_binary}"
            print_error "failed to update the Nginx command link"
        fi

        # 用实际生效的二进制与模块组合验证配置，再进行短暂重启。
        if ! "${old_binary}" -t -p "${NGINX_PATH}/" -c "${NGINX_CONFIG_PATH}/nginx.conf" >/dev/null 2>&1; then
            rm -rf "${modules_dir}"
            cp -a "${modules_backup}" "${modules_dir}" || true
            mv -f "${binary_backup}" "${old_binary}"
            print_error "new Nginx binary and modules failed configuration test"
        fi
        if systemctl is-active --quiet nginx; then
            if ! systemctl restart nginx; then
                rm -rf "${modules_dir}"
                cp -a "${modules_backup}" "${modules_dir}" || true
                mv -f "${binary_backup}" "${old_binary}"
                systemctl restart nginx >/dev/null 2>&1 || true
                print_error "failed to restart Nginx with the new binary"
            fi
        fi
        rm -f "${binary_backup}"
        return 0 # 表示执行了更新
    fi
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.update.up_to_date')"
    return 0
}

# =============================================================================
# 函数名称: purge_nginx
# 功能描述: 完全卸载 Nginx。
# 参数: 无
# 返回值: 无 (执行卸载操作)
# =============================================================================
function purge_nginx() {
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.purge.start_purge')"
    systemctl disable nginx 2>/dev/null || true
    systemctl stop nginx 2>/dev/null || true # 停止 Nginx 服务
    rm -rf "${NGINX_PATH}"                   # 删除安装目录
    restore_nginx_binary_link                # 恢复发行版原有命令（如果存在）
    rm -f "${NGINX_SERVICE_PATH}"
    if [[ -e "${NGINX_SERVICE_BACKUP}" ]]; then
        mv -f "${NGINX_SERVICE_BACKUP}" "${NGINX_SERVICE_PATH}"
    fi
    rm -rf "${NGINX_LOG_PATH}"               # 删除日志目录
    rm -rf /run/xray-script/nginx            # 删除 Nginx 运行时 Socket 目录
    systemctl daemon-reload                  # 重新加载 systemd 配置
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.purge.purged')"
}

# =============================================================================
# 函数名称: systemctl_config_nginx
# 功能描述: 配置 Nginx 的 systemd 服务文件。
# 参数: 无
# 返回值: 无 (创建服务文件并重新加载 systemd)
# =============================================================================
function systemctl_config_nginx() {
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.service.configure')"
    configure_nginx_worker_user || print_error "failed to configure Nginx worker user"
    if [[ -f "${NGINX_SERVICE_PATH}" && ! -e "${NGINX_SERVICE_BACKUP}" ]] &&
        ! grep -Eq 'Managed by Xray-script|xray-script/nginx|UMask=0007|Group=xray' "${NGINX_SERVICE_PATH}"; then
        cp -a "${NGINX_SERVICE_PATH}" "${NGINX_SERVICE_BACKUP}" ||
            print_error "failed to back up Nginx systemd service"
    fi
    # 使用 here document 创建服务文件内容
    cat >"${NGINX_SERVICE_PATH}" <<EOF
# Managed by Xray-script
[Unit]
Description=The NGINX HTTP and reverse proxy server
After=syslog.target network-online.target remote-fs.target nss-lookup.target
Before=xray.service
Wants=network-online.target

[Service]
Type=forking
PIDFile=/run/nginx.pid
Group=xray
UMask=0007
ExecStartPre=/usr/bin/install -d -m 0750 -o root -g xray /run/xray-script/nginx
ExecStartPre=/usr/bin/install -d -m 0770 -o xray -g xray /run/xray-script/xray
ExecStartPre=/bin/sh -c 'rm -f /run/xray-script/nginx/*.sock'
# 清理并创建共享内存目录用于 tcmalloc
ExecStartPre=/bin/rm -rf /dev/shm/nginx
ExecStartPre=/bin/mkdir /dev/shm/nginx
ExecStartPre=/bin/chmod 711 /dev/shm/nginx
ExecStartPre=/usr/bin/install -d -m 0770 -o root -g xray /dev/shm/nginx/tcmalloc
ExecStartPre=/bin/rm -f /run/nginx.pid
# 测试配置文件
ExecStartPre=/usr/sbin/nginx -t -q -g 'daemon on; master_process on;'
# 启动 Nginx
ExecStart=/usr/sbin/nginx -g 'daemon on; master_process on;'
# 重载 Nginx
ExecReload=/usr/sbin/nginx -g 'daemon on; master_process on;' -s reload
# 停止 Nginx
ExecStop=/bin/kill -s QUIT \$MAINPID
# 停止后清理共享内存
ExecStopPost=/bin/rm -rf /dev/shm/nginx
ExecStopPost=/bin/sh -c 'rm -f /run/xray-script/nginx/*.sock'
TimeoutStopSec=5
KillMode=mixed
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload # 重新加载 systemd 配置以使新服务生效
    print_info "$(echo "$I18N_DATA" | jq -r '.nginx.service.complete')"
}

# =============================================================================
# 函数名称: show_help
# 功能描述: 显示脚本使用帮助信息。
# 参数: 无
# 返回值: 无 (打印帮助信息到标准输出并 exit 0)
# =============================================================================
function show_help() {
    # 从 i18n 数据中读取帮助信息的各个部分
    local usage="$(echo "$I18N_DATA" | jq -r '.nginx.help.usage' | sed "s|\${script_name}|$0|")"
    local options_title="$(echo "$I18N_DATA" | jq -r '.nginx.help.options_title')"
    local opt_install="$(echo "$I18N_DATA" | jq -r '.nginx.help.opt_install')"
    local opt_update="$(echo "$I18N_DATA" | jq -r '.nginx.help.opt_update')"
    local opt_service
    opt_service="$(echo "$I18N_DATA" | jq -r '.nginx.help.opt_service')"
    local opt_brotli="$(echo "$I18N_DATA" | jq -r '.nginx.help.opt_brotli')"
    local opt_purge="$(echo "$I18N_DATA" | jq -r '.nginx.help.opt_purge')"
    local opt_help="$(echo "$I18N_DATA" | jq -r '.nginx.help.opt_help')"

    # 使用 here document 打印帮助信息
    cat <<EOF
${usage}
${options_title}:
  --install    ${opt_install}
  --update     ${opt_update}
  --service    ${opt_service}
  --brotli     ${opt_brotli}
  --purge      ${opt_purge}
  --help       ${opt_help}
EOF
    # 退出脚本，状态码为 0 (成功)
    exit 0
}

# =============================================================================
# 函数名称: main
# 功能描述: 脚本的主入口函数。
#           1. 检查操作系统。
#           2. 解析命令行参数。
#           3. 根据参数执行安装、更新或卸载操作。
# 参数:
#   $@: 所有命令行参数
# 返回值: 无 (协调调用其他函数完成 Nginx 管理)
# =============================================================================
function main() {
    # 加载国际化数据
    load_i18n

    # 首先检查操作系统兼容性
    check_os

    # 初始化 action 变量
    local action=''

    # 使用 while 循环解析命令行参数
    while [[ $# -gt 0 ]]; do
        case "$1" in
        # 处理主要操作参数
        --install | --update | --purge | --service)
            action="${1#--}" # 移除 '--' 前缀，获取操作名称 (install/update/purge)
            ;;
        # 处理 Brotli 选项
        --brotli)
            is_enable_brotli='Y' # 设置启用 Brotli 的标志
            ;;
        # 处理帮助选项
        --help)
            show_help # 显示帮助信息并退出
            ;;
        # 处理无效选项
        *)
            print_error "$(echo "$I18N_DATA" | jq -r '.nginx.main.invalid_option' | sed "s|\${option}|$1|")"
            ;;
        esac
        shift # 移动到下一个参数
    done

    # 根据解析出的 action 执行相应的操作
    case "${action}" in
    install)
        ensure_nginx_runtime_user
        compile_dependencies   # 安装依赖
        source_install         # 编译并安装
        systemctl_config_nginx # 配置 systemd 服务
        ;;
    update)
        ensure_nginx_runtime_user
        source_update        # 检查、按需安装依赖并更新
        ;;
    service)
        ensure_nginx_runtime_user
        systemctl_config_nginx
        ;;
    purge)
        purge_nginx # 卸载
        ;;
    esac
}

# --- 脚本执行入口 ---
# 调用 main 函数，并将所有命令行参数传递给它
main "$@"
