// =============================================================================
//  Tsahilgaan File Storage Service
//  - Standalone Node/Express service, runs on the internal Windows Server.
//  - Stores uploaded photos/documents to local disk (large capacity, cheap).
//  - Only reachable via: (1) local network, or (2) Tailscale Funnel HTTPS URL.
//  - Auth: shared API key header (server-to-server only, called by Render app).
// =============================================================================
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILES_DIR = process.env.FILES_DIR || path.join(__dirname, 'files');
const API_KEY = process.env.FILE_API_KEY || '';
const PORT = process.env.FILE_PORT || 8081;

fs.mkdirSync(FILES_DIR, { recursive: true });

if (!API_KEY) {
  console.error('FILE_API_KEY тохируулагдаагүй байна — үйлчилгээ ажиллахгүй.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '15mb' }));

function checkKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) return res.status(403).json({ error: 'Forbidden' });
  next();
}

function metaPath(id) { return path.join(FILES_DIR, id + '.meta.json'); }
function dataPath(id) { return path.join(FILES_DIR, id + '.bin'); }
function safeId(id) { return /^[a-f0-9-]{36}$/.test(id); }

app.get('/health', (_req, res) => {
  let count = 0;
  try { count = fs.readdirSync(FILES_DIR).filter(f => f.endsWith('.bin')).length; } catch { /* ignore */ }
  res.json({ ok: true, filesCount: count, uptime: process.uptime() });
});

// Хадгалах: { name, type, dataBase64 }
app.post('/store', checkKey, (req, res) => {
  const { name, type, dataBase64 } = req.body || {};
  if (!dataBase64) return res.status(400).json({ error: 'dataBase64 шаардлагатай' });
  let buf;
  try { buf = Buffer.from(dataBase64, 'base64'); } catch { return res.status(400).json({ error: 'base64 буруу' }); }
  if (buf.length > 12 * 1024 * 1024) return res.status(413).json({ error: 'Файл хэт том (>12MB)' });
  const id = crypto.randomUUID();
  try {
    fs.writeFileSync(dataPath(id), buf);
    fs.writeFileSync(metaPath(id), JSON.stringify({ name: name || 'file', type: type || 'application/octet-stream', size: buf.length, uploadedAt: new Date().toISOString() }));
  } catch (e) {
    return res.status(500).json({ error: 'Хадгалахад алдаа: ' + String(e && e.message || e) });
  }
  res.status(201).json({ id });
});

// Уншуулах
app.get('/file/:id', checkKey, (req, res) => {
  const id = req.params.id;
  if (!safeId(id)) return res.status(400).json({ error: 'ID буруу' });
  if (!fs.existsSync(dataPath(id))) return res.status(404).json({ error: 'Олдсонгүй' });
  let meta = { type: 'application/octet-stream', name: 'file' };
  try { meta = JSON.parse(fs.readFileSync(metaPath(id), 'utf8')); } catch { /* ignore */ }
  res.setHeader('Content-Type', meta.type || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(meta.name || 'file') + '"');
  fs.createReadStream(dataPath(id)).pipe(res);
});

// Устгах (цэвэрлэгээ/сонголт)
app.delete('/file/:id', checkKey, (req, res) => {
  const id = req.params.id;
  if (!safeId(id)) return res.status(400).json({ error: 'ID буруу' });
  try { fs.unlinkSync(dataPath(id)); } catch { /* ignore */ }
  try { fs.unlinkSync(metaPath(id)); } catch { /* ignore */ }
  res.json({ ok: true });
});

app.listen(PORT, () => console.log('Файл хадгалах үйлчилгээ ажиллаж байна: http://localhost:' + PORT));
