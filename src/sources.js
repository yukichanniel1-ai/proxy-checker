/**
 * sources.js -- All proxy source URLs (auto-refreshed APIs & lists).
 */

const PROXY_SOURCES = [
  // -- ProxyScrape -- every 5 minutes
  {
    name: "ProxyScrape HTTP",
    url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all",
    fmt: "plain",
    type: "http",
  },
  {
    name: "ProxyScrape SOCKS4",
    url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all",
    fmt: "plain",
    type: "socks4",
  },
  {
    name: "ProxyScrape SOCKS5",
    url: "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all",
    fmt: "plain",
    type: "socks5",
  },

  // -- Proxifly CDN -- every 5 minutes
  {
    name: "Proxifly ALL",
    url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.txt",
    fmt: "plain",
    type: "mixed",
  },
  {
    name: "Proxifly HTTP",
    url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt",
    fmt: "plain",
    type: "http",
  },
  {
    name: "Proxifly SOCKS4",
    url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks4/data.txt",
    fmt: "plain",
    type: "socks4",
  },
  {
    name: "Proxifly SOCKS5",
    url: "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt",
    fmt: "plain",
    type: "socks5",
  },

  // -- iplocate -- every 30 minutes
  {
    name: "iplocate HTTP",
    url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/http.txt",
    fmt: "plain",
    type: "http",
  },
  {
    name: "iplocate SOCKS4",
    url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks4.txt",
    fmt: "plain",
    type: "socks4",
  },
  {
    name: "iplocate SOCKS5",
    url: "https://raw.githubusercontent.com/iplocate/free-proxy-list/main/proxies/socks5.txt",
    fmt: "plain",
    type: "socks5",
  },

  // -- free-proxy-list.net -- every 30 minutes
  {
    name: "free-proxy-list.net",
    url: "https://free-proxy-list.net/",
    fmt: "scrape",
    type: "http",
  },

  // -- litport.net -- every 3 minutes
  {
    name: "litport HTTP",
    url: "https://litport.net/free-proxy/http.txt",
    fmt: "plain",
    type: "http",
  },
  {
    name: "litport SOCKS5",
    url: "https://litport.net/free-proxy/socks5.txt",
    fmt: "plain",
    type: "socks5",
  },

  // -- redscrape.com JSON API -- every 10 minutes
  {
    name: "redscrape API",
    url: "https://free.redscrape.com/api/proxies",
    fmt: "redscrape",
    type: "mixed",
  },

  // -- pubproxy.com API -- live
  {
    name: "pubproxy HTTP",
    url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=http",
    fmt: "plain",
    type: "http",
  },
  {
    name: "pubproxy SOCKS5",
    url: "http://pubproxy.com/api/proxy?limit=20&format=txt&type=socks5",
    fmt: "plain",
    type: "socks5",
  },

  // -- GeoNode JSON API -- live checked
  {
    name: "GeoNode p1",
    url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc",
    fmt: "geonode",
    type: "mixed",
  },
  {
    name: "GeoNode p2",
    url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=2&sort_by=lastChecked&sort_type=desc",
    fmt: "geonode",
    type: "mixed",
  },
  {
    name: "GeoNode p3",
    url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=3&sort_by=lastChecked&sort_type=desc",
    fmt: "geonode",
    type: "mixed",
  },
];

module.exports = { PROXY_SOURCES };
