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

  // YouTube: links comuns viram embed (o "watch" bloqueia iframe)
  const {paraEmbed} = require("./public/util.js");
  const E = "https://www.youtube.com/embed/";
  assert.match(paraEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"), /^https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ\?.*autoplay=1&mute=1.*loop=1.*start=42.*playlist=dQw4w9WgXcQ/);
  assert.ok(paraEmbed("https://youtu.be/dQw4w9WgXcQ").startsWith(E + "dQw4w9WgXcQ?"));
  assert.ok(paraEmbed("https://youtube.com/shorts/dQw4w9WgXcQ?si=x").startsWith(E + "dQw4w9WgXcQ?"));
  assert.ok(paraEmbed("https://m.youtube.com/live/dQw4w9WgXcQ").startsWith(E + "dQw4w9WgXcQ?"));
  assert.match(paraEmbed("https://www.youtube.com/playlist?list=PL123"), /embed\/videoseries\?.*list=PL123/);
  assert.match(paraEmbed("https://www.youtube.com/channel/UCabc/live"), /embed\/live_stream\?.*channel=UCabc/);
  const mix = paraEmbed("https://www.youtube.com/watch?v=1WHPExTeOwg&list=RD1WHPExTeOwg&start_radio=1");
  assert.ok(mix.startsWith(E + "1WHPExTeOwg?") && !/[?&]list=/.test(mix) && mix.includes("playlist=1WHPExTeOwg"), mix);  // Mix nao embeda
  assert.ok(paraEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc").includes("list=PLabc"));
  assert.strictEqual(paraEmbed("http://10.0.0.1/zabbix"), "http://10.0.0.1/zabbix");   // o resto nao muda
  assert.strictEqual(paraEmbed("https://www.youtube.com/@canal"), "https://www.youtube.com/@canal");
  assert.strictEqual((await fetch(url("/util.js"))).status, 200);

  const {lerTempo, mostrarTempo} = require("./public/util.js");
  for (const [txt, seg] of [["90", 90], ["90s", 90], ["5m", 300], ["5 min", 300], ["2h", 7200], ["1h30m", 5400], ["1:30", 90],
                            ["1:02:03", 3723], ["1,5m", 90], ["", null], ["abc", null], ["5x", null]])
    assert.strictEqual(lerTempo(txt), seg, txt);
  assert.strictEqual(mostrarTempo(90), "1m 30s"); assert.strictEqual(mostrarTempo(3600), "1h"); assert.strictEqual(mostrarTempo(45), "45s");

  console.log("test ok");
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { srv.kill(); fs.rmSync(DATA, {recursive: true, force: true}); });
