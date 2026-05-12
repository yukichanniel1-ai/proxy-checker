/**
 * proxy-file3.js -- Proxy Source Set 3
 * Sources: gfpcom, prxchk, Thordata, komutan234
 *
 * Standalone Vercel serverless function.
 * Scrapes HTTP/HTTPS/SOCKS4/SOCKS5 -> checks speed (5-1000ms) -> sends to Telegram.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config.json");
function loadConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")); } catch (_) { return {}; } }

// ═══════════════════════════════════════════════════════
// PROXY SOURCES SET 3 -- gfpcom + prxchk + Thordata + komutan234
// ═══════════════════════════════════════════════════════
const SOURCES = [
  { name: "gfpcom HTTP", url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/http.txt" },
  { name: "gfpcom SOCKS4", url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/socks4.txt" },
  { name: "gfpcom SOCKS5", url: "https://raw.githubusercontent.com/gfpcom/free-proxy-list/main/proxies/socks5.txt" },
  { name: "prxchk HTTP", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt" },
  { name: "prxchk SOCKS4", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks4.txt" },
  { name: "prxchk SOCKS5", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks5.txt" },
  { name: "Thordata HTTP", url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/http.txt" },
  { name: "Thordata SOCKS4", url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/socks4.txt" },
  { name: "Thordata SOCKS5", url: "https://raw.githubusercontent.com/Thordata/awesome-free-proxy-list/main/proxies/socks5.txt" },
  { name: "komutan234 HTTP", url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/http.txt" },
  { name: "komutan234 SOCKS4", url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks4.txt" },
  { name: "komutan234 SOCKS5", url: "https://raw.githubusercontent.com/komutan234/Proxy-List-Free/main/proxies/socks5.txt" },
];

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
const IP_RE = /(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})/g;
function validate(p) { const m = p.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/); if (!m) return false; return [1,2,3,4].every(i => parseInt(m[i]) <= 255) && parseInt(m[5]) >= 1 && parseInt(m[5]) <= 65535; }
function extractIps(t) { return (t.match(IP_RE) || []).filter(validate); }
function httpGet(url, timeout = 15000) {
  return new Promise(resolve => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout, headers: { "User-Agent": "Mozilla/5.0" } }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(d)); });
    req.on("error", () => resolve("")); req.on("timeout", () => { req.destroy(); resolve(""); });
    setTimeout(() => { req.destroy(); resolve(""); }, timeout + 1000);
  });
}

// ═══════════════════════════════════════════════════════
// SCRAPER
// ═══════════════════════════════════════════════════════
async function scrapeAll() {
  const results = await Promise.allSettled(SOURCES.map(async src => {
    const raw = await httpGet(src.url, 20000);
    if (!raw) return [];
    if (src.fmt === "geonode") { try { const d = JSON.parse(raw); return (d.data||[]).map(i => i.ip && i.port ? `${i.ip}:${i.port}` : "").filter(validate); } catch(_) { return []; } }
    if (src.fmt === "redscrape") { try { const d = JSON.parse(raw); const items = Array.isArray(d) ? d : d.proxies || d.data || []; return items.map(i => i.ip && i.port ? `${i.ip}:${i.port}` : "").filter(validate); } catch(_) { return []; } }
    return extractIps(raw);
  }));
  const seen = new Set(), proxies = [];
  for (const r of results) { if (r.status === "fulfilled") for (const p of r.value) if (!seen.has(p)) { seen.add(p); proxies.push(p); } }
  return proxies;
}

// ═══════════════════════════════════════════════════════
// CHECKER -- tries HTTP, SOCKS4, SOCKS5 for each proxy
// ═══════════════════════════════════════════════════════
const JUDGES = ["http://api.ipify.org?format=json","http://checkip.amazonaws.com","http://ip-api.com/json","http://httpbin.org/ip"];

function checkWithHttp(proxy, judge, timeoutMs) {
  return new Promise(resolve => {
    const start = Date.now();
    const { HttpProxyAgent } = require("http-proxy-agent");
    const agent = new HttpProxyAgent(`http://${proxy}`);
    const req = http.get(judge, { agent, timeout: timeoutMs }, res => { let d=""; res.on("data",c=>d+=c); res.on("end",()=>{ const ms=Date.now()-start; resolve(res.statusCode>=200&&res.statusCode<400?{ms,type:"http"}:null); }); });
    req.on("error",()=>resolve(null)); req.on("timeout",()=>{req.destroy();resolve(null);});
    setTimeout(()=>{req.destroy();resolve(null);},timeoutMs+500);
  });
}
function checkWithSocks(proxy, judge, socksType, timeoutMs) {
  return new Promise(resolve => {
    const start = Date.now();
    const { SocksProxyAgent } = require("socks-proxy-agent");
    const agent = new SocksProxyAgent(`${socksType}://${proxy}`);
    const req = http.get(judge, { agent, timeout: timeoutMs }, res => { let d=""; res.on("data",c=>d+=c); res.on("end",()=>{ const ms=Date.now()-start; resolve(res.statusCode>=200&&res.statusCode<400?{ms,type:socksType}:null); }); });
    req.on("error",()=>resolve(null)); req.on("timeout",()=>{req.destroy();resolve(null);});
    setTimeout(()=>{req.destroy();resolve(null);},timeoutMs+500);
  });
}

async function checkProxy(proxy, timeoutMs) {
  const judge = JUDGES[Math.floor(Math.random() * JUDGES.length)];
  // Try HTTP first (fastest), then SOCKS5, then SOCKS4
  let result = await checkWithHttp(proxy, judge, timeoutMs);
  if (result) return result;
  result = await checkWithSocks(proxy, judge, "socks5", timeoutMs);
  if (result) return result;
  result = await checkWithSocks(proxy, judge, "socks4", timeoutMs);
  return result;
}

async function checkAll(proxies, cfg = {}) {
  const timeoutMs = cfg.timeout_ms || 5000, maxConc = cfg.max_concurrent || 300;
  const minMs = cfg.min_speed_ms || 5, maxMs = cfg.max_speed_ms || 1000;
  const alive = [], dead = [];
  for (let i = 0; i < proxies.length; i += maxConc) {
    const batch = proxies.slice(i, i + maxConc);
    const results = await Promise.allSettled(batch.map(async proxy => {
      const r = await checkProxy(proxy, timeoutMs);
      return { proxy, ...(r || { ms: null, type: null }) };
    }));
    for (const r of results) {
      if (r.status === "fulfilled") {
        const { proxy, ms, type } = r.value;
        if (ms !== null && ms >= minMs && ms <= maxMs) alive.push({ proxy, ms, type });
        else dead.push(proxy);
      }
    }
  }
  alive.sort((a, b) => a.ms - b.ms);
  return { alive, dead };
}

// ═══════════════════════════════════════════════════════
// TELEGRAM
// ═══════════════════════════════════════════════════════
function tgMsg(token, chatId, text) {
  const payload = JSON.stringify({ chat_id: chatId, text: text.slice(0,4096), parse_mode: "HTML" });
  return new Promise(resolve => {
    const req = https.request(`https://api.telegram.org/bot${token}/sendMessage`, { method:"POST", headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(payload)}, timeout:15000 }, res => { let d=""; res.on("data",c=>d+=c); res.on("end",()=>resolve(true)); });
    req.on("error",()=>resolve(false)); req.write(payload); req.end();
  });
}
function tgFile(token, chatId, content, filename, caption) {
  const FormData = require("form-data"); const form = new FormData();
  form.append("chat_id", String(chatId)); form.append("document", Buffer.from(content,"utf-8"), { filename });
  if (caption) form.append("caption", caption.slice(0,1024));
  return new Promise(resolve => {
    const url = new URL(`https://api.telegram.org/bot${token}/sendDocument`);
    const req = https.request({ hostname:url.hostname, path:url.pathname, method:"POST", headers:form.getHeaders(), timeout:30000 }, res => { let d=""; res.on("data",c=>d+=c); res.on("end",()=>resolve(true)); });
    req.on("error",()=>resolve(false)); form.pipe(req);
  });
}

async function broadcast(alive, dead, config) {
  const token = config.telegram_bot_token || "", chatIds = config.chat_ids || [];
  if (!token || token === "YOUR_BOT_TOKEN_HERE") return;
  if (!chatIds.length || chatIds[0] === "CHAT_ID_1") return;
  const byType = {}; alive.forEach(p => { if (!byType[p.type]) byType[p.type] = []; byType[p.type].push(p); });
  const summary = `<b>Proxy File 3 Update</b>\nFast (5-1000ms): ${alive.length}\n` +
    Object.entries(byType).map(([t,items]) => `  ${t.toUpperCase()}: ${items.length}`).join("\n") +
    `\nDead/Slow: ${dead.length}\nFastest: ${alive.length > 0 ? alive[0].ms+"ms" : "N/A"}`;
  for (const chatId of chatIds) {
    await tgMsg(token, chatId, summary);
    if (alive.length > 0) {
      const all = alive.map(p => p.proxy).join("\n") + "\n";
      await tgFile(token, chatId, all, "proxy_file3_all.txt", `${alive.length} fast proxies`);
      for (const [type, items] of Object.entries(byType)) {
        const content = items.map(p => p.proxy).join("\n") + "\n";
        await tgFile(token, chatId, content, `proxy_file3_${type}.txt`, `${items.length} ${type.toUpperCase()}`);
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
// VERCEL HANDLER
// ═══════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  const config = loadConfig(); const cfg = config.checker || {};
  const t0 = Date.now();
  const proxies = await scrapeAll();
  const { alive, dead } = await checkAll(proxies, cfg);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  await broadcast(alive, dead, config);
  const byType = {}; alive.forEach(p => { if (!byType[p.type]) byType[p.type] = []; byType[p.type].push(p); });
  res.status(200).json({ file: "proxy-file3", scraped: proxies.length, alive: alive.length, dead: dead.length, elapsed_sec: elapsed, fastest: alive[0]?.ms+"ms" || null, by_type: Object.fromEntries(Object.entries(byType).map(([t,i])=>[t,i.length])), proxies: alive.map(p => ({ proxy:p.proxy, ms:p.ms, type:p.type })) });
};
