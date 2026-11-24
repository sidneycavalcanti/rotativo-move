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
  assert.deepStrictEqual(padrao, {layout: 4, mode: "settings", tela: {resolucao: "auto", ajuste: "conter"},
                                  quadrants: [{links: []}, {links: []}, {links: []}, {links: []}]});

  const r = await post(JSON.stringify({layout: 2, mode: "display", extra: 1, tela: {resolucao: "3840x2160", ajuste: "esticar", lixo: 1},
    quadrants: [{links: [{title: "Zabbix", url: " http://10.0.0.1/ ", duration: 2}, {url: "http://10.0.0.2/", duration: "30"}]}]}));
  assert.strictEqual(r.status, 200);
  const salvo = await (await fetch(url("/api/config"))).json();
  assert.strictEqual(salvo.mode, "display");
  assert.strictEqual(salvo.layout, 2);
  assert.strictEqual(salvo.extra, undefined);                    // campo desconhecido descartado
  assert.deepStrictEqual(salvo.tela, {resolucao: "3840x2160", ajuste: "esticar"});
  assert.strictEqual((await (await post(JSON.stringify({tela: {resolucao: "999x1", ajuste: "x"}}))).json()).tela.resolucao, "auto");
  assert.deepStrictEqual((await (await post(JSON.stringify({tela: {divX: 0.3333, divY: 2}}))).json()).tela, {resolucao: "auto", ajuste: "conter", divX: 0.333});  // divisoria arrastada; fora de 0,1-0,9 cai
  assert.strictEqual(salvo.quadrants.length, 4);                 // sempre 4 areas
  assert.deepStrictEqual(salvo.quadrants[0].links[0], {title: "Zabbix", url: "http://10.0.0.1/", duration: 5, zoom: 100});  // minimo 5 s, zoom padrao
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

  // ---------- midia ----------
  const enviar = (nome, corpo) => fetch(url("/api/midia?nome=" + encodeURIComponent(nome)), {method: "POST", body: corpo});
  const video = Buffer.alloc(5000, 7);
  const up = await enviar("Vídeo da Recepção.MP4", video);
  assert.strictEqual(up.status, 200);
  const m = await up.json();
  assert.match(m.nome, /^\d+-video-da-recepcao\.mp4$/);          // nome seguro e unico
  assert.strictEqual(m.url, "midia/" + m.nome); assert.strictEqual(m.tipo, "video"); assert.strictEqual(m.tamanho, 5000);
  const lista = await (await fetch(url("/api/midia"))).json();
  assert.strictEqual(lista.length, 1);
  const parte = await fetch(url("/" + m.url), {headers: {Range: "bytes=100-199"}});  // o <video> pede pedacos
  assert.strictEqual(parte.status, 206);
  assert.strictEqual(parte.headers.get("content-range"), "bytes 100-199/5000");
  assert.strictEqual((await parte.arrayBuffer()).byteLength, 100);
  const cheio = await fetch(url("/" + m.url));
  assert.strictEqual(cheio.headers.get("content-type"), "video/mp4");
  assert.strictEqual(cheio.headers.get("content-security-policy"), "sandbox");   // SVG enviado nao roda script
  assert.strictEqual((await cheio.arrayBuffer()).byteLength, 5000);
  assert.strictEqual((await enviar("pagina.html", "<script>")).status, 400);     // so imagem/video
  assert.strictEqual((await enviar("vazio.png", "")).status, 400);
  assert.strictEqual((await fetch(url("/midia/..%2fconfig.json"))).status, 404);
  assert.strictEqual((await fetch(url("/api/midia/..%2fconfig.json"), {method: "DELETE"})).status, 400);
  assert.ok(fs.existsSync(path.join(DATA, "config.json")));
  assert.strictEqual((await fetch(url("/api/midia/" + m.nome), {method: "DELETE"})).status, 200);
  assert.strictEqual((await (await fetch(url("/api/midia"))).json()).length, 0);

  // ---------- funcoes da pagina ----------
  const U = require("./public/util.js");
  assert.ok(U.urlOk("midia/123-logo.png") && U.urlOk("https://x.y/") && !U.urlOk("midia/../x") && !U.urlOk("ftp://x"));
  assert.strictEqual(U.tipoMidia("midia/1-a.webm"), "video"); assert.strictEqual(U.tipoMidia("https://x/logo.PNG?v=2"), "imagem");
  assert.strictEqual(U.tipoMidia("http://grafana/d/x"), "pagina");
  // enquadramento: Full HD numa area 960x540 (grade 2x2 de uma TV Full HD) = escala exata 0,5, sem sobra
  assert.deepStrictEqual(U.encaixe(960, 540, 1920, 1080, "conter"), {sx: .5, sy: .5, ox: 0, oy: 0});
  const alta = U.encaixe(800, 1000, 1920, 1080, "conter");        // area alta (layout 3): centraliza na vertical
  assert.ok(alta.sx === alta.sy && alta.ox === 0 && alta.oy > 0);
  const est = U.encaixe(800, 1000, 1920, 1080, "esticar");
  assert.ok(Math.abs(est.sx * 1920 - 800) < 1e-9 && Math.abs(est.sy * 1080 - 1000) < 1e-9);

  assert.strictEqual(U.proximoZoom(100, 1), 110); assert.strictEqual(U.proximoZoom(100, -1), 90); assert.strictEqual(U.proximoZoom(400, 1), 400);
  assert.strictEqual(U.proximoZoom(25, -1), 25); assert.strictEqual(U.proximoZoom(130, -1), 125); assert.strictEqual(U.proximoZoom(57, 0), 100);
  assert.strictEqual((await (await post(JSON.stringify({quadrants: [{links: [{url: "http://a/", zoom: 9999}]}]}))).json()).quadrants[0].links[0].zoom, 400);

  // YAML: ida e volta exata + arquivo escrito a mao
  const cfgY = {layout: 3, mode: "display", tela: {resolucao: "1920x1080", ajuste: "conter"}, quadrants: [
    {links: [{title: 'Zab: "bix" #1', url: "http://10.0.0.1:8080/z?a=1#x", duration: 30}, {title: "it's", url: "midia/1-logo.png", duration: 15}]},
    {links: []}, {links: [{title: "", url: "https://youtu.be/dQw4w9WgXcQ", duration: 90}]}, {links: []}]};
  assert.deepStrictEqual(U.lerYaml(U.paraYaml(cfgY)), cfgY);
  const mao = U.lerYaml(`# feito a mao
layout: 2
tela:
  resolucao: 3840x2160   # 4K
  ajuste: esticar
quadrants:
- links:
  - title: Grafana NOC
    url: http://grafana.local:3000/d/abc?kiosk
    duration: 60
  - url: 'https://x.com/a#b'
    duration: 5
- links: []
`);
  assert.deepStrictEqual(mao, {layout: 2, tela: {resolucao: "3840x2160", ajuste: "esticar"}, quadrants: [
    {links: [{title: "Grafana NOC", url: "http://grafana.local:3000/d/abc?kiosk", duration: 60}, {url: "https://x.com/a#b", duration: 5}]}, {links: []}]});
  assert.deepStrictEqual(U.lerConfigTexto('{"layout": 1}'), {layout: 1});      // JSON tambem entra
  assert.throws(() => U.lerYaml(["layout: 2", "  solto: 1"].join("\n")));  // indentacao sem dono = erro claro

  // traducao: exata, com trecho variavel e sem entrada (fica em portugues)
  const {traduzir} = U, D = {"Salvar": "Save", "Área {}": "Area {}", "Não salvou: {}": "Not saved: {}", "{} itens": "{} items"};
  assert.strictEqual(traduzir("  Salvar ", D), "  Save ");
  assert.strictEqual(traduzir("Área 3", D), "Area 3");
  assert.strictEqual(traduzir("Não salvou: disco (cheio)", D), "Not saved: disco (cheio)");
  assert.strictEqual(traduzir("12 itens", D), "12 items");
  assert.strictEqual(traduzir("Outra coisa", D), "Outra coisa");
  const EN = require("vm").runInNewContext(fs.readFileSync(path.join(__dirname, "public/en.js"), "utf8") + ";EN");
  assert.strictEqual(traduzir("Vídeo · 12 MB", EN), "Video · 12 MB");
  assert.deepStrictEqual(await (await fetch(url("/api/info"))).json(), {cafe: "", pix: ""});  // sem CAFE_URL/PIX_CHAVE: sem botao

  console.log("test ok");
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { srv.kill(); fs.rmSync(DATA, {recursive: true, force: true}); });
