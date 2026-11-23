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

  const api = {paraEmbed, lerTempo, mostrarTempo};
  if (typeof module !== "undefined") module.exports = api;
  else Object.assign(raiz, api);
})(this);
