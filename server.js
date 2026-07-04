// =============================================================================
//  Цахилгааны нэгж — Render дамжуулагч (reverse proxy)
//  - Энэ сервер өөрөө өгөгдөл хадгалдаггүй, БИЗНЕС ЛОГИК агуулдаггүй.
//  - Бүх хүсэлтийг дотоод серверт (Tailscale Funnel URL) шууд дамжуулна.
//  - Цорын ганц эх сурвалж (single source of truth) нь дотоод сервер (192.168.80.66).
//
//  САНАМЖ (гүйцэтгэлийн засвар): Render-ийн дотоод K8s DNS тохиргоо (resolv.conf
//  дахь "options ndots:5") нь цөөн цэгтэй гадаад хостыг (жишээ нь *.ts.net,
//  3 цэгтэй) эхлээд дотоод "search" домэйнтэй нийлүүлж шалгадаг тул Node.js-ийн
//  fetch/https.request маш удаан (заримдаа бүр зогсдог) байсан — curl бол
//  үүнээс өөр замаар шийддэг тул хурдан ажилладаг байсан. Үүнийг засахын тулд
//  DNS lookup хийхдээ хостын нэрний төгсгөлд цэг нэмж (жишээ: "...ts.net.")
//  бүрэн тодорхойлогдсон нэр (FQDN) болгож дамжуулснаар "search" домэйн
//  залгалтыг алгасаж, шууд шийддэг болгосон. TLS/Host header-т энгийн нэрийг
//  л ашиглана — зөвхөн DNS шийдвэрлэлтэд FQDN хэрэглэнэ.
// =============================================================================
import express from 'express';
import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';
import { URL } from 'node:url';

const app = express();
app.disable('x-powered-by');

const TARGET = new URL((process.env.INTERNAL_APP_URL || 'https://tsahilgaan-server.tail5d51d4.ts.net'));
const PORT = process.env.PORT || 4000;
const isHttps = TARGET.protocol === 'https:';
const client = isHttps ? https : http;

// ndots-с үүдэлтэй удаашралаас зайлсхийх: DNS lookup хийхдээ FQDN (цэгээр төгссөн) ашиглана.
function fastLookup(hostname, options, callback) {
  const fqdn = hostname.endsWith('.') ? hostname : hostname + '.';
  return dns.lookup(fqdn, options, callback);
}

// Холболтыг дахин ашиглаж (keep-alive) хурдасгана — Funnel-ээр дамжих тутам шинэ TLS
// холболт нээхгүй байх нь чухал.
const agent = new client.Agent({ keepAlive: true, maxSockets: 64, lookup: fastLookup });

const STRIP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length']);
const STRIP_RESPONSE_HEADERS = new Set(['transfer-encoding', 'connection']);

app.use((req, res) => {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!STRIP_REQUEST_HEADERS.has(k.toLowerCase()) && v !== undefined) headers[k] = v;
  }
  headers['host'] = TARGET.host;

  const options = {
    protocol: TARGET.protocol,
    hostname: TARGET.hostname,
    port: TARGET.port || (isHttps ? 443 : 80),
    path: req.originalUrl,
    method: req.method,
    headers,
    agent,
    lookup: fastLookup,
  };

  const proxyReq = client.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (!STRIP_RESPONSE_HEADERS.has(k.toLowerCase())) res.setHeader(k, v);
    }
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error('Proxy алдаа:', e && e.message || e);
    if (!res.headersSent) res.status(502).json({ error: 'Дотоод серверт холбогдож чадсангүй. Дахин оролдоно уу.' });
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
});

app.listen(PORT, () => console.log('Дамжуулагч (proxy) ажиллаж байна, зорилтот сервер: ' + TARGET.origin + ' (:' + PORT + ')'));
