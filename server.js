// =============================================================================
//  Цахилгааны нэгж — дундын олон хэрэглэгчтэй сервер
//  - Express, гадны хамаарал бараг байхгүй (зөвхөн express)
//  - Нэвтрэлт: scrypt hash (Node built-in crypto), HMAC token
//  - Дундын мэдээлэл: data.json файлд хадгална (бүх хэрэглэгч нэг өгөгдөл)
//  - Админ хэрэглэгч нэмж/хасна
//  - Telegram мэдэгдэл (сонголтоор)
// =============================================================================
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const SECRET = process.env.SECRET || 'tsahilgaan-secret-CHANGE-ME';
const PORT = process.env.PORT || 4000;

/* ---------- Нууц үг (scrypt) ---------- */
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 32).toString('hex');
  return salt + ':' + h;
}
function checkPw(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(h));
}

/* ---------- Token (HMAC) ---------- */
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const exp = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (exp !== sig) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}

/* ---------- Тоног төхөөрөмжийн каталог (схемээс) ---------- */
function loadCatalog() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(__dirname, 'equipment.json'), 'utf8'));
    if (Array.isArray(c) && c.length) return c;
  } catch { /* fallback below */ }
  return [
    { tag: 'PP3284', name: 'PP3284 хөдөлгүүр', area: 'Үйлдвэрийн 2-р шугам', cat: 'Хөдөлгүүр', crit: 'Өндөр' },
    { tag: 'PP3184', name: 'PP3184 хөдөлгүүр', area: 'Үйлдвэрийн 1-р шугам', cat: 'Хөдөлгүүр', crit: 'Дунд' }
  ];
}

/* ---------- Анхны өгөгдөл ---------- */
function seedAppData() {
  return {
    equip: loadCatalog(),
    areas: ['Үйлдвэрийн 1-р шугам', 'Үйлдвэрийн 2-р шугам', 'Дэд станц', '11PD', '12PD', '21PD', '31PD', '32PD'],
    types: ['Төлөвлөгөөт', 'Төлөвлөгөөт бус', 'PM', 'CM', 'Шуурхай дуудлага', 'АМХ'],
    engineers: ['Батмандах БАТДАВАА', 'Доржсүрэн ЭРХЭМБАЯР', 'Техникч Бат'],
    isoPersons: ['Батмандах БАТДАВАА', 'Доржсүрэн ЭРХЭМБАЯР'],
    reports: [
      { id: 1, date: '2026-06-01', shift: 'Г', dn: 'Өдөр', head: 3, lines: 2, notes: 'Ердийн ажил.' },
      { id: 2, date: '2026-06-01', shift: 'Б', dn: 'Шөнө', head: 3, lines: 2, notes: '23:45-д тэжээл өгсөн.' }
    ],
    wos: [
      { id: 1, no: 'WO260528007', reportId: 1, date: '2026-06-01', equip: 'PP3184', area: 'Үйлдвэрийн 1-р шугам', type: 'Төлөвлөгөөт', prio: 'Дунд', status: 'Дууссан', desc: 'PP3184 хөдөлгүүрт үзлэг, хэмжилт хийсэн.', fault: false, root: '', action: 'Тоосжилт цэвэрлэсэн.', start: '2026-06-01T09:00', finish: '2026-06-01T10:30', down: 90, eng: 'Батмандах БАТДАВАА' },
      { id: 2, no: 'WO260601004', reportId: 1, date: '2026-06-01', equip: 'PP3284', area: 'Үйлдвэрийн 2-р шугам', type: 'Төлөвлөгөөт бус', prio: 'Өндөр', status: 'Дууссан', desc: 'PP3284 хөдөлгүүрийн борно унтарсан тул шинээр тавьсан.', fault: true, root: 'Кабелийн холболт сулрсан.', action: 'Шинэ кабель татсан.', start: '2026-06-01T14:00', finish: '2026-06-01T16:00', down: 120, eng: 'Батмандах БАТДАВАА' },
      { id: 3, no: 'WO260601009', reportId: 2, date: '2026-06-01', equip: 'TR-01', area: 'Дэд станц', type: 'Шуурхай дуудлага', prio: 'Эгзэгтэй', status: 'Нээлттэй', desc: 'TR-01 трансформаторын хамгаалалт ажилласан, шалгаж байна.', fault: true, root: '', action: '', start: '2026-06-01T23:10', finish: '', down: null, eng: 'Доржсүрэн ЭРХЭМБАЯР' }
    ],
    isolations: [
      { id: 1, date: '2026-06-01', shift: 'Өдөр', type: 'Стандарт', equip: 'PP3184', pd: 'PD-0601-1', by: 'Батмандах БАТДАВАА', status: 'Сэргээсэн', note: 'Үзлэгийн өмнө.' },
      { id: 2, date: '2026-06-01', shift: 'Өдөр', type: 'Стандарт', equip: 'PP3284', pd: 'PD-0601-2', by: 'Батмандах БАТДАВАА', status: 'Сэргээсэн', note: 'Кабель солихын өмнө.' },
      { id: 3, date: '2026-06-01', shift: 'Шөнө', type: 'Групп', equip: 'TR-01', pd: 'PD-0601-3', by: 'Доржсүрэн ЭРХЭМБАЯР', status: 'Шилжүүлсэн', note: 'Шөнө→өдөр шилжүүлсэн.' }
    ],
    energy: [
      { id: 1, date: '2026-06-01', shift: 'Өдөр', feed: 16722.80, energy: 106800, tezu: '' },
      { id: 2, date: '2026-06-01', shift: 'Шөнө', feed: 15558.80, energy: 111840, tezu: '' }
    ],
    seq: { report: 2, wo: 3, iso: 3, energy: 2 }
  };
}
function seedDB() {
  return {
    users: [
      { id: 1, username: 'admin', name: 'Систем Админ', role: 'ADMIN', pw: hashPw('admin123') },
      { id: 2, username: 'chief', name: 'Доржсүрэн ЭРХЭМБАЯР', role: 'CHIEF', pw: hashPw('password') },
      { id: 3, username: 'master', name: 'Батмандах БАТДАВАА', role: 'EE', pw: hashPw('password') }
    ],
    userSeq: 3,
    app: seedAppData()
  };
}

/* ---------- Өгөгдөл унших/хадгалах ---------- */
let DB;
function load() {
  if (!fs.existsSync(DATA_FILE)) { DB = seedDB(); persist(); return; }
  try { DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { DB = seedDB(); persist(); }
  if (!DB.app) DB.app = seedAppData();
  if (!DB.users) { DB.users = seedDB().users; DB.userSeq = 3; }
}
let saveTimer = null;
function persist() { fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2)); }
function persistDebounced() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 200); }
load();

/* ---------- Telegram мэдэгдэл (сонголтоор) ---------- */
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { ok: false, skipped: true };
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text })
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

/* ---------- App ---------- */
const app = express();
app.use(express.json({ limit: '10mb' }));

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const u = verify(h.startsWith('Bearer ') ? h.slice(7) : null);
  if (!u) return res.status(401).json({ error: 'Нэвтрэх шаардлагатай' });
  req.user = u; next();
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Зөвхөн админ' });
  next();
}
const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role });

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = DB.users.find(x => x.username === username);
  if (!u || !checkPw(password || '', u.pw)) return res.status(401).json({ error: 'Нэр эсвэл нууц үг буруу' });
  res.json({ token: sign({ id: u.id, username: u.username, name: u.name, role: u.role }), user: publicUser(u) });
});
app.get('/api/me', auth, (req, res) => res.json(req.user));

// Дундын мэдээлэл
app.get('/api/data', auth, (_req, res) => res.json(DB.app));
app.put('/api/data', auth, (req, res) => {
  if (req.user.role === 'VIEWER') return res.status(403).json({ error: 'Үзэгч засах эрхгүй' });
  DB.app = req.body; persistDebounced();
  res.json({ ok: true });
});

// Telegram мэдэгдэл — чухал гэмтэл, хугацаа хэтэрсэн ажил
app.post('/api/notify', auth, async (req, res) => {
  const text = (req.body && req.body.text) || '';
  if (!text) return res.json({ ok: false, error: 'Текст алга' });
  const r = await sendTelegram(text);
  res.json(r);
});

// Хэрэглэгчийн удирдлага (зөвхөн админ)
app.get('/api/users', auth, adminOnly, (_req, res) => res.json(DB.users.map(publicUser)));
app.post('/api/users', auth, adminOnly, (req, res) => {
  const { username, name, password, role } = req.body || {};
  if (!username || !name || !password) return res.status(400).json({ error: 'Нэр, нэвтрэх нэр, нууц үг шаардлагатай' });
  if (DB.users.some(u => u.username === username)) return res.status(409).json({ error: 'Энэ нэвтрэх нэр бүртгэлтэй байна' });
  const u = { id: ++DB.userSeq, username, name, role: role || 'EE', pw: hashPw(password) };
  DB.users.push(u); persist();
  res.status(201).json(publicUser(u));
});
app.put('/api/users/:id', auth, adminOnly, (req, res) => {
  const u = DB.users.find(x => x.id === +req.params.id);
  if (!u) return res.status(404).json({ error: 'Олдсонгүй' });
  const { name, role, password } = req.body || {};
  if (name) u.name = name;
  if (role) u.role = role;
  if (password) u.pw = hashPw(password);
  persist(); res.json(publicUser(u));
});
app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  const id = +req.params.id;
  if (DB.users.length <= 1) return res.status(400).json({ error: 'Сүүлчийн хэрэглэгчийг устгах боломжгүй' });
  DB.users = DB.users.filter(u => u.id !== id); persist();
  res.json({ ok: true });
});

// Веб хуудас — index.html-ийг root-оос дамжуулна (Chart.js нь CDN-ээс ачаална)
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log('Цахилгааны систем ажиллаж байна: http://localhost:' + PORT));
