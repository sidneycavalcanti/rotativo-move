// Funcoes puras do painel, usadas pelo index.html e testadas pelo test.js.
// paraEmbed: links do YouTube viram o player de embed (o "watch?v=" bloqueia iframe).
// Autoplay so funciona mudo nos navegadores; o video fica em loop ate a area trocar de link.
(function (raiz) {
  const ID = /^[\w-]{11}$/;

  function paraEmbed(url) {
    let u;
    try { u = new URL(url); } catch { return url; }
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (!["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) return url;
    const partes = u.pathname.split("/").filter(Boolean);
    let lista = u.searchParams.get("list");
    if (lista && /^(RD|UL|LL|WL)/.test(lista)) lista = null;  // Mix/radio, curtidas, ver depois: o embed nao toca essas listas
    let id = null;
    if (host === "youtu.be") id = partes[0];
    else if (u.pathname === "/watch") id = u.searchParams.get("v");
    else if (["shorts", "live", "embed", "v"].includes(partes[0])) id = partes[1];
    const p = new URLSearchParams({autoplay: "1", mute: "1", controls: "0", rel: "0", playsinline: "1", modestbranding: "1", loop: "1"});
    const t = u.searchParams.get("t") || u.searchParams.get("start");
    if (t) p.set("start", String(parseInt(t, 10) || 0));
    if (partes[0] === "embed" && partes[1] === "videoseries" && lista || u.pathname === "/playlist" && lista) {
      p.set("list", lista);
      return "https://www.youtube.com/embed/videoseries?" + p;
    }
    if (partes[0] === "embed" && partes[1] === "live_stream" && u.searchParams.get("channel")) {
      p.set("channel", u.searchParams.get("channel")); p.delete("loop");
      return "https://www.youtube.com/embed/live_stream?" + p;
    }
    if (partes[0] === "channel" && partes[2] === "live") {  // ao vivo de um canal: /channel/UC.../live
      p.set("channel", partes[1]); p.delete("loop");
      return "https://www.youtube.com/embed/live_stream?" + p;
    }
    if (!id || !ID.test(id)) return url;  // @canal, /results etc.: deixa como esta
    if (lista) p.set("list", lista); else p.set("playlist", id);  // loop de um video so exige playlist=<id>
    return `https://www.youtube.com/embed/${id}?` + p;
  }

  // Tempo de exibicao: "90", "90s", "5m", "5 min", "2h", "1h30m", "1:30" (m:ss), "1:02:03" -> segundos (null se invalido)
  function lerTempo(txt) {
    const t = String(txt ?? "").trim().toLowerCase().replace(",", ".");
    if (!t) return null;
    if (/^\d+(:\d{1,2}){1,2}$/.test(t)) return t.split(":").reduce((acc, n) => acc * 60 + Number(n), 0);
    const m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s?)?$/);
    if (!m || !(m[1] || m[2] || m[3])) return null;
    return Math.round((Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0));
  }

  // segundos -> "45s", "1m 30s", "2h 5m"
  function mostrarTempo(s) {
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), seg = s % 60;
    return [h && h + "h", m && m + "m", seg && seg + "s"].filter(Boolean).join(" ") || "0s";
  }

  // Link valido: http(s) ou arquivo enviado para a biblioteca ("midia/123-logo.png")
  const urlOk = u => /^https?:\/\/\S+$/i.test(u) || /^midia\/[\w.-]+$/.test(u);

  // "imagem" | "video" | "pagina" pela extensao (arquivo enviado ou link direto para o arquivo)
  function tipoMidia(url) {
    const p = String(url).split(/[?#]/)[0].toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/.test(p)) return "imagem";
    if (/\.(mp4|m4v|webm|ogv|mov)$/.test(p)) return "video";
    return "pagina";
  }

  // Enquadramento: a pagina e desenhada numa "tela virtual" (vw x vh, ex.: 1920x1080) e reduzida para a area (aw x ah).
  // conter: mantem a proporcao e centraliza (pode sobrar faixa). esticar: preenche a area toda (pode distorcer um pouco).
  function encaixe(aw, ah, vw, vh, ajuste) {
    let sx = aw / vw, sy = ah / vh;
    if (ajuste !== "esticar") sx = sy = Math.min(sx, sy);
    return {sx, sy, ox: (aw - vw * sx) / 2, oy: (ah - vh * sy) / 2};
  }

  // ---------- YAML (so o necessario para a configuracao: mapas, listas, textos, numeros) ----------
  const textoYaml = v => typeof v === "string" ? JSON.stringify(v) : v === null || v === undefined ? "null" : String(v);  // "..." do JSON e valido em YAML
  function paraYaml(v, ind = "") {
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      return v.map(x => {
        if (x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length) {
          const linhas = paraYaml(x, ind + "  ").split("\n");
          return `${ind}- ${linhas[0].trimStart()}` + (linhas.length > 1 ? "\n" + linhas.slice(1).join("\n") : "");
        }
        return `${ind}- ${typeof x === "object" && x !== null ? paraYaml(x, ind + "  ").trimStart() : textoYaml(x)}`;
      }).join("\n");
    }
    if (v && typeof v === "object") {
      const ks = Object.keys(v);
      if (!ks.length) return "{}";
      return ks.map(k => {
        const x = v[k], chave = /^[\w-]+$/.test(k) ? k : JSON.stringify(k);
        if (x && typeof x === "object" && (Array.isArray(x) ? x.length : Object.keys(x).length))
          return `${ind}${chave}:\n` + paraYaml(x, ind + "  ");
        return `${ind}${chave}: ${x && typeof x === "object" ? paraYaml(x) : textoYaml(x)}`;
      }).join("\n");
    }
    return textoYaml(v);
  }

  function escalarYaml(t) {
    t = t.trim();
    if (t === "" || t === "~" || t === "null") return null;
    if (t === "true") return true;
    if (t === "false") return false;
    if (t === "[]") return [];
    if (t === "{}") return {};
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (t[0] === '"' || t[0] === "[" || t[0] === "{") {
      try { return JSON.parse(t); } catch { throw new Error("valor invalido: " + t); }
    }
    if (t[0] === "'") {
      if (!/'$/.test(t) || t.length < 2) throw new Error("aspas simples sem fechar: " + t);
      return t.slice(1, -1).replace(/''/g, "'");
    }
    return t;
  }

  // tira comentario "# ..." fora de aspas
  function semComentario(l) {
    let q = null;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === "\\" && q === '"') i++; else if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === "#" && (i === 0 || /\s/.test(l[i - 1]))) return l.slice(0, i);
    }
    return l;
  }

  // separa "chave: valor" (o ":" precisa de espaco ou fim de linha depois, entao "http://x" nao quebra)
  function chaveValor(t) {
    const q = t[0] === '"' || t[0] === "'" ? t[0] : null;
    let i = 0;
    if (q) { i = 1; while (i < t.length && t[i] !== q) i += t[i] === "\\" && q === '"' ? 2 : 1; i++; }
    const m = /:(\s|$)/.exec(t.slice(i));
    if (!m) return null;
    const k = t.slice(0, i + m.index).trim();
    return [q ? escalarYaml(k) : k, t.slice(i + m.index + 1)];
  }

  function lerYaml(txt) {
    const L = String(txt).replace(/\r/g, "").replace(/\t/g, "  ").split("\n").map(semComentario)
      .map(l => ({ind: l.length - l.trimStart().length, t: l.trim()})).filter(l => l.t && l.t !== "---" && l.t !== "...");
    let i = 0;
    function bloco(ind) {
      if (i >= L.length || L[i].ind < ind) return null;
      ind = L[i].ind;
      if (L[i].t === "-" || L[i].t.startsWith("- ")) {
        const lista = [];
        while (i < L.length && L[i].ind === ind && (L[i].t === "-" || L[i].t.startsWith("- "))) {
          const resto = L[i].t.slice(1).trim();
          if (!resto) { i++; lista.push(i < L.length && L[i].ind > ind ? bloco(ind + 1) : null); continue; }
          if (chaveValor(resto) && !/^["'[{]/.test(resto) || /^["'][^"']*["']\s*:/.test(resto)) {
            const col = ind + L[i].t.length - resto.length;  // "- chave: v": o mapa comeca na coluna da chave
            L[i] = {ind: col, t: resto};
            lista.push(bloco(col));
          } else { lista.push(escalarYaml(resto)); i++; }
        }
        return lista;
      }
      const obj = {};
      while (i < L.length && L[i].ind === ind && !L[i].t.startsWith("- ") && L[i].t !== "-") {
        const kv = chaveValor(L[i].t);
        if (!kv) throw new Error(`linha ${i + 1}: esperado "chave: valor" em "${L[i].t}"`);
        const [k, v] = kv;
        i++;
        if (v.trim()) obj[k] = escalarYaml(v);
        else if (i < L.length && (L[i].ind > ind || L[i].ind === ind && (L[i].t.startsWith("- ") || L[i].t === "-"))) obj[k] = bloco(L[i].ind);
        else obj[k] = null;
      }
      return obj;
    }
    const v = bloco(0);
    if (i < L.length) throw new Error(`indentacao inesperada perto de "${L[i].t}"`);
    return v;
  }

  // Importar: aceita JSON ou YAML (todo JSON tambem e YAML, mas o JSON.parse da mensagens de erro melhores)
  function lerConfigTexto(txt) {
    const t = String(txt).trim();
    if (t[0] === "{") return JSON.parse(t);
    return lerYaml(t);
  }

  // Zoom como o do navegador: degraus fixos, Ctrl + sobe e Ctrl - desce
  const ZOOMS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400];
  function proximoZoom(atual, dir) {
    if (dir === 0) return 100;
    const z = Number(atual) || 100;
    return dir > 0 ? ZOOMS.find(x => x > z) ?? 400 : [...ZOOMS].reverse().find(x => x < z) ?? 25;
  }

  // Traducao: o texto em portugues e a chave. "{}" no dicionario casa qualquer trecho (numeros, nomes) e e
  // repassado na mesma ordem para a traducao. Sem traducao, devolve o original.
  const padroes = new WeakMap();
  function traduzir(texto, dic) {
    const s = String(texto), t = s.trim();
    if (!t) return s;
    if (Object.hasOwn(dic, t)) return s.replace(t, dic[t]);
    let lista = padroes.get(dic);
    if (!lista) {
      lista = Object.keys(dic).filter(k => k.includes("{}")).map(k =>
        [new RegExp("^" + k.split("{}").map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.+?)") + "$", "s"), dic[k]]);
      padroes.set(dic, lista);
    }
    for (const [re, en] of lista) {
      const m = t.match(re);
      if (m) { let i = 1; return s.replace(t, en.replace(/\{\}/g, () => m[i++])); }
    }
    return s;
  }

  const api = {traduzir, proximoZoom, paraEmbed, lerTempo, mostrarTempo, urlOk, tipoMidia, encaixe, paraYaml, lerYaml, lerConfigTexto};
  if (typeof module !== "undefined") module.exports = api;
  else Object.assign(raiz, api);
})(this);
