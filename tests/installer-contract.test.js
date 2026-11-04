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
