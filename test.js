// Teste do servidor sem dependencias: node test.js
const {spawn} = require("child_process");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 39000 + Math.floor(Math.random() * 1000);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "painel-"));
const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {env: {...process.env, PORT, DATA_DIR: DATA}, stdio: "inherit"});
const url = p => `http://127.0.0.1:${PORT}${p}`;
const post = body => fetch(url("/api/config"), {method: "POST", headers: {"Content-Type": "application/json"}, body});

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(url("/health")); break; } catch { await new Promise(r => setTimeout(r, 100)); } }

  const padrao = await (await fetch(url("/api/config"))).json();
  assert.deepStrictEqual(padrao, {layout: 4, mode: "settings", quadrants: [{links: []}, {links: []}, {links: []}, {links: []}]});

  const r = await post(JSON.stringify({layout: 2, mode: "display", extra: 1,
    quadrants: [{links: [{title: "Zabbix", url: " http://10.0.0.1/ ", duration: 2}, {url: "http://10.0.0.2/", duration: "30"}]}]}));
  assert.strictEqual(r.status, 200);
  const salvo = await (await fetch(url("/api/config"))).json();
  assert.strictEqual(salvo.mode, "display");
  assert.strictEqual(salvo.layout, 2);
  assert.strictEqual(salvo.extra, undefined);                    // campo desconhecido descartado
  assert.strictEqual(salvo.quadrants.length, 4);                 // sempre 4 areas
  assert.deepStrictEqual(salvo.quadrants[0].links[0], {title: "Zabbix", url: "http://10.0.0.1/", duration: 5});  // minimo 5 s
  assert.strictEqual(salvo.quadrants[0].links[1].duration, 30);
  assert.ok(fs.existsSync(path.join(DATA, "config.json")));     // persistido no volume

  assert.strictEqual((await post("{nao e json")).status, 400);
  for (const p of ["/../server.js", "/%2e%2e/server.js", "/..%2fserver.js"])  // nada fora de /public
    assert.notStrictEqual((await fetch(url(p))).status, 200, p);
  assert.match(await (await fetch(url("/"))).text(), /Painel Rotativo/);

  console.log("test ok");
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { srv.kill(); fs.rmSync(DATA, {recursive: true, force: true}); });
