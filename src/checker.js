/**
 * checker.js -- Ultra-fast proxy checker using raw sockets + HTTP.
 *
 * Uses Node.js native net/http/https for maximum speed.
 * Checks thousands of proxies concurrently with configurable limits.
 * Filters by response time (default 5ms-1000ms = fast proxies only).
 */

const http = require("http");
const https = require("https");
const net = require("net");
const { SocksProxyAgent } = require("socks-proxy-agent");
const { HttpProxyAgent } = require("http-proxy-agent");
const { HttpsProxyAgent } = require("https-proxy-agent");
const chalk = require("chalk");
const { ensureDir } = require("./helpers");

const JUDGES = [
  "http://api.ipify.org?format=json",
  "http://checkip.amazonaws.com",
  "http://ip-api.com/json",
  "http://httpbin.org/ip",
];

const GOOGLE_TARGETS = [
  "https://www.google.com/generate_204",
  "https://www.google.com",
];

function createAgent(proxy, type) {
  const proxyUrl =
    type === "http" || type === "https"
      ? `http://${proxy}`
      : `socks${type === "socks4" ? "4" : "5"}://${proxy}`;

  if (type === "http" || type === "https") {
    return {
      httpAgent: new HttpProxyAgent(proxyUrl),
      httpsAgent: new HttpsProxyAgent(proxyUrl),
    };
  }
  const agent = new SocksProxyAgent(proxyUrl);
  return { httpAgent: agent, httpsAgent: agent };
}

function checkProxyWithJudge(proxy, type, judgeUrl, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const { httpAgent, httpsAgent } = createAgent(proxy, type);
    const isHttps = judgeUrl.startsWith("https");
    const agent = isHttps ? httpsAgent : httpAgent;
    const mod = isHttps ? https : http;

    const req = mod.get(judgeUrl, { agent, timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const ms = Date.now() - start;
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve(ms);
        } else {
          resolve(null);
        }
      });
    });

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });

    setTimeout(() => {
      req.destroy();
      resolve(null);
    }, timeoutMs + 500);
  });
}

function checkGoogle(proxy, type, timeoutMs) {
  return new Promise(async (resolve) => {
    for (const target of GOOGLE_TARGETS) {
      const start = Date.now();
      const { httpAgent, httpsAgent } = createAgent(proxy, type);
      const isHttps = target.startsWith("https");
      const agent = isHttps ? httpsAgent : httpAgent;
      const mod = isHttps ? https : http;

      try {
        const ms = await new Promise((res) => {
          const req = mod.get(target, { agent, timeout: timeoutMs }, (response) => {
            let d = "";
            response.on("data", (chunk) => (d += chunk));
            response.on("end", () => {
              const elapsed = Date.now() - start;
              if (
                response.statusCode === 200 ||
                response.statusCode === 204 ||
                response.statusCode === 301 ||
                response.statusCode === 302
              ) {
                res(elapsed);
              } else {
                res(null);
              }
            });
          });

          req.on("error", () => res(null));
          req.on("timeout", () => {
            req.destroy();
            res(null);
          });

          setTimeout(() => {
            req.destroy();
            res(null);
          }, timeoutMs + 500);
        });

        if (ms !== null) {
          resolve(ms);
          return;
        }
      } catch (_) {
        continue;
      }
    }
    resolve(null);
  });
}

class ProxyChecker {
  constructor(config = {}) {
    this.timeoutMs = config.timeout_ms || 5000;
    this.maxConcurrent = config.max_concurrent || 500;
    this.minSpeedMs = config.min_speed_ms || 5;
    this.maxSpeedMs = config.max_speed_ms || 1000;
    this.checkGoogleEnabled = config.check_google !== false;
    this.googleTimeoutMs = config.google_timeout_ms || 8000;
    this.proxyTypes = config.proxy_types || ["http", "socks4", "socks5"];

    this.alive = [];
    this.dead = [];
    this.noGoogle = [];
    this.tooSlow = [];
    this.checked = 0;
    this.total = 0;
    this.startTime = 0;
  }

  async checkOne(proxy) {
    let aliveMs = null;
    let aliveType = null;

    const judgeIdx = this.checked % JUDGES.length;
    const judge = JUDGES[judgeIdx];

    for (const type of this.proxyTypes) {
      const ms = await checkProxyWithJudge(proxy, type, judge, this.timeoutMs);
      if (ms !== null) {
        aliveMs = ms;
        aliveType = type;
        break;
      }
    }

    let googleMs = null;
    if (aliveMs !== null && this.checkGoogleEnabled) {
      googleMs = await checkGoogle(proxy, aliveType, this.googleTimeoutMs);
    }

    this.checked++;
    const done = this.checked;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const speed = elapsed > 0 ? (done / elapsed).toFixed(0) : 0;
    const pct = this.total > 0 ? ((done / this.total) * 100).toFixed(1) : 0;

    if (aliveMs === null) {
      this.dead.push(proxy);
    } else if (aliveMs < this.minSpeedMs || aliveMs > this.maxSpeedMs) {
      this.tooSlow.push({ proxy, type: aliveType, ms: aliveMs });
    } else if (this.checkGoogleEnabled && googleMs === null) {
      this.noGoogle.push({ proxy, type: aliveType, ms: aliveMs });
    } else {
      this.alive.push({
        proxy,
        type: aliveType,
        ms: aliveMs,
        googleMs: googleMs || 0,
      });
    }

    const barWidth = 30;
    const filled = Math.floor((barWidth * done) / (this.total || 1));
    const bar =
      chalk.green("#".repeat(filled)) +
      chalk.white(".".repeat(barWidth - filled));

    let status;
    if (aliveMs === null) {
      status = chalk.red("DEAD");
    } else if (aliveMs > this.maxSpeedMs) {
      status = chalk.yellow(`SLOW ${aliveMs}ms`);
    } else {
      const color = aliveMs < 500 ? chalk.green : chalk.yellow;
      const gStr = googleMs ? chalk.cyan(` G:${googleMs}ms`) : "";
      status = chalk.green(`OK ${aliveType.toUpperCase()} `) + color(`${aliveMs}ms`) + gStr;
    }

    process.stdout.write(
      `\r  [${bar}] ${pct}%  ${chalk.cyan(`${done}/${this.total}`)}  ` +
        `${chalk.yellow(`${speed}/s`)}  ${proxy.padEnd(22)}  ${status}          `
    );

    return { proxy, type: aliveType, ms: aliveMs, googleMs };
  }

  async run(proxies) {
    this.total = proxies.length;
    this.startTime = Date.now();
    this.alive = [];
    this.dead = [];
    this.noGoogle = [];
    this.tooSlow = [];
    this.checked = 0;

    // Process in batches for max throughput
    const batchSize = this.maxConcurrent;
    for (let i = 0; i < proxies.length; i += batchSize) {
      const batch = proxies.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((p) => this.checkOne(p)));
    }

    // Sort alive by speed (fastest first)
    this.alive.sort((a, b) => a.ms - b.ms);

    console.log(""); // newline after progress bar
    return {
      alive: this.alive,
      dead: this.dead,
      noGoogle: this.noGoogle,
      tooSlow: this.tooSlow,
    };
  }
}

module.exports = { ProxyChecker };
