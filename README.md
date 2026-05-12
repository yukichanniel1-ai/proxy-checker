# Proxy Checker + Telegram Bot (Node.js)

Ultra-fast Node.js proxy scraper and checker with Telegram bot auto-send. Checks thousands of proxies in seconds.

## Features

- **Ultra-fast checking** -- Node.js async I/O checks 500+ proxies concurrently, thousands in seconds
- **Speed filter** -- only keeps proxies between 5ms-1000ms (configurable)
- **Multi-source scraper** -- 20+ auto-updating free proxy sources (ProxyScrape, Proxifly, GeoNode, iplocate, pubproxy, litport, redscrape, free-proxy-list.net)
- **HTTP / HTTPS / SOCKS4 / SOCKS5** support
- **Per-type output** -- separate files for each proxy type
- **Telegram bot** -- auto-sends proxy files to configured chat IDs
- **Auto-loop** -- refreshes and re-checks on a configurable interval
- **config.json** -- bot token, chat IDs, and all settings in one file
- **Multiple files** -- organized into separate modules for easy multi-bot use

## Project Structure

```
proxy-checker/
|-- config.json          # Bot token, chat IDs, checker settings
|-- main.js              # Entry point / orchestrator
|-- src/
|   |-- scraper.js       # Scrapes proxies from online sources
|   |-- checker.js       # Ultra-fast proxy checker (judge + Google test)
|   |-- bot.js           # Telegram bot (auto-send files)
|   |-- sources.js       # All proxy source URLs
|   |-- helpers.js       # Shared utilities
|   |-- report.js        # Formatted report printer
|-- package.json
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure `config.json`

Edit `config.json` with your Telegram bot token and chat IDs:

```json
{
    "telegram_bot_token": "123456:ABC-DEF...",
    "chat_ids": [
        "123456789",
        "-1001234567890"
    ],
    "checker": {
        "timeout_ms": 5000,
        "max_concurrent": 500,
        "min_speed_ms": 5,
        "max_speed_ms": 1000,
        "check_google": true,
        "google_timeout_ms": 8000,
        "proxy_types": ["http", "socks4", "socks5"],
        "output_format": "ip:port",
        "refresh_interval_minutes": 30,
        "auto_loop": true
    }
}
```

**How to get your bot token:**
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the token into `config.json`

**How to get chat IDs:**
1. Message [@userinfobot](https://t.me/userinfobot) to get your personal chat ID
2. For groups: add the bot to the group, then use `https://api.telegram.org/bot<TOKEN>/getUpdates` to find the group chat ID

### 3. Run

```bash
# Run everything (scrape + check + send)
npm start

# Or run individual modules
node src/scraper.js    # just scrape
```

## How it works

1. Scrapes proxies from 20+ free auto-updating APIs (all fetched in parallel)
2. Checks each proxy against judge servers + Google reachability
3. Filters out proxies slower than 1000ms (only keeps fast ones: 5ms-1000ms)
4. Saves per-type files (http_proxies.txt, socks4_proxies.txt, socks5_proxies.txt)
5. Auto-sends all proxy files to Telegram chat IDs from config.json
6. Waits and repeats (if auto_loop is enabled)

## Output Files

- `proxies/alive_proxies_N.txt` -- all fast proxies (5ms-1000ms, Google OK)
- `proxies/http_proxies.txt` -- HTTP proxies only
- `proxies/socks4_proxies.txt` -- SOCKS4 proxies only
- `proxies/socks5_proxies.txt` -- SOCKS5 proxies only
- `output/dead_proxies.txt` -- dead proxies
- `output/no_google_proxies.txt` -- alive but Google-blocked
- `output/slow_proxies.txt` -- alive but too slow (>1000ms)

## Config Options

| Key | Default | Description |
|-----|---------|-------------|
| `telegram_bot_token` | `""` | Telegram bot API token |
| `chat_ids` | `[]` | List of Telegram chat IDs to send files to |
| `timeout_ms` | `5000` | Proxy check timeout in milliseconds |
| `max_concurrent` | `500` | Max concurrent proxy checks (higher = faster) |
| `min_speed_ms` | `5` | Minimum response time to accept |
| `max_speed_ms` | `1000` | Maximum response time to accept (filters slow proxies) |
| `check_google` | `true` | Test Google reachability |
| `google_timeout_ms` | `8000` | Google check timeout |
| `proxy_types` | `["http","socks4","socks5"]` | Types to check |
| `output_format` | `"ip:port"` | Output format (`"ip:port"`, `"http"`, `"socks5"`, etc.) |
| `refresh_interval_minutes` | `30` | Minutes between auto-refresh cycles |
| `auto_loop` | `true` | Enable continuous scraping loop |

## Using for Multiple Bots

Each module (`src/scraper.js`, `src/checker.js`, `src/bot.js`) can be imported independently:

```javascript
const { scrapeAll } = require("./src/scraper");
const { ProxyChecker } = require("./src/checker");
const { broadcastProxyFiles } = require("./src/bot");

// Scrape
const proxies = await scrapeAll();

// Check with custom config
const checker = new ProxyChecker({ max_concurrent: 1000, max_speed_ms: 500 });
const results = await checker.run(proxies);

// Send to Telegram
await broadcastProxyFiles(["proxies/alive_proxies_1.txt"], {
  alive: results.alive.length,
  dead: results.dead.length,
});
```
