const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

const STATIONS = {
  postojna: { id: '44009', name: 'Postojna' },
  ljubljana: { id: '42300', name: 'Ljubljana' }
};

function decodeHtml(s = '') {
  const map = { '&nbsp;':' ', '&amp;':'&', '&quot;':'"', '&#39;':"'", '&lt;':'<', '&gt;':'>' };
  return s.replace(/&(nbsp|amp|quot|#39|lt|gt);/g, m => map[m] || m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function stripTags(s = '') {
  return decodeHtml(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}
function tableRows(html) {
  const rows = [];
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => stripTags(m[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}
function trainTokens(text = '') {
  return [...text.toUpperCase().matchAll(/\b([A-ZČŠŽ]{1,5})\s*(\d{2,6})\b/g)].map(m => `${m[1]} ${m[2]}`);
}
function toMinutes(hhmm) {
  const [h,m] = hhmm.split(':').map(Number); return h*60+m;
}
function clock(total) {
  total = (total + 1440) % 1440;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function fmtDateForSz(iso) {
  const [y,m,d] = iso.split('-'); return `${d}.${m}.${y}`;
}
function validIsoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function todayLjubljana() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
function nowMinutesLjubljana() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
  return h * 60 + m;
}

async function fetchText(url) {
  const r = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'sl-SI,sl;q=0.9,en;q=0.8',
      'referer': 'https://potniski.sz.si/',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'upgrade-insecure-requests': '1'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(`SŽ returned HTTP ${r.status}`);
  return await r.text();
}

function parseTimetable(html, fromName, toName) {
  const result = [];
  for (const cells of tableRows(html)) {
    if (cells.length < 4) continue;
    const route = cells[0];
    const type = cells[cells.length - 1];
    if (!route.toLowerCase().includes(fromName.toLowerCase()) || !route.toLowerCase().includes(toName.toLowerCase())) continue;
    const times = [...route.matchAll(/\b([01]\d|2[0-3]):[0-5]\d\b/g)].map(m => m[0]);
    if (times.length < 2) continue;
    const trains = trainTokens(type);
    if (!trains.length && !/BUS/i.test(type)) continue;
    result.push({
      departure: times[0], arrival: times[times.length - 1],
      service: type, trains,
      transfers: Number.parseInt(cells[2], 10) || 0,
      duration: cells[1] || '', replacementBus: /\bBUS\b/i.test(type)
    });
  }
  const seen = new Set();
  return result.filter(x => {
    const k = `${x.departure}|${x.arrival}|${x.service}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  }).sort((a,b) => toMinutes(a.departure)-toMinutes(b.departure));
}

function parseDelays(html) {
  const map = new Map();
  for (const cells of tableRows(html)) {
    if (cells.length < 4) continue;
    const trainText = cells[2];
    const delayText = cells[3];
    const tokens = trainTokens(trainText);
    if (!tokens.length) continue;
    const minMatch = delayText.match(/(\d+)\s*min/i);
    const mins = minMatch ? Number(minMatch[1]) : 0;
    for (const token of tokens) {
      const prev = map.get(token);
      if (!prev || mins >= prev.minutes) map.set(token, { minutes: mins, text: delayText, atStation: cells[0], route: cells[1] });
    }
  }
  return map;
}

function parseRelevantAlerts(html) {
  const text = stripTags(html);
  const chunks = text.split(/(?=\b\d{2}\.\d{2}\.\d{4}\b)/).map(x=>x.trim()).filter(Boolean);
  const keys = ['Postojna','Ljubljana - Logatec','Logatec - Ljubljana','Ljubljana - Borovnica','Borovnica - Ljubljana','Prestranek - Postojna'];
  return chunks.filter(c => keys.some(k => c.toLowerCase().includes(k.toLowerCase())))
    .slice(0,4).map(c => c.slice(0,420));
}

async function getTrains(fromKey, date) {
  const toKey = fromKey === 'postojna' ? 'ljubljana' : 'postojna';
  const from = STATIONS[fromKey], to = STATIONS[toKey];
  const cacheKey = `${fromKey}|${date}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  const qDate = fmtDateForSz(date);
  const timetableUrl = `https://potniski.sz.si/vozni-redi-results/?action=timetables_search&current-language=sl&departure-date=${encodeURIComponent(qDate)}&entry-station=${from.id}&exit-station=${to.id}&submit=Prika%C5%BEi`;
  const infoUrl = 'https://potniski.sz.si/en/help-and-travel-updates/';
  const [timetableHtml, infoHtml] = await Promise.all([fetchText(timetableUrl), fetchText(infoUrl)]);
  const timetable = parseTimetable(timetableHtml, from.name, to.name);
  const delays = parseDelays(infoHtml);
  const trains = timetable.map(t => {
    let live = null;
    for (const token of t.trains) {
      if (delays.has(token)) { live = delays.get(token); break; }
    }
    const liveText = live?.text || '';
    const cancelled = /cancelled|canceled|odpoved|ne\s+vozi|will\s+not\s+run/i.test(liveText);
    return { ...t, delayMinutes: live?.minutes || 0, delayText: liveText, delayStation: live?.atStation || '', liveRoute: live?.route || '', cancelled };
  });
  const data = {
    source: 'Slovenske železnice – Potniški promet', from: from.name, to: to.name, date,
    updatedAt: new Date().toISOString(), refreshAfterSeconds: 360, trains,
    alerts: parseRelevantAlerts(infoHtml), sourceUrls: { timetable: timetableUrl, traffic: infoUrl }
  };
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

function mime(file) {
  return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)] || 'application/octet-stream';
}
function send(res, status, body, headers={}) {
  res.writeHead(status, {'cache-control':'no-store', ...headers}); res.end(body);
}
function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), {'content-type':'application/json; charset=utf-8'});
}

const server = http.createServer(async (req,res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (u.pathname === '/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, service: 'postojna-ljubljana-trains' });
    }

    if (u.pathname === '/api/trains' && req.method === 'GET') {
      const from = (u.searchParams.get('from') || 'postojna').toLowerCase();
      const date = u.searchParams.get('date') || todayLjubljana();
      if (!STATIONS[from] || !validIsoDate(date)) return sendJson(res,400,{error:'Invalid from/date'});
      return sendJson(res,200,await getTrains(from,date));
    }

    let rel = u.pathname === '/' ? '/index.html' : u.pathname;
    rel = path.normalize(rel).replace(/^\.\.(\/|\\|$)/,'');
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return send(res,403,'Forbidden');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res,404,'Not found');
    const body = fs.readFileSync(file);
    res.writeHead(200, {'content-type':mime(file), 'cache-control': rel === '/sw.js' ? 'no-cache' : 'public, max-age=300'}); res.end(body);
  } catch (e) {
    console.error(e);
    if (req.url?.startsWith('/api/')) return sendJson(res,502,{error:'Request failed',detail:e.message});
    return send(res,500,'Server error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Train app running on http://0.0.0.0:${PORT}`);
});
