const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) =>
  fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const functionBody = (source, name) => {
  const start = source.indexOf(`function ${name}()`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

test("handler uses current Xray installer options", () => {
  const handler = read("core/handler.sh");

  assert.doesNotMatch(handler, /@ install[^\n]*-u\s+root/);
  assert.match(
    handler,
    /install_args=\(install --no-update-service --version/,
  );
  assert.match(handler, /install_args\+=\(--force\)/);
  assert.match(handler, /handler_xray_runtime_compat/);
  assert.match(handler, /needed_install|need_install=1/);
  assert.match(
    handler,
    /\[\[ -n "\$\{target_version\}" && "\$\{installed_version#v\}" != "\$\{target_version\}" \]\]/,
  );
  assert.match(
    handler,
    /installed_version="\$\(xray -version[\s\S]{0,220}\[\[ -z "\$\{target_version\}" \|\| "\$\{installed_version#v\}" == "\$\{target_version\}" \]\]/,
  );
});

test("protocol setup prepares the matching Xray version before persisting config", () => {
  const handler = read("core/handler.sh");
  const main = read("core/main.sh");

  assert.match(
    main,
    /exec_handler '--check-version' "\$\{XTLS_CONFIG\}"[\s\S]{0,180}exec_handler '--install'[\s\S]{0,100}exec_handler '--script-config' "\$\{XTLS_CONFIG\}"/,
  );
  assert.match(
    main,
    /exec_handler '--install' 'release'[\s\S]{0,180}exec_handler '--script-config' 'SNI'/,
  );
  assert.match(handler, /--check-version\) handler_check_protocol_version "\$1"/);
});

test("bootstrap fails clearly when dependencies remain missing", () => {
  const install = read("install.sh");

  assert.match(install, /bind9-dnsutils/);
  assert.doesNotMatch(install, /"dnsutils"/);
  assert.match(
    install,
    /if ! check_dependencies; then\s+_error "\$\{I18N_DATA\['failed'\]\}: dependencies"/,
  );
});

test("bootstrap and documentation use the fork repository", () => {
  const install = read("install.sh");
  const readmes = [read("README.md"), read(".github/README.en.md")];

  assert.match(
    install,
    /https:\/\/api\.github\.com\/repos\/PoiSuKi\/Xray-script\/tarball\/main/,
  );
  assert.match(
    install,
    /https:\/\/raw\.githubusercontent\.com\/PoiSuKi\/Xray-script\/main\/config\.json/,
  );
  for (const readme of readmes) {
    assert.match(
      readme,
      /https:\/\/raw\.githubusercontent\.com\/PoiSuKi\/Xray-script\/main\/install\.sh/,
    );
  }
});

test("geodata updates delegate to the official installer", () => {
  const geodata = read("tool/geodata.sh");

  assert.match(geodata, /@ update-geodata/);
  assert.doesNotMatch(geodata, /Loyalsoldier\/v2ray-rules-dat/);
});

test("fork release has a distinct version", () => {
  const config = JSON.parse(read("config.json"));

  assert.notEqual(config.version, "v2026.03.17");
});

test("nginx installs only the managed source build and resolves mainline", () => {
  const handler = read("core/handler.sh");
  const nginx = read("service/nginx.sh");

  assert.match(handler, /MANAGED_NGINX_BINARY="\/usr\/local\/nginx\/sbin\/nginx"/);
  assert.match(handler, /\[\[ ! -x "\$\{MANAGED_NGINX_BINARY\}" \]\]/);
  assert.match(nginx, /get_latest_nginx_version/);
  assert.match(nginx, /https:\/\/nginx\.org\/en\/download\.html/);
  assert.doesNotMatch(nginx, /api\.github\.com\/repos\/nginx\/nginx\/tags/);
  assert.match(nginx, /_version_gt/);
  assert.match(nginx, /modules_backup/);
  assert.match(nginx, /new Nginx binary and modules failed configuration test/);
  assert.match(nginx, /nginx\.update\.up_to_date[\s\S]{0,80}return 0/);
  assert.match(handler, /bash "\$\{NGINX_PATH\}" --update --brotli \|\| _error/);
  assert.match(
    handler,
    /--service \|\| _error "nginx service refresh failed"[\s\S]{0,80}handler_nginx_restart \|\| _error "nginx restart failed after update"/,
  );
  assert.match(
    handler,
    /handler_nginx_restart \|\| _error "nginx restart failed after update"[\s\S]{0,400}\.nginx\.version = \$version/,
  );
  assert.match(
    nginx,
    /systemctl restart nginx[\s\S]{0,500}modules_backup[\s\S]{0,240}binary_backup/,
  );
});

test("all Xray templates disable inbound sniffing by default", () => {
  const templateDir = path.join(root, "config", "xray");
  const templates = fs
    .readdirSync(templateDir)
    .filter((file) => file.endsWith(".json"));

  for (const file of templates) {
    const config = JSON.parse(read(path.join("config", "xray", file)));
    for (const inbound of config.inbounds) {
      if (inbound.sniffing) {
        assert.equal(
          inbound.sniffing.enabled,
          false,
          `${file}:${inbound.tag} must keep sniffing disabled`,
        );
      }
    }
  }

  assert.match(
    read("core/handler.sh"),
    /select\(\.sniffing != null\) \| \.sniffing\.enabled\) = false/,
  );
});

test("client output uses Mihomo transport names and ML-KEM hint", () => {
  const share = read("core/share.sh");

  assert.match(
    share,
    /CLIENT_CONFIG\[client_type\][\s\S]{0,180}raw[\s\S]{0,80}tcp/,
  );
  assert.match(share, /network\s+: \$\{CLIENT_CONFIG\[client_type\]\}/);
  assert.match(
    share,
    /SHARE_LINK_COMPONENT_VLESS=.*type=\$\{CLIENT_CONFIG\[client_type\]\}/,
  );
  assert.match(
    share,
    /SHARE_LINK_COMPONENT_REALITY=.*support-x25519mlkem768=true/,
  );
});

test("main menu exposes script update as option 99", () => {
  const menu = read("core/menu.sh");
  const main = read("core/main.sh");
  const install = read("install.sh");
  const zh = JSON.parse(read("i18n/zh.json"));
  const en = JSON.parse(read("i18n/en.json"));

  assert.match(menu, /GREEN}99\./);
  assert.match(main, /99\) processes_script_update/);
  assert.match(main, /install\.sh" --update/);
  assert.match(install, /--update\)/);
  assert.match(install, /UPDATE_ONLY/);
  assert.ok(zh.menu.index.option99);
  assert.ok(en.menu.index.option99);
});

test("management menu exposes a Reality domain-only update", () => {
  const menu = read("core/menu.sh");
  const main = read("core/main.sh");
  const handler = read("core/handler.sh");
  const zh = JSON.parse(read("i18n/zh.json"));
  const en = JSON.parse(read("i18n/en.json"));

  assert.match(menu, /config_management\.option7/);
  assert.match(main, /7\) exec_handler '--change-reality-domain'/);
  assert.match(handler, /function handler_change_reality_domain/);
  assert.match(handler, /\.streamSettings\.realitySettings\.target/);
  assert.match(handler, /\.streamSettings\.realitySettings\.serverNames/);
  assert.ok(zh.menu.config_management.option7);
  assert.ok(en.menu.config_management.option7);
});

test("main menu enables BBR as option 88 with persistent settings", () => {
  const bbrPath = path.join(root, "tool", "bbr.sh");
  assert.equal(fs.existsSync(bbrPath), true, "tool/bbr.sh must exist");

  const menu = read("core/menu.sh");
  const main = read("core/main.sh");
  const handler = read("core/handler.sh");
  const bbr = fs.readFileSync(bbrPath, "utf8");
  const zh = JSON.parse(read("i18n/zh.json"));
  const en = JSON.parse(read("i18n/en.json"));

  assert.match(menu, /GREEN}88\./);
  assert.match(main, /88\) exec_handler '--bbr'/);
  assert.match(handler, /function handler_bbr/);
  assert.match(bbr, /modprobe tcp_bbr/);
  assert.match(bbr, /net\.ipv4\.tcp_congestion_control = bbr/);
  assert.match(bbr, /net\.core\.default_qdisc = fq/);
  assert.match(bbr, /\/etc\/sysctl\.d\/99-xray-script-bbr\.conf/);
  assert.match(bbr, /\/etc\/modules-load\.d\/99-xray-script-bbr\.conf/);
  assert.ok(zh.menu.index.option88);
  assert.ok(en.menu.index.option88);
});

test("nginx lifecycle operations skip an uninstalled managed service", () => {
  const handler = read("core/handler.sh");

  assert.match(
    handler,
    /function nginx_service_is_managed\(\)[\s\S]{0,160}MANAGED_NGINX_BINARY[\s\S]{0,120}\/etc\/systemd\/system\/nginx\.service/,
  );
  assert.match(
    handler,
    /function handler_nginx_restart\(\)[\s\S]{0,120}nginx_service_is_managed \|\| return 0/,
  );
  assert.match(
    handler,
    /function handler_nginx_start\(\)[\s\S]{0,120}nginx_service_is_managed \|\| return 0/,
  );
  assert.match(
    handler,
    /function handler_nginx_stop\(\)[\s\S]{0,120}nginx_service_is_managed \|\| return 0/,
  );
});

test("SNI port checks allow the script-managed Xray and Nginx listeners", () => {
  const check = read("core/check.sh");

  assert.match(check, /function listener_is_script_managed/);
  assert.match(check, /listener_is_script_managed "\$\{occupied_by\}"/);
  assert.match(check, /\/usr\/local\/bin\/xray/);
  assert.match(check, /\/usr\/local\/nginx\/sbin\/nginx/);
  assert.match(check, /sni_ports\.occupied_managed/);
  assert.match(check, /ss -lnup/);
});

test("custom UUID input is preserved as one generator argument", () => {
  const handler = read("core/handler.sh");
  const generator = read("core/generate.sh");
  const check = read("core/check.sh");

  assert.match(
    handler,
    /exec_generate '--uuid' "\$\{CONFIG_DATA\['uuid'\]\}"/,
  );
  assert.match(generator, /generate_uuid_from_string/);
  assert.match(generator, /sha1/);
  assert.match(check, /uuid_bytes/);
  assert.match(
    handler,
    /uuid \| fallback\)[\s\S]{0,180}exec_check '--uuid' "\$\{result\}" \|\| continue/,
  );
});

test("terminal client output includes the REALITY ML-KEM flag", () => {
  const share = read("core/share.sh");

  assert.match(share, /SupportX25519MLKEM768/);
  assert.match(
    share,
    /CLIENT_CONFIG\[security\][\s\S]{0,180}support_x25519mlkem768[\s\S]{0,120}true/,
  );
  assert.match(share, /XHTTP_EXTRA.*security.*reality/);
});

test("REALITY private keys are not printed to the terminal", () => {
  const handler = read("core/handler.sh");
  const generate = functionBody(handler, "handler_x25519_config");

  assert.doesNotMatch(generate, /\[Private Key\]/);
  assert.match(generate, /\.xray\.privateKey = \$privateKey/);
});

test("SNI runtime sockets are separated by service owner", () => {
  const sni = JSON.parse(read("config/xray/SNI.json"));
  const nginxService = read("config/nginx/nginx.service");
  const tmpfilesPath = path.join(root, "config", "systemd", "xray-script-runtime.conf");
  assert.equal(fs.existsSync(tmpfilesPath), true);
  const tmpfiles = fs.readFileSync(tmpfilesPath, "utf8");

  const inboundListen = sni.inbounds[1].listen;
  const fallbackListen = sni.inbounds[2].listen;
  const realityTarget = sni.inbounds[1].streamSettings.realitySettings.target;
  const fallbackDest = sni.inbounds[1].settings.fallbacks[0].dest;

  assert.match(inboundListen, /^\/run\/xray-script\/xray\//);
  assert.match(fallbackListen, /^\/run\/xray-script\/xray\//);
  assert.match(fallbackDest, /^\/run\/xray-script\/xray\//);
  assert.match(realityTarget, /^\/run\/xray-script\/nginx\//);
  assert.match(nginxService, /Group=xray/);
  assert.match(nginxService, /UMask=0007/);
  assert.match(tmpfiles, /\/run\/xray-script\/xray 0770 xray xray/);
  assert.match(tmpfiles, /\/run\/xray-script\/nginx 0750 root xray/);
});

test("REALITY domain editor rejects SNI target rewrites", () => {
  const handler = read("core/handler.sh");

  assert.match(
    handler,
    /function handler_change_reality_domain\(\)[\s\S]{0,700}config_tag[\s\S]{0,240}sni[\s\S]{0,180}_error/,
  );
});

test("HTTP3 virtual hosts declare server_name", () => {
  const domain = read("config/nginx/conf/sites-available/domain.example.com.conf");
  const cdn = read("config/nginx/conf/sites-available/cdn.example.com.conf");

  assert.match(domain, /server_name\s+example\.com;/);
  assert.match(cdn, /server_name\s+example\.com;/);
});

test("XHTTP/TLS CDN links prefer packet-up while separated links use stream-up", () => {
  const share = read("core/share.sh");

  assert.match(
    share,
    /SHARE_LINK_COMPONENT_XHTTP=.*mode=\$\{xhttp_mode\}/,
  );
  assert.match(
    share,
    /security.*tls[\s\S]{0,160}xhttp_mode=['"]packet-up['"]/,
  );
  assert.match(
    share,
    /function get_sni_tls_down_share_link\(\)[\s\S]{0,220}XHTTP_MODE_OVERRIDE=['"]stream-up['"]/,
  );
  assert.match(
    share,
    /function get_sni_reality_down_share_link\(\)[\s\S]{0,220}XHTTP_MODE_OVERRIDE=['"]packet-up['"]/,
  );
});

test("XHTTP and SNI enforce the minimum Xray version", () => {
  const handler = read("core/handler.sh");
  const configure = functionBody(handler, "handler_xray_config");
  const collect = functionBody(handler, "handler_script_config");
  const precheck = functionBody(handler, "handler_check_protocol_version");

  assert.match(handler, /v25\.3\.6/);
  assert.match(handler, /function version_ge/);
  assert.match(
    configure,
    /xhttp \| trojan \| fallback \| sni\)[\s\S]{0,260}installed_version="\$\(xray -version/,
  );
  assert.match(collect, /handler_check_protocol_version "\$\{CONFIG_TAG\}"/);
  assert.match(
    precheck,
    /requested_version=[\s\S]{0,260}version_ge "\$\{requested_version\}" 'v25\.3\.6'/,
  );
});

test("REALITY target validation requires negotiated H2 ALPN", () => {
  const check = read("core/check.sh");

  assert.match(check, /grep -Eiq 'ALPN protocol:\[\[:space:\]\]\*h2'/);
  assert.match(check, /tls\.alpn_error/);
  assert.match(check, /timeout 10 bash -c 'echo >\/dev\/tcp/);
  assert.match(check, /timeout 15 stdbuf -oL openssl s_client/);
  assert.match(check, /\^3\[0-9\]\{2\}\$/);
});

test("existing Nginx installations refresh the systemd service definition", () => {
  const handler = read("core/handler.sh");
  const nginx = read("service/nginx.sh");

  assert.match(nginx, /--service/);
  assert.match(nginx, /service\)[\s\S]{0,120}systemctl_config_nginx/);
  assert.match(handler, /bash "\$\{NGINX_PATH\}" --service/);
});

test("DNS checks use exact address comparison", () => {
  const check = read("core/check.sh");
  assert.match(check, /grep -Fxq -- "\$\{expected_ipv4\}"/);
  assert.match(check, /grep -Fxq -- "\$\{expected_ipv6\}"/);
  assert.doesNotMatch(check, /actual_ipv6.*=~.*expected_ipv6/);
});

test("custom routing passes the parsed input to add_rule", () => {
  const handler = read("core/handler.sh");
  assert.match(handler, /CONFIG_DATA\[\$\{rule_tag\}\]/);
});

test("default routing rules are generated in memory before one validated write", () => {
  const handler = read("core/handler.sh");
  const configure = functionBody(handler, "handler_xray_config");
  const quick = functionBody(handler, "handler_quick_install");

  assert.match(configure, /add_rule "bt"[\s\S]{0,120}'n'/);
  assert.match(configure, /add_rule "cn-ip"[\s\S]{0,160}'n'/);
  assert.match(configure, /add_rule "ad-domain"[\s\S]{0,160}'n'/);
  assert.match(quick, /add_rule "ad-domain"[\s\S]{0,520}write_xray_config \|\| return 1/);
});

test("Cloudreve compose operations fail before destructive cleanup", () => {
  const docker = read("service/docker.sh");

  assert.match(docker, /docker compose up -d \|\| print_error/);
  assert.match(docker, /docker compose down \|\| print_error/);
  assert.match(
    docker,
    /\(cd "\$\{CLOUDREVE_V3_DIR\}" && docker compose down\) \|\|[\s\S]{0,100}print_error/,
  );
  assert.match(
    docker,
    /\(cd "\$\{CLOUDREVE_V4_DIR\}" && docker compose down\) \|\|[\s\S]{0,100}print_error/,
  );
});

test("Nginx uses an unprivileged worker and preserves the system link", () => {
  const nginx = read("service/nginx.sh");
  const handler = read("core/handler.sh");
  const config = read("config/nginx/conf/nginx.conf");
  const service = read("config/nginx/nginx.service");
  assert.match(config, /^user\s+nginx xray;/m);
  assert.match(nginx, /--user=nginx --group=xray/);
  assert.match(nginx, /NGINX_SYSTEM_BIN_BACKUP/);
  assert.match(nginx, /readlink -f "\$\{NGINX_SYSTEM_BIN\}"/);
  assert.match(nginx, /readlink -f "\$\{NGINX_PATH\}\/sbin\/nginx"/);
  assert.match(nginx, /NGINX_SERVICE_BACKUP/);
  assert.match(nginx, /cp -a "\$\{NGINX_SERVICE_PATH\}" "\$\{NGINX_SERVICE_BACKUP\}"/);
  assert.doesNotMatch(nginx, /--user=root/);
  assert.match(
    service,
    /install -d -m 0770 -o root -g xray \/dev\/shm\/nginx\/tcmalloc/,
  );
  assert.doesNotMatch(service, /chmod 0777 \/dev\/shm\/nginx\/tcmalloc/);
  assert.match(
    nginx,
    /function ensure_nginx_runtime_user\(\)[\s\S]{0,240}getent group xray[\s\S]{0,160}groupadd --system xray/,
  );
  assert.match(
    nginx,
    /function ensure_nginx_runtime_user\(\)[\s\S]{0,520}id -u xray[\s\S]{0,180}useradd --system --gid xray/,
  );
  assert.match(
    handler,
    /function ensure_nginx_runtime_user\(\)[\s\S]{0,240}getent group xray[\s\S]{0,160}groupadd --system xray/,
  );
  assert.match(nginx, /function configure_nginx_worker_user/);
  assert.match(
    nginx,
    /printf 'user nginx xray;\\n'[\s\S]{0,700}mv -f "\$\{temp_conf\}" "\$\{nginx_conf\}"/,
  );
});

test("Xray config is validated before dependent script state is persisted", () => {
  const handler = read("core/handler.sh");
  const configure = functionBody(handler, "handler_xray_config");

  assert.match(configure, /if ! write_xray_config; then[\s\S]{0,180}return 1/);
  assert.match(configure, /if ! persist_script_config; then[\s\S]{0,500}return 1/);
  assert.match(configure, /commit_script_config_transaction/);
  assert.doesNotMatch(
    configure,
    /echo "\$\{SCRIPT_CONFIG\}" >"\$\{SCRIPT_CONFIG_PATH\}" && sleep 2\s+write_xray_config/,
  );
  assert.match(handler, /SCRIPT_CONFIG_TRANSACTION_BACKUP/);
  assert.match(handler, /function rollback_script_config_transaction/);
  assert.match(
    handler,
    /--xray-config\)[\s\S]{0,260}handler_xray_config \|\| exit 1[\s\S]{0,180}handler_sni_config "\$1" \|\| exit 1/,
  );
  assert.match(
    handler,
    /function rollback_script_config_transaction\(\)[\s\S]{0,260}rm -f "\$\{SCRIPT_CONFIG_TRANSACTION_BACKUP\}"/,
  );
});

test("port changes participate in the Xray config transaction", () => {
  const handler = read("core/handler.sh");
  const changePort = functionBody(handler, "handler_change_xray_port");

  assert.match(changePort, /begin_script_config_transaction/);
  assert.match(changePort, /persist_script_config/);
});

test("top-level domain changes join the Xray config transaction", () => {
  const handler = read("core/handler.sh");
  const changeDomain = functionBody(handler, "handler_change_domain");

  assert.match(changeDomain, /stop_cert_service[\s\S]{0,220}begin_script_config_transaction/);
  assert.match(changeDomain, /persist_script_config \|\| return 1/);
});
