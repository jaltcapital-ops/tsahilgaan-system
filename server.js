// =============================================================================
//  Цахилгааны нэгж — Render дамжуулагч (reverse proxy)
//  - Энэ сервер өөрөө өгөгдөл хадгалдаггүй, БИЗНЕС ЛОГИК агуулдаггүй.
//  - Бүх хүсэлтийг дотоод серверт (Tailscale Funnel URL) шууд дамжуулна.
//  - Цорын ганц эх сурвалж (single source of truth) нь дотоод сервер (192.168.80.66).
// =============================================================================
import express from 'express';
import { Readable } from 'node:stream';

const app = express();
app.disable('x-powered-by');

const TARGET = (process.env.INTERNAL_APP_URL || 'https://tsahilgaan-server.tail5d51d4.ts.net').replace(/\/$/, '');
const PORT = process.env.PORT || 4000;

// Дамжуулахад ашиглахгүй/зөрчилддөг header-үүд
const STRIP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length']);
const STRIP_RESPONSE_HEADERS = new Set(['content-encoding', 'transfer-encoding', 'connection']);

app.use(async (req, res) => {
  const url = TARGET + req.originalUrl;
  try {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!STRIP_REQUEST_HEADERS.has(k.toLowerCase()) && v !== undefined) headers[k] = v;
    }
    // Дотоод сервер рүү яг ямар host-руу хандаж байгааг тодорхой болгох (Funnel-д шаардлагагүй ч илүү аюулгүй)
    headers['x-forwarded-host'] = req.headers.host || '';
    headers['x-forwarded-proto'] = 'https';

    const init = { method: req.method, headers, redirect: 'manual' };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = req; // Node.js Readable stream (Express req)
      init.duplex = 'half';
    }

    const upstream = await fetch(url, init);

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) res.setHeader(key, value);
    });

    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch (e) {
    console.error('Proxy алдаа:', url, e && e.message || e);
    res.status(502).json({ error: 'Дотоод серверт холбогдож чадсангүй. Дахин оролдоно уу.' });
  }
});

app.listen(PORT, () => console.log('Дамжуулагч (proxy) ажиллаж байна, зорилтот сервер: ' + TARGET + ' (:' + PORT + ')'));
