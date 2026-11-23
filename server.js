// Painel rotativo: servidor HTTP puro (sem dependencias). Serve /public e guarda o estado em /data/config.json.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const DATA = process.env.DATA_DIR || "/data";
const CONFIG = path.join(DATA, "config.json");
const MAX_BODY = 1024 * 1024; // 1 MB e muito para uma lista de links

const TIPOS = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
               ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"};

const padrao = () => ({layout: 4, mode: "settings", quadrants: [0, 1, 2, 3].map(() => ({links: []}))});

// Aceita so o formato esperado: o que vier a mais e descartado, o que faltar volta ao padrao.
function normalizar(c) {
  if (!c || typeof c !== "object") throw new Error("JSON precisa ser um objeto");
  const layout = [1, 2, 3, 4].includes(Number(c.layout)) ? Number(c.layout) : 4;
  const mode = c.mode === "display" ? "display" : "settings";
  const qs = Array.isArray(c.quadrants) ? c.quadrants : [];
  const quadrants = [0, 1, 2, 3].map(i => ({
    links: (Array.isArray(qs[i] && qs[i].links) ? qs[i].links : []).slice(0, 100).map(l => ({
      title: String((l && l.title) || "").slice(0, 120),
      url: String((l && l.url) || "").trim().slice(0, 2000),
      duration: Math.min(86400, Math.max(5, Math.round(Number(l && l.duration) || 15))),
    })),
  }));
  return {layout, mode, quadrants};
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

function json(res, status, obj) {
  res.writeHead(status, {"Content-Type": TIPOS[".json"], "Cache-Control": "no-store"});
  res.end(JSON.stringify(obj));
}

function estatico(req, res) {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const arq = path.normalize(path.join(PUBLIC, rel === "/" ? "index.html" : rel));
  if (!arq.startsWith(PUBLIC + path.sep)) return json(res, 403, {erro: "proibido"});
  fs.readFile(arq, (err, dados) => {
    if (err) return json(res, 404, {erro: "nao encontrado"});
    res.writeHead(200, {"Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream", "Cache-Control": "no-cache"});
    res.end(dados);
  });
}

http.createServer((req, res) => {
  const rota = req.url.split("?")[0];
  if (rota === "/api/config" && req.method === "GET") return json(res, 200, lerConfig());
  if (rota === "/api/config" && req.method === "POST") {
    let corpo = "", grande = false;
    req.on("data", p => { corpo += p; if (corpo.length > MAX_BODY) { grande = true; req.destroy(); } });
    req.on("end", () => {
      if (grande) return;
      try { const c = normalizar(JSON.parse(corpo)); gravarConfig(c); json(res, 200, c); }
      catch (e) { json(res, 400, {erro: e.message}); }
    });
    return;
  }
  if (rota === "/health") return json(res, 200, {ok: true});
  if (req.method === "GET" || req.method === "HEAD") return estatico(req, res);
  json(res, 405, {erro: "metodo nao permitido"});
}).listen(PORT, () => console.log(`painel-rotativo na porta ${PORT}, config em ${CONFIG}`));
