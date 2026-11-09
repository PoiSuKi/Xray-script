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
  assert.match(handler, /XRAY_INSTALL_COMMIT=.*e42df6a/);
  assert.match(handler, /XRAY_INSTALL_SHA256=.*954666bb/);
  assert.match(handler, /function fetch_xray_installer/);
  assert.match(handler, /function restore_xray_install_state/);
  assert.match(handler, /installed_version#v.*!=.*target_version#v/);
  assert.match(
    handler,
    /handler_xray_version "\$\{xray_version\}" 'n'/,
  );
  assert.match(handler, /select\(\.draft != true and \.prerelease != true\)/);
  assert.doesNotMatch(handler, /Xray-install\/raw\/main\/install-release\.sh/);
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
    /https:\/\/github\.com\/PoiSuKi\/Xray-script\/raw\/refs\/heads\/main\/config\.json/,
  );
  for (const readme of readmes) {
    assert.match(
      readme,
      /https:\/\/github\.com\/PoiSuKi\/Xray-script\/raw\/refs\/heads\/main\/install\.sh/,
    );
    assert.doesNotMatch(readme, /wget --no-check-certificate/);
  }
});

test("geodata updates delegate to the official installer", () => {
  const geodata = read("tool/geodata.sh");

  assert.match(geodata, /bash -s -- update-geodata/);
  assert.match(geodata, /XRAY_INSTALL_SHA256/);
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

test("mKCP uses current FinalMask format and shared seed extraction", () => {
  const template = JSON.parse(read("config/xray/mKCP.json"));
  const stream = template.inbounds[1].streamSettings;
  const handler = read("core/handler.sh");
  const share = read("core/share.sh");

  assert.equal(stream.kcpSettings.seed, undefined);
  assert.equal(stream.finalmask.udp[0].type, "mkcp-legacy");
  assert.equal(stream.finalmask.udp[0].settings.value, "{{ speed }}");
  assert.match(
    handler,
    /streamSettings\.finalmask\.udp\[0\]\.settings\.value = \$seed/,
  );
  assert.match(share, /select\(\.type == "mkcp-legacy"\).*settings\.value/);
  assert.match(share, /kcpSettings\.seed/);
  assert.match(share, /seed=\$\{seed_encoded\}&headerType=none/);
});

test("Xray config validation disables file logging in the temporary copy", () => {
  const handler = read("core/handler.sh");

  assert.match(handler, /function validate_xray_config/);
  assert.match(handler, /\.log\.access = "none".*\.log\.error = "none"/);
  assert.match(handler, /validate_xray_config "\$\{temp_file\}"/);
  assert.match(handler, /validate_xray_config "\$\{new_config\}"/);
});

test("Xray config reset and random generator failures propagate", () => {
  const handler = read("core/handler.sh");
  const generator = read("core/generate.sh");
  const x25519 = functionBody(handler, "handler_x25519_config");

  assert.match(handler, /handler_reset_script_config 'xray' 'n' \|\| return 1/);
  assert.match(x25519, /X25519=.*\|\| return 1/);
  assert.match(generator, /random=.*\| return 1/);
  assert.match(generator, /uuid=.*\| return 1/);
  assert.match(generator, /generate_random_string/);
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
  assert.doesNotMatch(generator, /\\b-\[0-9a-fA-F\]/);
  assert.doesNotMatch(check, /\\b-\[0-9a-fA-F\]/);
  assert.match(
    handler,
    /uuid \| fallback\)[\s\S]{0,180}exec_check '--uuid' "\$\{result\}" \|\| continue/,
  );
});

test("port validation rejects oversized numeric input before arithmetic", () => {
  const check = read("core/check.sh");

  assert.match(check, /port.*\^\[0-9\]\{1,5\}\$/);
  assert.match(check, /10#\$\{port\} >= 1/);
});

test("XHTTP paths are normalized and enforced at slash boundaries", () => {
  const check = read("core/check.sh");
  const generate = read("core/generate.sh");
  const handler = read("core/handler.sh");
  const templates = ["XHTTP.json", "Trojan.json", "Fallback.json", "SNI.json"];

  assert.match(check, /"\$\{path\}" != \/\* \|\| "\$\{path\}" != \*\/ \|\| "\$\{path\}" == '\/'/);
  assert.match(generate, /echo "\/\$\{domain_path\}\/"/);
  assert.match(handler, /result="\$\{result\}\/"/);
  for (const template of templates) {
    const document = JSON.parse(read(`config/xray/${template}`));
    const paths = document.inbounds
      .map((inbound) => inbound.streamSettings?.xhttpSettings?.path)
      .filter(Boolean);
    assert.ok(paths.length > 0, `${template} should contain an XHTTP inbound`);
    assert.ok(paths.every((value) => value === "/yourpath/"), template);
  }
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
    /xhttp \| trojan \| fallback \| sni \| cdnxhttp\)[\s\S]{0,260}installed_version="\$\(xray -version/,
  );
  assert.match(collect, /handler_check_protocol_version "\$\{CONFIG_TAG\}"/);
  assert.match(
    precheck,
    /requested_version=[\s\S]{0,260}version_ge "\$\{requested_version\}" 'v25\.3\.6'/,
  );
});

test("CDN-XHTTP uses an Nginx HTTP front and a private Xray Unix socket", () => {
  const template = JSON.parse(read("config/xray/CDNXHTTP.json"));
  const site = read("config/nginx/cdn-xhttp/site.conf.template");
  const access = read("config/nginx/cdn-xhttp/https-default.conf.template");
  const inbound = template.inbounds[1];

  assert.equal(inbound.listen, "/run/xray-script/xray/cdn_xhttp.sock,0660");
  assert.equal(inbound.streamSettings.network, "xhttp");
  assert.equal(inbound.streamSettings.security, "none");
  assert.equal(inbound.streamSettings.xhttpSettings.mode, "packet-up");
  assert.equal(inbound.streamSettings.xhttpSettings.path, "/yourpath/");
  assert.equal(inbound.sniffing.enabled, false);

  assert.match(site, /listen 443 ssl;/);
  assert.match(site, /http2 on;/);
  assert.match(site, /location \^~ __XHTTP_PATH__/);
  assert.match(site, /grpc_pass unix:__SOCKET_PATH__;/);
  assert.match(site, /location \^~ \/\.well-known\/acme-challenge\//);
  assert.match(site, /try_files \$uri \$uri\/ =404;/);
  assert.match(site, /index index\.html;\s+client_header_timeout 5m;/);
  assert.doesNotMatch(
    site,
    /location \^~ __XHTTP_PATH__ \{[\s\S]*?client_header_timeout/,
  );
  assert.match(access, /listen 443 ssl default_server;/);
  assert.match(access, /ssl_reject_handshake on;/);
});

test("CDN-XHTTP installation and purge are transactional", () => {
  const handler = read("core/handler.sh");
  const install = functionBody(handler, "handler_cdn_xhttp_install");
  const purge = functionBody(handler, "handler_purge");
  const webRoot = functionBody(handler, "prepare_cdn_xhttp_web_root");

  assert.match(handler, /--cdn-xhttp-install/);
  assert.match(handler, /--cdn-xhttp-ports/);
  assert.match(handler, /function backup_cdn_xhttp_nginx_configs/);
  assert.match(handler, /function restore_cdn_xhttp_nginx_configs/);
  assert.match(handler, /function remove_cdn_xhttp_files/);
  assert.match(install, /handler_restart \|\| ! wait_cdn_xhttp_socket/);
  assert.match(install, /nginx -t/);
  assert.match(install, /if ! handler_nginx_restart; then/);
  assert.match(install, /commit_script_config_transaction/);
  assert.match(webRoot, /install -d -m 0755 "\$\(dirname -- "\$\{CDN_XHTTP_WEB_ROOT\}"\)"/);
  assert.match(purge, /handler_nginx_stop/);
  assert.match(purge, /remove_cdn_xhttp_files/);
  assert.match(handler, /modules-enabled\/stream\.conf/);
});

test("acme.sh unchanged certificate results are treated as current", () => {
  const ssl = read("service/ssl.sh");
  const issue = functionBody(ssl, "issue_certificate");

  assert.match(issue, /Domains not changed\./);
  assert.match(issue, /Skipping\./);
  assert.match(issue, /acme_result_is_current/);
  assert.match(issue, /acme_existing_fullchain/);
});

test("CDN-XHTTP shares TLS/XHTTP packet-up and prints Mihomo YAML", () => {
  const share = read("core/share.sh");
  const main = read("core/main.sh");
  const menu = read("core/menu.sh");
  const zh = JSON.parse(read("i18n/zh.json"));
  const en = JSON.parse(read("i18n/en.json"));

  assert.match(menu, /protocol_config\.option7/);
  assert.match(main, /7\) XTLS_CONFIG='CDNXHTTP'/);
  assert.match(main, /--cdn-xhttp-install/);
  assert.match(share, /function get_cdn_xhttp_share_link/);
  assert.match(share, /xhttp-opts:/);
  assert.match(share, /mode: packet-up/);
  assert.match(share, /cdnxhttp\)/);
  assert.ok(zh.menu.protocol_config.option7);
  assert.ok(en.menu.protocol_config.option7);
  assert.ok(zh.handler.cdn_xhttp.purged);
  assert.ok(en.handler.cdn_xhttp.purged);
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
  const v3 = read("config/cloudreve/v3/docker-compose.yaml");
  const v4 = read("config/cloudreve/v4/docker-compose.yaml");
  const v4Watchtower = read("config/cloudreve/v4/docker-compose.watchtower.yaml");

  assert.match(v3, /"127\.0\.0\.1:5212:5212"/);
  assert.match(v4, /"127\.0\.0\.1:5212:5212"/);
  assert.match(v4Watchtower, /"127\.0\.0\.1:5212:5212"/);
  assert.doesNotMatch(v4Watchtower, /image: postgres:latest/);
  assert.doesNotMatch(v4, /127\.0\.0\.1:6888/);
  assert.match(docker, /docker compose up -d \|\| print_error/);
  assert.match(docker, /docker compose down \|\| print_error/);
  assert.match(docker, /docker compose pull \|\| print_error/);
  assert.match(
    docker,
    /docker compose up -d --remove-orphans \|\| print_error "failed to update Cloudreve v4"/,
  );
  assert.doesNotMatch(
    docker,
    /docker compose pull[\s\S]{0,220}docker compose down/,
  );
  assert.match(
    docker,
    /\(cd "\$\{CLOUDREVE_V3_DIR\}" && docker compose down\) \|\|[\s\S]{0,100}print_error/,
  );
  assert.match(
    docker,
    /\(cd "\$\{CLOUDREVE_V4_DIR\}" && docker compose down\) \|\|[\s\S]{0,100}print_error/,
  );
});

test("download-and-execute installers stage complete validated files", () => {
  const docker = read("service/docker.sh");
  const ssl = read("service/ssl.sh");
  const i18nZh = JSON.parse(read("i18n/zh.json"));
  const i18nEn = JSON.parse(read("i18n/en.json"));

  assert.match(docker, /installer_file="\$\(mktemp\)"/);
  assert.doesNotMatch(docker, /TOOL_DIR}\/install-docker\.sh/);
  assert.match(docker, /sh -n "\$\{installer_file\}"/);
  assert.match(docker, /cmd_exists docker \|\| print_error/);
  for (const key of ["download_fail", "dry_run_fail", "run_fail", "verify_fail"]) {
    assert.equal(typeof i18nZh.docker.install[key], "string");
    assert.equal(typeof i18nEn.docker.install[key], "string");
  }

  assert.match(ssl, /installer_file="\$\(mktemp\)"/);
  assert.match(ssl, /curl -fsSL[\s\S]{0,180}https:\/\/get\.acme\.sh -o/);
  assert.match(ssl, /sh -n "\$\{installer_file\}"/);
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
  assert.doesNotMatch(nginx, /--no-check-certificate/);
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
  assert.doesNotMatch(changePort, /handler_restart/);
  assert.match(
    handler,
    /--change-port\)[\s\S]{0,180}handler_xray_config \|\| exit 1[\s\S]{0,120}handler_restart \|\| exit 1/,
  );
});

test("top-level domain changes join the Xray config transaction", () => {
  const handler = read("core/handler.sh");
  const changeDomain = functionBody(handler, "handler_change_domain");
  const check = read("core/check.sh");

  assert.match(changeDomain, /stop_cert_service[\s\S]{0,220}begin_script_config_transaction/);
  assert.match(changeDomain, /-z "\$\{new_domain\}"[\s\S]{0,220}handler\.domain\.required/);
  assert.match(changeDomain, /persist_script_config \|\| return 1/);
  assert.match(handler, /cdn\)[\s\S]{0,180}exec_check '--required-domain'/);
  assert.match(check, /--required-domain\) check_domain_security "\$\{1\}" 'y'/);
});

test("failed multi-step handlers roll back pending script transactions", () => {
  const main = read("core/main.sh");
  const handler = read("core/handler.sh");

  assert.match(
    main,
    /if \[\[ \$\{exit_code\} -ne 0 \]\]; then[\s\S]{0,180}--rollback-script-config[\s\S]{0,120}_error/,
  );
  assert.match(handler, /--rollback-script-config\) rollback_script_config_transaction/);
});
