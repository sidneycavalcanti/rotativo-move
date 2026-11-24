// Teste do servidor sem dependencias: node test.js
const {spawn} = require("child_process");
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const PORT = 39000 + Math.floor(Math.random() * 1000);
const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {env: {...process.env, PORT}, stdio: "inherit"});
const url = p => `http://127.0.0.1:${PORT}${p}`;
const U = require("./public/util.js");

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(url("/health")); break; } catch { await new Promise(r => setTimeout(r, 100)); } }

  // o servidor nao guarda nada de ninguem: sem API de configuracao nem de midia
  for (const [m, p] of [["GET", "/api/config"], ["POST", "/api/config"], ["GET", "/api/midia"], ["POST", "/api/midia?nome=a.png"]])
    assert.notStrictEqual((await fetch(url(p), {method: m, body: m === "POST" ? "{}" : undefined})).status, 200, m + " " + p);

  // configuracao (validada no navegador)
  assert.deepStrictEqual(U.normalizar({}), U.padrao());
  const salvo = U.normalizar({layout: 2, mode: "display", extra: 1, tela: {resolucao: "3840x2160", ajuste: "esticar", lixo: 1},
    quadrants: [{links: [{title: "Zabbix", url: " http://10.0.0.1/ ", duration: 2}, {url: "http://10.0.0.2/", duration: "30"}]}]});
  assert.strictEqual(salvo.mode, "display"); assert.strictEqual(salvo.layout, 2);
  assert.strictEqual(salvo.extra, undefined);                    // campo desconhecido descartado
  assert.deepStrictEqual(salvo.tela, {resolucao: "3840x2160", ajuste: "esticar"});
  assert.strictEqual(U.normalizar({tela: {resolucao: "999x1", ajuste: "x"}}).tela.resolucao, "auto");
  assert.deepStrictEqual(U.normalizar({tela: {divX: 0.3333, divY: 2}}).tela, {resolucao: "auto", ajuste: "conter", divX: 0.333});  // divisoria; fora de 0,1-0,9 cai
  assert.strictEqual(salvo.quadrants.length, 4);                 // sempre 4 areas
  assert.deepStrictEqual(salvo.quadrants[0].links[0], {title: "Zabbix", url: "http://10.0.0.1/", duration: 5, zoom: 100});  // minimo 5 s
  assert.strictEqual(salvo.quadrants[0].links[1].duration, 30);
  assert.strictEqual(U.normalizar({quadrants: [{links: [{url: "http://a/", zoom: 9999}]}]}).quadrants[0].links[0].zoom, 400);
  assert.throws(() => U.normalizar([]));
  // nome da midia guardada no navegador
  assert.strictEqual(U.nomeMidia("Vídeo da Recepção.MP4", 1), "1-video-da-recepcao.mp4");
  assert.strictEqual(U.nomeMidia("pagina.html", 1), null); assert.strictEqual(U.nomeMidia("semextensao", 1), null);

  for (const p of ["/../server.js", "/%2e%2e/server.js", "/..%2fserver.js"])  // nada fora de /public
    assert.notStrictEqual((await fetch(url(p))).status, 200, p);
  assert.match(await (await fetch(url("/"))).text(), /Painel Rotativo/);
  assert.match(await (await fetch(url("/"))).text(), /<script src="util\.js\?v=\w+"><\/script>/);  // sem cache velho de CDN

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

  // ---------- funcoes da pagina ----------
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
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => srv.kill());
