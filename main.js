#!/usr/bin/env node
/**
 * main.js -- Orchestrator: scrape, check, save, and auto-send proxies via Telegram.
 *
 * Reads settings from config.json and runs in a loop.
 * Only sends proxies with response time between min_speed_ms and max_speed_ms.
 */

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { scrapeAll } = require("./src/scraper");
const { ProxyChecker } = require("./src/checker");
const { broadcastProxyFiles } = require("./src/bot");
const { printReport } = require("./src/report");
const { loadConfig, ensureDir, getNextFilename } = require("./src/helpers");

function displayBanner() {
  console.clear();
  console.log(chalk.cyan(`
  ____  ____   _____  ____  __   __   _   _ _  _____ ____    _
 |  _ \\|  _ \\ / _ \\ \\/ /\\ \\/ /  | | | | | |  ___|  _ \\  / \\
 | |_) | |_) | | | \\  /  \\  /   | | | | | | |_  | |_) |/ _ \\
 |  __/|  _ <| |_| /  \\  /  \\   | |_| | | |  _| |  _ // ___ \\
 |_|   |_| \\_\\\\___/_/\\_\\/_/\\_\\   \\___/|_|_|_|   |_| \\_/_/   \\_\\
  `));
  console.log(
    chalk.yellow(
      "  +----------------------------------------------------------+\n" +
      "  |  Ultra-Fast Proxy Scraper + Checker + Telegram Bot v1.0  |\n" +
      "  +----------------------------------------------------------+\n"
    )
  );
}

async function runCycle(checkerConfig, loopNum) {
  const outputDir = "output";
  const proxiesDir = "proxies";
  ensureDir(outputDir);
  ensureDir(proxiesDir);

  // 1. Scrape
  const proxies = await scrapeAll();
  if (proxies.length === 0) {
    console.log(chalk.red("  [!] No proxies loaded this cycle."));
    return null;
  }

  console.log(
    chalk.green(`  [+] [Cycle ${loopNum}] ${proxies.length} unique proxies -> checking...\n`)
  );

  // 2. Check
  const checker = new ProxyChecker(checkerConfig);
  const t0 = Date.now();
  const results = await checker.run(proxies);
  const elapsed = (Date.now() - t0) / 1000;

  // 3. Print report
  printReport(results, elapsed, checkerConfig);

  // 4. Save output files
  const proxyFiles = [];
  const outFormat = checkerConfig.output_format || "ip:port";

  const formatProxy = (proxy) => {
    if (outFormat === "ip:port") return proxy;
    return `${outFormat}://${proxy}`;
  };

  // Main alive file (fast proxies only)
  const alivePath = getNextFilename(proxiesDir, "alive_proxies.txt");
  fs.writeFileSync(
    alivePath,
    results.alive.map((p) => formatProxy(p.proxy)).join("\n") + "\n"
  );
  proxyFiles.push(alivePath);

  // Per-type files
  const typeGroups = {};
  results.alive.forEach((p) => {
    if (!typeGroups[p.type]) typeGroups[p.type] = [];
    typeGroups[p.type].push(p);
  });

  for (const [type, items] of Object.entries(typeGroups)) {
    const typePath = path.join(proxiesDir, `${type}_proxies.txt`);
    fs.writeFileSync(
      typePath,
      items.map((p) => formatProxy(p.proxy)).join("\n") + "\n"
    );
    proxyFiles.push(typePath);
  }

  // Dead file
  const deadPath = path.join(outputDir, "dead_proxies.txt");
  fs.writeFileSync(deadPath, results.dead.join("\n") + "\n");

  // No-google file
  if (results.noGoogle.length > 0) {
    const ngPath = path.join(outputDir, "no_google_proxies.txt");
    fs.writeFileSync(
      ngPath,
      "# Alive but cannot reach Google\n\n" +
        results.noGoogle
          .map((p) => `${formatProxy(p.proxy)} | ${p.type} | ${p.ms}ms`)
          .join("\n") +
        "\n"
    );
    proxyFiles.push(ngPath);
  }

  // Too slow file
  if (results.tooSlow.length > 0) {
    const slowPath = path.join(outputDir, "slow_proxies.txt");
    fs.writeFileSync(
      slowPath,
      `# Proxies slower than ${checkerConfig.max_speed_ms}ms\n\n` +
        results.tooSlow
          .map((p) => `${formatProxy(p.proxy)} | ${p.type} | ${p.ms}ms`)
          .join("\n") +
        "\n"
    );
  }

  console.log(chalk.green(`  Output files saved to ${proxiesDir}/`));
  console.log(
    chalk.white(
      `     alive_proxies.txt    (${results.alive.length} fast proxies)\n` +
      Object.entries(typeGroups)
        .map(([t, items]) => `     ${t}_proxies.txt      (${items.length} proxies)`)
        .join("\n")
    )
  );

  // 5. Send via Telegram
  console.log(chalk.cyan("\n  Sending proxy files via Telegram bot..."));
  try {
    await broadcastProxyFiles(proxyFiles, {
      alive: results.alive.length,
      tooSlow: results.tooSlow.length,
      dead: results.dead.length,
      noGoogle: results.noGoogle.length,
      minMs: checkerConfig.min_speed_ms,
      maxMs: checkerConfig.max_speed_ms,
    });
    console.log(chalk.green("  [+] Telegram broadcast done.\n"));
  } catch (err) {
    console.log(chalk.yellow(`  [!] Telegram send error: ${err.message}\n`));
  }

  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  displayBanner();

  const config = loadConfig();
  const checkerConfig = config.checker || {};

  // Apply defaults
  checkerConfig.timeout_ms = checkerConfig.timeout_ms || 5000;
  checkerConfig.max_concurrent = checkerConfig.max_concurrent || 500;
  checkerConfig.min_speed_ms = checkerConfig.min_speed_ms || 5;
  checkerConfig.max_speed_ms = checkerConfig.max_speed_ms || 1000;
  checkerConfig.check_google = checkerConfig.check_google !== false;
  checkerConfig.google_timeout_ms = checkerConfig.google_timeout_ms || 8000;
  checkerConfig.proxy_types = checkerConfig.proxy_types || [
    "http",
    "socks4",
    "socks5",
  ];
  checkerConfig.output_format = checkerConfig.output_format || "ip:port";
  const refreshMinutes = checkerConfig.refresh_interval_minutes || 30;
  const autoLoop = checkerConfig.auto_loop !== false;

  console.log(chalk.yellow("  Configuration loaded from config.json:"));
  console.log(
    chalk.white(`    Types        : ${checkerConfig.proxy_types.join(", ")}`)
  );
  console.log(
    chalk.white(`    Concurrency  : ${checkerConfig.max_concurrent}`)
  );
  console.log(
    chalk.white(`    Timeout      : ${checkerConfig.timeout_ms}ms`)
  );
  console.log(
    chalk.white(
      `    Speed Filter : ${checkerConfig.min_speed_ms}ms - ${checkerConfig.max_speed_ms}ms`
    )
  );
  console.log(
    chalk.white(
      `    Google Check : ${checkerConfig.check_google ? "Yes" : "No"}`
    )
  );
  console.log(
    chalk.white(`    Output Fmt   : ${checkerConfig.output_format}`)
  );
  console.log(
    chalk.white(
      `    Auto-Loop    : ${autoLoop ? `Every ${refreshMinutes} min` : "Once"}`
    )
  );
  console.log();

  let loopNum = 1;
  let totalEver = 0;

  while (true) {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    console.log(`\n${chalk.cyan("=".repeat(65))}`);
    if (autoLoop) {
      console.log(chalk.yellow(`  CYCLE #${loopNum}  --  ${now}`));
    } else {
      console.log(chalk.yellow(`  Starting  --  ${now}`));
    }
    console.log(chalk.cyan("=".repeat(65)) + "\n");

    const results = await runCycle(checkerConfig, loopNum);
    if (results) {
      totalEver += results.alive.length;
    }

    if (!autoLoop) break;

    const waitMs = refreshMinutes * 60 * 1000;
    console.log(
      chalk.cyan(
        `\n  Next refresh in ${refreshMinutes} min  ` +
        chalk.green(`(${totalEver} total fast proxies collected)`)
      )
    );
    console.log(chalk.yellow("  Press Ctrl+C to stop.\n"));

    await sleep(waitMs);
    loopNum++;
  }

  console.log(
    chalk.green(`\n  Done! ${totalEver} total fast proxies collected.\n`)
  );
}

main().catch((err) => {
  console.error(chalk.red(`\n  Fatal error: ${err.message}\n`));
  process.exit(1);
});
