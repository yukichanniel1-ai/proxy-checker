#!/usr/bin/env node
/**
 * worker.js -- 5-Thread Proxy Checker + Bot-to-Bot Uploader
 *
 * Runs 5 concurrent workers. Each worker:
 *   1. Scrapes proxies from its assigned sources
 *   2. Checks which proxies are live (HTTP/SOCKS4/SOCKS5)
 *   3. Sends /start to the target bot
 *   4. Sends /upload_proxy
 *   5. Uploads the checked proxies file
 *   6. Sends /proxy_done
 *   7. Waits, then loops
 *
 * Usage: node worker.js
 * Config: config.json (telegram_bot_token, target_ids, checker settings)
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (_) {
    return {};
  }
}

// ═══════════════════════════════════════════════════════
// PROXY SOURCES (same as proxy-file1..5)
// ═══════════════════════════════════════════════════════

const SOURCES_BY_WORKER = [
  // Worker 1: ProxyScrape + Proxifly + GeoNode
  [
    { name: "ProxyScrape HTTP", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all" },
    { name: "ProxyScrape SOCKS4", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all" },
    { name: "ProxyScrape SOCKS5", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all" },
    { name: "Proxifly ALL", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.txt" },
    { name: "Proxifly HTTP", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt" },
    { name: "Proxifly SOCKS4", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks4/data.txt" },
    { name: "Proxifly SOCKS5", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt" },
    { name: "GeoNode p1", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
    { name: "GeoNode p2", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=2&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
    { name: "GeoNode p3", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=3&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
  ],
  // Worker 2: TheSpeedX + monosans + iplocate
  [
    { name: "TheSpeedX HTTP", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt" },
    { name: "TheSpeedX SOCKS4", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks4.txt" },
    { name: "TheSpeedX SOCKS5", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt" },
    { name: "monosans HTTP", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt" },
    { name: "monosans SOCKS4", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt" },
    { name: "monosans SOCKS5", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" },
    { name: "iplocate HTTP", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/http.txt" },
    { name: "iplocate SOCKS4", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks4.txt" },
    { name: "iplocate SOCKS5", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks5.txt" },
  ],
  // Worker 3: gfpcom + prxchk + Thordata + komutan234
  [
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
  ],
  // Worker 4: litport + pubproxy + redscrape + free-proxy-list.net + naravid19 + ShiftyTR
  [
    { name: "litport HTTP", url: "https://litport.net/free-proxy/http.txt" },
    { name: "litport SOCKS5", url: "https://litport.net/free-proxy/socks5.txt" },
    { name: "pubproxy HTTP", url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=http" },
    { name: "pubproxy SOCKS5", url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=socks5" },
    { name: "redscrape API", url: "https://free.redscrape.com/api/proxies", fmt: "redscrape" },
    { name: "free-proxy-list.net", url: "https://free-proxy-list.net/" },
    { name: "naravid19 HTTP", url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/http.txt" },
    { name: "naravid19 SOCKS4", url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/socks4.txt" },
    { name: "naravid19 SOCKS5", url: "https://raw.githubusercontent.com/naravid19/checked-proxies/main/socks5.txt" },
    { name: "ShiftyTR ALL", url: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/proxy.txt" },
  ],
  // Worker 5: hookzof + sunny9577 + ErcinDede + jetkai + roosterkid
  [
    { name: "hookzof SOCKS", url: "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt" },
    { name: "sunny9577 HTTP", url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/http_proxies.txt" },
    { name: "sunny9577 SOCKS4", url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks4_proxies.txt" },
    { name: "sunny9577 SOCKS5", url: "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/generated/socks5_proxies.txt" },
    { name: "ErcinDede HTTP", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/http.txt" },
    { name: "ErcinDede SOCKS4", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/socks4.txt" },
    { name: "ErcinDede SOCKS5", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/socks5.txt" },
    { name: "jetkai HTTP", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt" },
    { name: "jetkai SOCKS4", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt" },
    { name: "jetkai SOCKS5", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt" },
    { name: "roosterkid HTTP", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt" },
    { name: "roosterkid SOCKS4", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt" },
    { name: "roosterkid SOCKS5", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt" },
  ],
];

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const IP_RE = /(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})/g;
function validate(p) {
  const m = p.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/);
  if (!m) return false;
  return [1, 2, 3, 4].every((i) => parseInt(m[i]) <= 255) && parseInt(m[5]) >= 1 && parseInt(m[5]) <= 65535;
}
function extractIps(t) { return (t.match(IP_RE) || []).filter(validate); }

function httpGet(url, timeout = 15000) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(d));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
    setTimeout(() => { req.destroy(); resolve(""); }, timeout + 1000);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════
// SCRAPER
// ═══════════════════════════════════════════════════════

async function scrapeAll(sources) {
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const raw = await httpGet(src.url, 20000);
      if (!raw) return [];
      if (src.fmt === "geonode") {
        try { const d = JSON.parse(raw); return (d.data || []).map((i) => (i.ip && i.port ? `${i.ip}:${i.port}` : "")).filter(validate); }
        catch (_) { return []; }
      }
      if (src.fmt === "redscrape") {
        try { const d = JSON.parse(raw); const items = Array.isArray(d) ? d : d.proxies || d.data || []; return items.map((i) => (i.ip && i.port ? `${i.ip}:${i.port}` : "")).filter(validate); }
        catch (_) { return []; }
      }
      return extractIps(raw);
    })
  );
  const seen = new Set(), proxies = [];
  for (const r of results) {
    if (r.status === "fulfilled") for (const p of r.value) if (!seen.has(p)) { seen.add(p); proxies.push(p); }
  }
  return proxies;
}

// ═══════════════════════════════════════════════════════
// CHECKER
// ═══════════════════════════════════════════════════════

const JUDGES = [
  "http://api.ipify.org?format=json",
  "http://checkip.amazonaws.com",
  "http://ip-api.com/json",
  "http://httpbin.org/ip",
];

function checkWithHttp(proxy, judge, timeoutMs) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const { HttpProxyAgent } = require("http-proxy-agent");
    const agent = new HttpProxyAgent(`http://${proxy}`);
    const req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
        resolve(res.statusCode >= 200 && res.statusCode < 400 ? { ms, type: "http" } : null);
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    setTimeout(() => { req.destroy(); resolve(null); }, timeoutMs + 500);
  });
}

function checkWithSocks(proxy, judge, socksType, timeoutMs) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const { SocksProxyAgent } = require("socks-proxy-agent");
    const agent = new SocksProxyAgent(`${socksType}://${proxy}`);
    const req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
        resolve(res.statusCode >= 200 && res.statusCode < 400 ? { ms, type: socksType } : null);
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    setTimeout(() => { req.destroy(); resolve(null); }, timeoutMs + 500);
  });
}

async function checkProxy(proxy, timeoutMs) {
  const judge = JUDGES[Math.floor(Math.random() * JUDGES.length)];
  let result = await checkWithHttp(proxy, judge, timeoutMs);
  if (result) return result;
  result = await checkWithSocks(proxy, judge, "socks5", timeoutMs);
  if (result) return result;
  result = await checkWithSocks(proxy, judge, "socks4", timeoutMs);
  return result;
}

async function checkAll(proxies, cfg = {}) {
  const timeoutMs = cfg.timeout_ms || 5000;
  const maxConc = cfg.max_concurrent || 300;
  const minMs = cfg.min_speed_ms || 5;
  const maxMs = cfg.max_speed_ms || 1000;
  const alive = [], dead = [];

  for (let i = 0; i < proxies.length; i += maxConc) {
    const batch = proxies.slice(i, i + maxConc);
    const results = await Promise.allSettled(
      batch.map(async (proxy) => {
        const r = await checkProxy(proxy, timeoutMs);
        return { proxy, ...(r || { ms: null, type: null }) };
      })
    );
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
// TELEGRAM BOT-TO-BOT SENDER
// ═══════════════════════════════════════════════════════

function tgSendMessage(token, chatId, text) {
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" });
  return new Promise((resolve) => {
    const req = https.request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }, timeout: 15000 },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(true)); }
    );
    req.on("error", () => resolve(false));
    req.write(payload);
    req.end();
  });
}

function tgSendDocument(token, chatId, content, filename, caption) {
  const FormData = require("form-data");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", Buffer.from(content, "utf-8"), { filename });
  if (caption) form.append("caption", caption.slice(0, 1024));
  return new Promise((resolve) => {
    const url = new URL(`https://api.telegram.org/bot${token}/sendDocument`);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: "POST", headers: form.getHeaders(), timeout: 30000 },
      (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(true)); }
    );
    req.on("error", () => resolve(false));
    form.pipe(req);
  });
}

// ═══════════════════════════════════════════════════════
// WORKER -- single bot cycle
// ═══════════════════════════════════════════════════════

async function runWorker(workerId, sources, config) {
  const token = config.telegram_bot_token || "";
  const targetIds = config.target_ids || [];
  const targetId = targetIds[workerId] || targetIds[0] || "";
  const cfg = config.checker || {};
  const delayMin = (cfg.refresh_interval_minutes || 5) * 60 * 1000;

  if (!token || !targetId) {
    console.log(`[Worker ${workerId + 1}] Missing bot token or target_id. Skipping.`);
    return;
  }

  let cycle = 0;
  while (true) {
    cycle++;
    const tag = `[Worker ${workerId + 1} | Cycle ${cycle}]`;

    try {
      // Step 1: Scrape
      console.log(`${tag} Scraping proxies...`);
      const proxies = await scrapeAll(sources);
      console.log(`${tag} Scraped ${proxies.length} proxies`);

      if (proxies.length === 0) {
        console.log(`${tag} No proxies found, waiting...`);
        await sleep(delayMin);
        continue;
      }

      // Step 2: Check
      console.log(`${tag} Checking proxies...`);
      const { alive, dead } = await checkAll(proxies, cfg);
      console.log(`${tag} Alive: ${alive.length} | Dead: ${dead.length}`);

      if (alive.length === 0) {
        console.log(`${tag} No live proxies, waiting...`);
        await sleep(delayMin);
        continue;
      }

      // Step 3: Handshake - /start
      console.log(`${tag} Sending /start to target ${targetId}...`);
      await tgSendMessage(token, targetId, "/start");
      await sleep(1000);

      // Step 4: Command - /upload_proxy
      console.log(`${tag} Sending /upload_proxy...`);
      await tgSendMessage(token, targetId, "/upload_proxy");
      await sleep(1000);

      // Step 5: Upload proxy file
      const fileContent = alive.map((p) => p.proxy).join("\n") + "\n";
      const filename = `worker${workerId + 1}_proxies.txt`;
      const caption = `Worker ${workerId + 1} | ${alive.length} live proxies | Fastest: ${alive[0].ms}ms`;
      console.log(`${tag} Uploading ${filename} (${alive.length} proxies)...`);
      await tgSendDocument(token, targetId, fileContent, filename, caption);
      await sleep(1000);

      // Step 6: Signal - /proxy_done
      console.log(`${tag} Sending /proxy_done...`);
      await tgSendMessage(token, targetId, "/proxy_done");

      console.log(`${tag} Cycle complete. Waiting ${cfg.refresh_interval_minutes || 5} min...`);
    } catch (err) {
      console.error(`${tag} Error:`, err.message);
    }

    await sleep(delayMin);
  }
}

// ═══════════════════════════════════════════════════════
// MAIN -- spawn 5 workers
// ═══════════════════════════════════════════════════════

async function main() {
  const config = loadConfig();

  if (!config.telegram_bot_token) {
    console.error("Error: telegram_bot_token not set in config.json");
    process.exit(1);
  }

  if (!config.target_ids || config.target_ids.length === 0) {
    console.error("Error: target_ids not set in config.json");
    console.error('Add "target_ids": ["CHAT_ID_1", "CHAT_ID_2", ...] to config.json');
    process.exit(1);
  }

  console.log("=== Proxy Checker Worker ===");
  console.log(`Starting ${SOURCES_BY_WORKER.length} workers...`);
  console.log(`Target IDs: ${config.target_ids.join(", ")}`);
  console.log(`Refresh interval: ${config.checker?.refresh_interval_minutes || 5} min`);
  console.log("");

  const workers = SOURCES_BY_WORKER.map((sources, i) => runWorker(i, sources, config));
  await Promise.all(workers);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
