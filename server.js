// Painel rotativo: servidor HTTP puro (sem dependencias).
// Serve /public, guarda o estado em /data/config.json e as imagens/videos enviados pelo navegador em /data/midia.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const DATA = process.env.DATA_DIR || "/data";
const CONFIG = path.join(DATA, "config.json");
const MIDIA = path.join(DATA, "midia");
const MAX_BODY = 1024 * 1024;                                          // config: 1 MB e muito para uma lista de links
const MAX_UPLOAD = (Number(process.env.MAX_UPLOAD_MB) || 2048) * 2 ** 20; // midia: 2 GB por arquivo (ajustavel)

const TIPOS = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
               ".json": "application/json; charset=utf-8", ".ico": "image/x-icon",
               ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
               ".svg": "image/svg+xml", ".avif": "image/avif", ".bmp": "image/bmp",
               ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".ogv": "video/ogg", ".mov": "video/quicktime"};
const EXT_MIDIA = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".mp4", ".m4v", ".webm", ".ogv", ".mov"];
// "Me pague um cafe": link da pagina de pagamento (Buy Me a Coffee, Ko-fi, LivePix...). So http(s); vazio = sem botao
const CAFE = /^https?:\/\/\S+$/i.test(process.env.CAFE_URL || "") ? process.env.CAFE_URL : "";
const PIX = String(process.env.PIX_CHAVE || "").replace(/[^\w@.+-]/g, "").slice(0, 77);  // chave Pix (telefone, e-mail, CPF ou aleatoria)
const RESOLUCOES = ["auto", "1280x720", "1920x1080", "2560x1440", "3840x2160"];

const padrao = () => ({layout: 4, mode: "settings", tela: {resolucao: "auto", ajuste: "conter"},
                       quadrants: [0, 1, 2, 3].map(() => ({links: []}))});

// Aceita so o formato esperado: o que vier a mais e descartado, o que faltar volta ao padrao.
function normalizar(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("a configuracao precisa ser um objeto");
  const layout = [1, 2, 3, 4].includes(Number(c.layout)) ? Number(c.layout) : 4;
  const mode = c.mode === "display" ? "display" : "settings";
  const t = c.tela && typeof c.tela === "object" ? c.tela : {};
  const tela = {resolucao: RESOLUCOES.includes(String(t.resolucao)) ? String(t.resolucao) : "auto",
                ajuste: t.ajuste === "esticar" ? "esticar" : "conter"};
  // divisorias arrastadas na exibicao: fracao da largura (divX) e da altura (divY); sem valor = padrao do layout
  for (const k of ["divX", "divY"]) { const v = Number(t[k]); if (v >= 0.1 && v <= 0.9) tela[k] = Math.round(v * 1000) / 1000; }
  const qs = Array.isArray(c.quadrants) ? c.quadrants : [];
  const quadrants = [0, 1, 2, 3].map(i => ({
    links: (Array.isArray(qs[i] && qs[i].links) ? qs[i].links : []).slice(0, 100).map(l => ({
      title: String((l && l.title) || "").slice(0, 120),
      url: String((l && l.url) || "").trim().slice(0, 2000),
      duration: Math.min(86400, Math.max(5, Math.round(Number(l && l.duration) || 15))),
      zoom: Math.min(400, Math.max(25, Math.round(Number(l && l.zoom) || 100))),   // % (Ctrl +/- na exibicao)
    })),
  }));
  return {layout, mode, tela, quadrants};
}

function lerConfig() {
  try { return normalizar(JSON.parse(fs.readFileSync(CONFIG, "utf8"))); }
  catch { return padrao(); }
}

function gravarConfig(c) {
  fs.mkdirSync(DATA, {recursive: true});
  const tmp = CONFIG + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, CONFIG); // troca atomica: nunca fica um config.json pela metade
}

const semPermissao = e => `o servidor nao conseguiu gravar em ${DATA} (${e.code || e.message}). No host, na pasta do projeto: sudo chown -R 1000:1000 data`;

function json(res, status, obj) {
  res.writeHead(status, {"Content-Type": TIPOS[".json"], "Cache-Control": "no-store"});
  res.end(JSON.stringify(obj));
}

// Arquivo com suporte a Range: o <video> pede pedacos para tocar, avancar e repetir sem baixar tudo de novo.
function enviarArquivo(req, res, arq, extra = {}) {
  fs.stat(arq, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, {erro: "nao encontrado"});
    const cab = {"Content-Type": TIPOS[path.extname(arq).toLowerCase()] || "application/octet-stream", "Accept-Ranges": "bytes", ...extra};
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m && (m[1] || m[2])) {
      let ini = m[1] ? Number(m[1]) : st.size - Number(m[2]), fim = m[1] && m[2] ? Number(m[2]) : st.size - 1;
      ini = Math.max(0, ini); fim = Math.min(fim, st.size - 1);
      if (ini > fim) { res.writeHead(416, {"Content-Range": `bytes */${st.size}`}); return res.end(); }
      res.writeHead(206, {...cab, "Content-Range": `bytes ${ini}-${fim}/${st.size}`, "Content-Length": fim - ini + 1});
      return req.method === "HEAD" ? res.end() : fs.createReadStream(arq, {start: ini, end: fim}).pipe(res);
    }
    res.writeHead(200, {...cab, "Content-Length": st.size});
    req.method === "HEAD" ? res.end() : fs.createReadStream(arq).pipe(res);
  });
}

function estatico(req, res, rel) {
  const arq = path.normalize(path.join(PUBLIC, rel === "/" ? "index.html" : rel));
  if (!arq.startsWith(PUBLIC + path.sep)) return json(res, 403, {erro: "proibido"});
  enviarArquivo(req, res, arq, {"Cache-Control": "no-cache"});
}

// ---------- midia (imagens e videos enviados pelo navegador) ----------
// Nome seguro e unico: "Logo da Empresa.PNG" -> "1795467000123-logo-da-empresa.png"
function nomeMidia(original) {
  const ext = path.extname(String(original || "")).toLowerCase();
  if (!EXT_MIDIA.includes(ext)) return null;
  const base = path.basename(String(original), path.extname(String(original))).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "arquivo";
  return `${Date.now()}-${base}${ext}`;
}
const caminhoMidia = nome => /^[\w.-]+$/.test(nome) && !nome.startsWith(".") ? path.join(MIDIA, nome) : null;

function listarMidia() {
  try {
    return fs.readdirSync(MIDIA).filter(n => EXT_MIDIA.includes(path.extname(n).toLowerCase())).map(n => {
      const st = fs.statSync(path.join(MIDIA, n));
      return {nome: n, url: "midia/" + n, tamanho: st.size, data: Math.round(st.mtimeMs),
              tipo: [".mp4", ".m4v", ".webm", ".ogv", ".mov"].includes(path.extname(n).toLowerCase()) ? "video" : "imagem"};
    }).sort((a, b) => b.data - a.data);
  } catch { return []; }
}

function receberMidia(req, res, original) {
  const nome = nomeMidia(original);
  if (!nome) { req.resume(); return json(res, 400, {erro: "tipo de arquivo nao aceito. Use imagem (png, jpg, gif, webp, svg, avif) ou video (mp4, webm, ogv, mov)"}); }
  if (Number(req.headers["content-length"]) > MAX_UPLOAD) { req.resume(); return json(res, 413, {erro: `arquivo maior que ${MAX_UPLOAD / 2 ** 20} MB (ajuste MAX_UPLOAD_MB)`}); }
  try { fs.mkdirSync(MIDIA, {recursive: true}); } catch (e) { req.resume(); return json(res, 500, {erro: semPermissao(e)}); }
  const final = path.join(MIDIA, nome), tmp = final + ".parcial";
  let recebido = 0, abortado = false;
  const out = fs.createWriteStream(tmp);
  const falhar = (status, erro) => { if (abortado) return; abortado = true; out.destroy(); fs.rm(tmp, {force: true}, () => {}); json(res, status, {erro}); };
  req.on("data", p => { recebido += p.length; if (recebido > MAX_UPLOAD) { falhar(413, "arquivo grande demais"); req.destroy(); } });
  req.on("aborted", () => falhar(400, "envio interrompido"));
  out.on("error", e => falhar(500, semPermissao(e)));
  out.on("finish", () => {
    if (abortado) return;
    if (!recebido) { fs.rm(tmp, {force: true}, () => {}); return json(res, 400, {erro: "arquivo vazio"}); }
    fs.rename(tmp, final, e => e ? json(res, 500, {erro: semPermissao(e)}) : json(res, 200, listarMidia().find(m => m.nome === nome)));
  });
  req.pipe(out);
}

http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, "http://x"); } catch { return json(res, 400, {erro: "url invalida"}); }
  let rota;
  try { rota = decodeURIComponent(u.pathname); } catch { return json(res, 400, {erro: "url invalida"}); }

  if (rota === "/api/info" && req.method === "GET") return json(res, 200, {cafe: CAFE, pix: PIX});
  if (rota === "/api/config" && req.method === "GET") return json(res, 200, lerConfig());
  if (rota === "/api/config" && req.method === "POST") {
    let corpo = "", grande = false;
    req.on("data", p => { corpo += p; if (corpo.length > MAX_BODY) { grande = true; req.destroy(); } });
    req.on("end", () => {
      if (grande) return;
      let c;
      try { c = normalizar(JSON.parse(corpo)); }
      catch (e) { return json(res, 400, {erro: "JSON invalido: " + e.message}); }
      try { gravarConfig(c); json(res, 200, c); }
      catch (e) { console.error("falha ao gravar", CONFIG, e.message); json(res, 500, {erro: semPermissao(e)}); }
    });
    return;
  }
  if (rota === "/api/midia" && req.method === "GET") return json(res, 200, listarMidia());
  if (rota === "/api/midia" && req.method === "POST") return receberMidia(req, res, u.searchParams.get("nome"));
  if (rota.startsWith("/api/midia/") && req.method === "DELETE") {
    const arq = caminhoMidia(rota.slice("/api/midia/".length));
    if (!arq) return json(res, 400, {erro: "nome invalido"});
    return fs.rm(arq, e => e ? json(res, e.code === "ENOENT" ? 404 : 500, {erro: e.code}) : json(res, 200, {ok: true}));
  }
  if (rota.startsWith("/midia/") && (req.method === "GET" || req.method === "HEAD")) {
    const arq = caminhoMidia(rota.slice("/midia/".length));
    if (!arq) return json(res, 404, {erro: "nao encontrado"});
    // nome unico por envio: pode ficar em cache. sandbox + nosniff: um SVG enviado nao roda script na origem do painel
    return enviarArquivo(req, res, arq, {"Cache-Control": "public, max-age=31536000, immutable",
                                         "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff"});
  }
  if (rota === "/health") return json(res, 200, {ok: true});
  if (req.method === "GET" || req.method === "HEAD") return estatico(req, res, rota);
  json(res, 405, {erro: "metodo nao permitido"});
}).listen(PORT, () => {
  console.log(`painel-rotativo na porta ${PORT}, dados em ${DATA}`);
  try { fs.mkdirSync(MIDIA, {recursive: true}); fs.accessSync(DATA, fs.constants.W_OK); }
  catch (e) { console.error(`ATENCAO: sem permissao de gravar em ${DATA} (${e.code}); salvar e enviar midia vao falhar. No host: sudo chown -R 1000:1000 data`); }
});
