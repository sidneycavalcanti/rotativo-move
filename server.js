// Painel rotativo: servidor HTTP puro (sem dependencias) que so entrega a pagina.
// Nada de quem usa passa por aqui: a configuracao e as imagens/videos ficam no navegador de cada pessoa
// (localStorage e IndexedDB). Outro navegador ou outra pessoa abre o painel vazio.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const INDEX = path.join(PUBLIC, "index.html");
const VERSAO = Date.now().toString(36);  // muda a cada vez que o container sobe (deploy)
const TIPOS = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
               ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"};
// "Me pague um cafe": link da pagina de pagamento (Buy Me a Coffee, Ko-fi, LivePix...). So http(s); vazio = sem botao
const CAFE = /^https?:\/\/\S+$/i.test(process.env.CAFE_URL || "") ? process.env.CAFE_URL : "";
const PIX = String(process.env.PIX_CHAVE || "").replace(/[^\w@.+-]/g, "").slice(0, 77);  // chave Pix (telefone, e-mail, CPF ou aleatoria)

function json(res, status, obj) {
  res.writeHead(status, {"Content-Type": TIPOS[".json"], "Cache-Control": "no-store"});
  res.end(JSON.stringify(obj));
}

http.createServer((req, res) => {
  let rota;
  try { rota = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { return json(res, 400, {erro: "url invalida"}); }
  if (rota === "/health") return json(res, 200, {ok: true});
  if (rota === "/api/info" && req.method === "GET") return json(res, 200, {cafe: CAFE, pix: PIX});
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, {erro: "metodo nao permitido"});
  const arq = path.normalize(path.join(PUBLIC, rota === "/" ? "index.html" : rota));
  if (!arq.startsWith(PUBLIC + path.sep)) return json(res, 403, {erro: "proibido"});
  if (arq === INDEX) {  // scripts com ?v=<versao>: proxy/CDN (Cloudflare guarda .js por horas) nunca serve um util.js velho
    res.writeHead(200, {"Content-Type": TIPOS[".html"], "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"});
    return res.end(req.method === "HEAD" ? undefined : fs.readFileSync(INDEX, "utf8").replace(/src="(\w+\.js)"/g, `src="$1?v=${VERSAO}"`));
  }
  fs.stat(arq, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, {erro: "nao encontrado"});
    res.writeHead(200, {"Content-Type": TIPOS[path.extname(arq).toLowerCase()] || "application/octet-stream",
                        "Content-Length": st.size, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"});
    req.method === "HEAD" ? res.end() : fs.createReadStream(arq).pipe(res);
  });
}).listen(PORT, () => console.log(`painel-rotativo na porta ${PORT} (dados ficam no navegador de cada pessoa)`));
