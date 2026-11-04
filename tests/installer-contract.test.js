const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("handler uses current Xray installer options", () => {
  const handler = read("core/handler.sh");

  assert.doesNotMatch(handler, /@ install[^\n]*-u\s+root/);
  assert.match(
    handler,
    /install_args=\(install --no-update-service --version/,
  );
  assert.match(handler, /install_args\+=\(--force\)/);
  assert.match(handler, /handler_xray_runtime_compat/);
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
});
