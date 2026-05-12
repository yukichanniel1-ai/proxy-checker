/**
 * scraper.js -- Fetch proxies from all configured online sources.
 * Ultra-fast: all sources fetched in parallel.
 */

const axios = require("axios");
const chalk = require("chalk");
const { PROXY_SOURCES } = require("./sources");
const { validateProxy, extractIps } = require("./helpers");

async function fetchSource(source) {
  const proxies = [];
  try {
    const resp = await axios.get(source.url, {
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/plain,text/html,application/json,*/*",
      },
      validateStatus: () => true,
    });

    if (resp.status !== 200) return proxies;
    const { fmt } = source;

    if (fmt === "plain" || fmt === "scrape") {
      const text = typeof resp.data === "string" ? resp.data : String(resp.data);
      for (const candidate of extractIps(text)) {
        proxies.push(candidate);
      }
    } else if (fmt === "geonode") {
      const data = resp.data;
      const items = (data && data.data) || [];
      for (const item of items) {
        const ip = item.ip || "";
        const port = item.port || "";
        if (ip && port) {
          const candidate = `${ip}:${port}`;
          if (validateProxy(candidate)) proxies.push(candidate);
        }
      }
    } else if (fmt === "redscrape") {
      const data = resp.data;
      const items = Array.isArray(data)
        ? data
        : data.proxies || data.data || [];
      for (const item of items) {
        const ip = item.ip || "";
        const port = item.port || "";
        if (ip && port) {
          const candidate = `${ip}:${port}`;
          if (validateProxy(candidate)) proxies.push(candidate);
        }
      }
    }
  } catch (_) {
    // silently skip failed sources
  }
  return proxies;
}

async function scrapeAll(selectedSources) {
  const sources = selectedSources || PROXY_SOURCES;
  console.log(chalk.cyan(`\n  Grabbing from ${sources.length} source(s)...\n`));

  const results = await Promise.allSettled(
    sources.map((src) => fetchSource(src))
  );

  const seen = new Set();
  const allProxies = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const result = results[i];
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      const fresh = result.value.filter((p) => !seen.has(p));
      fresh.forEach((p) => seen.add(p));
      allProxies.push(...fresh);
      const status = fresh.length > 0
        ? chalk.green(`+${fresh.length}`)
        : chalk.red("0");
      console.log(`  ${src.name.padEnd(28)} ${status} proxies`);
    } else {
      console.log(`  ${src.name.padEnd(28)} ${chalk.red("FAILED")}`);
    }
  }

  console.log(chalk.green(`\n  [+] Total unique grabbed: ${allProxies.length}\n`));
  return allProxies;
}

// Allow standalone run
if (require.main === module) {
  scrapeAll().then((proxies) => {
    console.log(`Scraped ${proxies.length} proxies.`);
  });
}

module.exports = { scrapeAll, fetchSource };
