/**
 * proxy-manager.js -- Raw Proxy Manager API
 *
 * Serves checked proxies as raw text or JSON.
 * Scrapes from ALL sources, checks live, returns results.
 *
 * Endpoints:
 *   GET /api/proxy-manager              → raw ip:port (all types)
 *   GET /api/proxy-manager?type=http    → raw ip:port (HTTP only)
 *   GET /api/proxy-manager?type=socks4  → raw ip:port (SOCKS4 only)
 *   GET /api/proxy-manager?type=socks5  → raw ip:port (SOCKS5 only)
 *   GET /api/proxy-manager?format=json  → JSON with speed + type info
 *   GET /api/proxy-manager?limit=100    → limit number of results
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config.json");
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (_) {
    return {};
  }
}

// ═══════════════════════════════════════════════════════
// ALL PROXY SOURCES (combined from proxy-file1..5)
// ═══════════════════════════════════════════════════════

const SOURCES = [
  // ProxyScrape
  { name: "ProxyScrape HTTP", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all" },
  { name: "ProxyScrape SOCKS4", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all" },
  { name: "ProxyScrape SOCKS5", url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all" },
  // Proxifly
  { name: "Proxifly ALL", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.txt" },
  { name: "Proxifly HTTP", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt" },
  { name: "Proxifly SOCKS4", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks4/data.txt" },
  { name: "Proxifly SOCKS5", url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt" },
  // GeoNode
  { name: "GeoNode p1", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
  { name: "GeoNode p2", url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=2&sort_by=lastChecked&sort_type=desc", fmt: "geonode" },
  // TheSpeedX
  { name: "TheSpeedX HTTP", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt" },
  { name: "TheSpeedX SOCKS4", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks4.txt" },
  { name: "TheSpeedX SOCKS5", url: "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt" },
  // monosans
  { name: "monosans HTTP", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt" },
  { name: "monosans SOCKS4", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt" },
  { name: "monosans SOCKS5", url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" },
  // iplocate
  { name: "iplocate HTTP", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/http.txt" },
  { name: "iplocate SOCKS4", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks4.txt" },
  { name: "iplocate SOCKS5", url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks5.txt" },
  // prxchk
  { name: "prxchk HTTP", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt" },
  { name: "prxchk SOCKS4", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks4.txt" },
  { name: "prxchk SOCKS5", url: "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks5.txt" },
  // jetkai
  { name: "jetkai HTTP", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt" },
  { name: "jetkai SOCKS4", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt" },
  { name: "jetkai SOCKS5", url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt" },
  // ErcinDede
  { name: "ErcinDede HTTP", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/http.txt" },
  { name: "ErcinDede SOCKS4", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/socks4.txt" },
  { name: "ErcinDede SOCKS5", url: "https://raw.githubusercontent.com/ErcinDedeworken/proxies/main/proxies/socks5.txt" },
  // roosterkid
  { name: "roosterkid HTTP", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt" },
  { name: "roosterkid SOCKS4", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt" },
  { name: "roosterkid SOCKS5", url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt" },
  // hookzof
  { name: "hookzof SOCKS", url: "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt" },
  // ShiftyTR
  { name: "ShiftyTR ALL", url: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/proxy.txt" },
];

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const IP_RE = /(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})/g;

function validate(p) {
  const m = p.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/);
  if (!m) return false;
  return (
    [1, 2, 3, 4].every((i) => parseInt(m[i]) <= 255) &&
    parseInt(m[5]) >= 1 &&
    parseInt(m[5]) <= 65535
  );
}

function extractIps(t) {
  return (t.match(IP_RE) || []).filter(validate);
}

function httpGet(url, timeout = 10000) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    const mod = url.startsWith("https") ? https : http;
    const timer = setTimeout(() => {
      try { req.destroy(); } catch (_) {}
      done("");
    }, timeout + 2000);

    let req;
    try {
      req = mod.get(url, { timeout, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        let d = "";
        res.on("data", (c) => { d += c; });
        res.on("end", () => { clearTimeout(timer); done(d); });
        res.on("error", () => { clearTimeout(timer); done(""); });
      });
    } catch (_) {
      clearTimeout(timer);
      done("");
      return;
    }

    req.on("error", () => { clearTimeout(timer); done(""); });
    req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); } catch (_) {} done(""); });
  });
}

// ═══════════════════════════════════════════════════════
// SCRAPER
// ═══════════════════════════════════════════════════════

async function scrapeAll() {
  const results = await Promise.allSettled(
    SOURCES.map(async (src) => {
      try {
        const raw = await httpGet(src.url, 15000);
        if (!raw) return [];
        if (src.fmt === "geonode") {
          try {
            const d = JSON.parse(raw);
            return (d.data || [])
              .map((i) => (i.ip && i.port ? `${i.ip}:${i.port}` : ""))
              .filter(validate);
          } catch (_) {
            return [];
          }
        }
        return extractIps(raw);
      } catch (_) {
        return [];
      }
    })
  );
  const seen = new Set();
  const proxies = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const p of r.value) {
        if (!seen.has(p)) {
          seen.add(p);
          proxies.push(p);
        }
      }
    }
  }
  return proxies;
}

// ═══════════════════════════════════════════════════════
// PROXY CHECKER
// ═══════════════════════════════════════════════════════

const JUDGES = [
  "http://api.ipify.org?format=json",
  "http://checkip.amazonaws.com",
  "http://ip-api.com/json",
  "http://httpbin.org/ip",
];

function checkWithHttp(proxy, judge, timeoutMs) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    const start = process.hrtime.bigint();
    let agent;
    try {
      const { HttpProxyAgent } = require("http-proxy-agent");
      agent = new HttpProxyAgent(`http://${proxy}`);
    } catch (_) {
      done(null);
      return;
    }

    const timer = setTimeout(() => {
      try { req.destroy(); } catch (_) {}
      try { agent.destroy(); } catch (_) {}
      done(null);
    }, timeoutMs + 500);

    let req;
    try {
      req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
        let d = "";
        res.on("data", (c) => { d += c; });
        res.on("end", () => {
          clearTimeout(timer);
          const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
          try { agent.destroy(); } catch (_) {}
          done(res.statusCode >= 200 && res.statusCode < 400 ? { ms, type: "http" } : null);
        });
        res.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); });
      });
    } catch (_) {
      clearTimeout(timer);
      try { agent.destroy(); } catch (_) {}
      done(null);
      return;
    }

    req.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); });
    req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} done(null); });
  });
}

function checkWithSocks(proxy, judge, socksType, timeoutMs) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    const start = process.hrtime.bigint();
    let agent;
    try {
      const { SocksProxyAgent } = require("socks-proxy-agent");
      agent = new SocksProxyAgent(`${socksType}://${proxy}`);
    } catch (_) {
      done(null);
      return;
    }

    const timer = setTimeout(() => {
      try { req.destroy(); } catch (_) {}
      try { agent.destroy(); } catch (_) {}
      done(null);
    }, timeoutMs + 500);

    let req;
    try {
      req = http.get(judge, { agent, timeout: timeoutMs }, (res) => {
        let d = "";
        res.on("data", (c) => { d += c; });
        res.on("end", () => {
          clearTimeout(timer);
          const ms = (Number(process.hrtime.bigint() - start) / 1e6) | 0;
          try { agent.destroy(); } catch (_) {}
          done(res.statusCode >= 200 && res.statusCode < 400 ? { ms, type: socksType } : null);
        });
        res.on("error", () => { clearTimeout(timer); try { agent.destroy(); } catch (_) {} done(null); });
      });
    } catch (_) {
      clearTimeout(timer);
      try { agent.destroy(); } catch (_) {}
      done(null);
      return;
    }

    req.on("error", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} done(null); });
    req.on("timeout", () => { clearTimeout(timer); try { req.destroy(); agent.destroy(); } catch (_) {} done(null); });
  });
}

async function checkProxy(proxy, timeoutMs) {
  const judge = JUDGES[Math.floor(Math.random() * JUDGES.length)];
  const result = await checkWithHttp(proxy, judge, timeoutMs);
  if (result) return result;
  const r2 = await checkWithSocks(proxy, judge, "socks5", timeoutMs);
  if (r2) return r2;
  return await checkWithSocks(proxy, judge, "socks4", timeoutMs);
}

async function checkAll(proxies, cfg = {}) {
  const timeoutMs = cfg.timeout_ms || 3000;
  const maxConc = Math.min(cfg.max_concurrent || 500, 500);
  const minMs = cfg.min_speed_ms || 5;
  const maxMs = cfg.max_speed_ms || 1000;
  const alive = [];
  let deadCount = 0;

  for (let i = 0; i < proxies.length; i += maxConc) {
    const batch = proxies.slice(i, i + maxConc);
    const results = await Promise.allSettled(
      batch.map(async (proxy) => {
        try {
          const r = await checkProxy(proxy, timeoutMs);
          return { proxy, ...(r || { ms: null, type: null }) };
        } catch (_) {
          return { proxy, ms: null, type: null };
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        const { proxy, ms, type } = r.value;
        if (ms !== null && ms >= minMs && ms <= maxMs) alive.push({ proxy, ms, type });
        else deadCount++;
      } else {
        deadCount++;
      }
    }
  }

  alive.sort((a, b) => a.ms - b.ms);
  return { alive, deadCount };
}

// ═══════════════════════════════════════════════════════
// VERCEL HANDLER
// ═══════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  const config = loadConfig();
  const cfg = config.checker || {};

  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = (url.searchParams.get("type") || "all").toLowerCase();
  const format = (url.searchParams.get("format") || "raw").toLowerCase();
  const limit = parseInt(url.searchParams.get("limit") || "0") || 0;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const t0 = Date.now();

  // Scrape
  const proxies = await scrapeAll();

  // Check
  const { alive, deadCount } = await checkAll(proxies, cfg);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // Filter by type
  let filtered = alive;
  if (type !== "all") {
    filtered = alive.filter((p) => p.type === type);
  }

  // Apply limit
  if (limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  // Return response
  if (format === "json") {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      total_scraped: proxies.length,
      total_alive: alive.length,
      total_dead: deadCount,
      returned: filtered.length,
      elapsed_sec: elapsed,
      type_filter: type,
      proxies: filtered.map((p) => ({
        proxy: p.proxy,
        ms: p.ms,
        type: p.type,
      })),
    });
  } else {
    // Raw format: plain text ip:port per line
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("X-Total-Scraped", proxies.length);
    res.setHeader("X-Total-Alive", alive.length);
    res.setHeader("X-Total-Dead", deadCount);
    res.setHeader("X-Returned", filtered.length);
    res.setHeader("X-Elapsed-Sec", elapsed);
    res.status(200).send(filtered.map((p) => p.proxy).join("\n") + "\n");
  }
};
