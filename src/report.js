/**
 * report.js -- Print formatted reports after proxy checking.
 */

const chalk = require("chalk");

function printReport(results, elapsedSec, config = {}) {
  const { alive, dead, noGoogle, tooSlow } = results;
  const total = alive.length + dead.length + noGoogle.length + tooSlow.length;
  const pctOk = total ? ((alive.length / total) * 100).toFixed(1) : 0;
  const pctDead = total ? ((dead.length / total) * 100).toFixed(1) : 0;
  const pctNG = total ? ((noGoogle.length / total) * 100).toFixed(1) : 0;
  const pctSlow = total ? ((tooSlow.length / total) * 100).toFixed(1) : 0;

  const msVals = alive.map((p) => p.ms);
  const fastest = msVals.length ? Math.min(...msVals) : 0;
  const slowest = msVals.length ? Math.max(...msVals) : 0;
  const avgMs = msVals.length
    ? (msVals.reduce((a, b) => a + b, 0) / msVals.length).toFixed(0)
    : 0;

  const gVals = alive.filter((p) => p.googleMs > 0).map((p) => p.googleMs);
  const avgG = gVals.length
    ? (gVals.reduce((a, b) => a + b, 0) / gVals.length).toFixed(0)
    : 0;

  console.log(`\n${chalk.cyan("=".repeat(65))}`);
  console.log(chalk.yellow("                  FINAL REPORT"));
  console.log(chalk.cyan("=".repeat(65)));
  console.log(
    `\n  ${chalk.white("Total Checked")}          : ${chalk.cyan(total)}` +
    `\n  ${chalk.green("Alive + Fast")}           : ${alive.length}  (${pctOk}%)` +
    `\n  ${chalk.yellow("Too Slow (filtered)")}    : ${tooSlow.length}  (${pctSlow}%)` +
    `\n  ${chalk.yellow("Alive / No Google")}      : ${noGoogle.length}  (${pctNG}%)` +
    `\n  ${chalk.red("Dead")}                   : ${dead.length}  (${pctDead}%)` +
    `\n  ${chalk.yellow("Time")}                   : ${elapsedSec.toFixed(1)}s` +
    `\n  ${chalk.cyan("Speed")}                  : ${(total / elapsedSec).toFixed(1)} proxies/sec\n`
  );

  if (alive.length > 0) {
    const fastCount = alive.filter((p) => p.ms < 500).length;
    const midCount = alive.filter((p) => p.ms >= 500 && p.ms < 1000).length;

    console.log(chalk.magenta("  Speed Breakdown:"));
    console.log(chalk.green(`     < 500ms    : ${fastCount}`));
    console.log(chalk.yellow(`     500-999ms  : ${midCount}`));
    console.log(
      `\n     Fastest : ${chalk.green(`${fastest}ms`)}  ` +
      `Avg : ${chalk.yellow(`${avgMs}ms`)}  ` +
      `Slowest : ${chalk.red(`${slowest}ms`)}`
    );
    if (avgG > 0) {
      console.log(chalk.cyan(`     Avg Google Latency : ${avgG}ms`));
    }

    // Type breakdown
    const typeCounts = {};
    alive.forEach((p) => {
      typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
    });
    console.log(chalk.cyan("\n  Type Breakdown:"));
    Object.keys(typeCounts)
      .sort()
      .forEach((type) => {
        const cnt = typeCounts[type];
        const bar = "#".repeat(Math.min(cnt, 40));
        console.log(`     ${type.padEnd(8)} : ${String(cnt).padStart(4)}  ${chalk.blue(bar)}`);
      });

    // Top 10
    console.log(chalk.green("\n  Top 10 Fastest:"));
    alive.slice(0, 10).forEach((p, i) => {
      const color = p.ms < 500 ? chalk.green : chalk.yellow;
      const gStr = p.googleMs > 0 ? chalk.cyan(` G:${p.googleMs}ms`) : "";
      console.log(
        `     ${String(i + 1).padStart(2)}. ${p.proxy.padEnd(22)} ` +
        `${chalk.cyan(p.type.padEnd(8))}${color(`${p.ms}ms`)}${gStr}`
      );
    });
  }

  console.log(`\n${chalk.cyan("=".repeat(65))}\n`);
}

module.exports = { printReport };
