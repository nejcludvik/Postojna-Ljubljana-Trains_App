const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const unzipper = require('unzipper');
const { parse } = require('csv-parse');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const CACHE_MS = 2 * 60 * 1000;
const GTFS_REFRESH_MS = 12 * 60 * 60 * 1000;
const MDB_PAGE = 'https://mobilitydatabase.org/feeds/gtfs/mdb-2940';
const RT_URL = 'https://rt.gtfs.derp.si/sources/ijpp/trip_updates';
const cache = new Map();
let gtfsIndex = null;
let gtfsLoadedAt = 0;
let gtfsLoading = null;

const STATIONS = {
  postojna: { name: 'Postojna' },
  ljubljana: { name: 'Ljubljana' }
};

function normalizeName(s = '') {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function validIsoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function todayLjubljana() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
function gtfsTimeToSeconds(t = '') {
  const p = t.split(':').map(Number);
  if (p.length < 2 || p.some(Number.isNaN)) return null;
  return p[0] * 3600 + p[1] * 60 + (p[2] || 0);
}
function displayTime(t = '') {
  const sec = gtfsTimeToSeconds(t);
  if (sec == null) return '';
  const min = Math.floor(sec / 60) % 1440;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
function durationText(a, b) {
  let x = gtfsTimeToSeconds(a), y = gtfsTimeToSeconds(b);
  if (x == null || y == null) return '';
  while (y < x) y += 86400;
  const m = Math.max(0, Math.round((y - x) / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
function isoParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, ymd: `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}` };
}
function weekdayKey(iso) {
  const { y, m, d } = isoParts(iso);
  return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
async function fetchBuffer(url, opts = {}) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(opts.timeout || 120000), headers: opts.headers || {} });
  if (!r.ok) throw new Error(`Data source returned HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
async function fetchText(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': 'Postojna-Ljubljana-Trains/1.4 (+public commuter app)' },
    redirect: 'follow', signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) throw new Error(`Data source returned HTTP ${r.status}`);
  return await r.text();
}
async function latestGtfsUrl() {
  if (process.env.GTFS_URL) return process.env.GTFS_URL;
  const html = await fetchText(MDB_PAGE);
  const matches = [...html.matchAll(/https:\/\/files\.mobilitydatabase\.org\/mdb-2940\/[^"'<>\s]+\.zip/g)].map(m => m[0]);
  if (!matches.length) throw new Error('Could not locate the latest DUJPP GTFS download');
  return matches[0];
}
async function csvRows(stream, onRow) {
  await new Promise((resolve, reject) => {
    const parser = parse({ columns: true, bom: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
    stream.pipe(parser);
    parser.on('data', onRow);
    parser.on('error', reject);
    parser.on('end', resolve);
  });
}
async function entryStream(directory, name) {
  const e = directory.files.find(x => path.basename(x.path).toLowerCase() === name.toLowerCase());
  if (!e) throw new Error(`GTFS file ${name} missing`);
  return e.stream();
}
function isRailRouteType(v) {
  const n = Number(v);
  return n === 2 || (n >= 100 && n < 200);
}
function serviceActive(index, serviceId, iso) {
  const { ymd } = isoParts(iso);
  const ex = index.calendarDates.get(serviceId)?.get(ymd);
  if (ex === 1) return true;
  if (ex === 2) return false;
  const c = index.calendar.get(serviceId);
  if (!c) return false;
  if (ymd < c.start_date || ymd > c.end_date) return false;
  return c[weekdayKey(iso)] === '1';
}
async function buildGtfsIndex() {
  const gtfsUrl = await latestGtfsUrl();
  const tmp = path.join(os.tmpdir(), `dujpp-${Date.now()}.zip`);
  console.log('Downloading DUJPP GTFS…');
  const buf = await fetchBuffer(gtfsUrl, { timeout: 180000 });
  await fsp.writeFile(tmp, buf);
  console.log(`GTFS downloaded: ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  const directory = await unzipper.Open.file(tmp);

  const routes = new Map();
  await csvRows(await entryStream(directory, 'routes.txt'), row => {
    if (isRailRouteType(row.route_type)) routes.set(row.route_id, row);
  });

  const trips = new Map();
  await csvRows(await entryStream(directory, 'trips.txt'), row => {
    if (routes.has(row.route_id)) trips.set(row.trip_id, row);
  });

  const stops = [];
  await csvRows(await entryStream(directory, 'stops.txt'), row => stops.push(row));
  const wanted = {};
  for (const [key, station] of Object.entries(STATIONS)) {
    const target = normalizeName(station.name);
    const primary = stops.filter(s => normalizeName(s.stop_name) === target);
    const primaryIds = new Set(primary.map(s => s.stop_id));
    const childIds = stops.filter(s => primaryIds.has(s.parent_station)).map(s => s.stop_id);
    const broad = stops.filter(s => {
      const n = normalizeName(s.stop_name);
      return n === target || n.startsWith(`${target} `) || n.startsWith(`${target}-`);
    }).map(s => s.stop_id);
    wanted[key] = new Set([...primaryIds, ...childIds, ...broad]);
    if (!wanted[key].size) throw new Error(`Station ${station.name} not found in GTFS`);
  }

  const relevant = new Map();
  await csvRows(await entryStream(directory, 'stop_times.txt'), row => {
    if (!trips.has(row.trip_id)) return;
    let stationKey = null;
    if (wanted.postojna.has(row.stop_id)) stationKey = 'postojna';
    else if (wanted.ljubljana.has(row.stop_id)) stationKey = 'ljubljana';
    if (!stationKey) return;
    if (!relevant.has(row.trip_id)) relevant.set(row.trip_id, {});
    const cur = relevant.get(row.trip_id)[stationKey];
    const candidate = { stop_id: row.stop_id, arrival_time: row.arrival_time, departure_time: row.departure_time, stop_sequence: Number(row.stop_sequence) };
    if (!cur || candidate.stop_sequence < cur.stop_sequence) relevant.get(row.trip_id)[stationKey] = candidate;
  });

  const calendar = new Map();
  try {
    await csvRows(await entryStream(directory, 'calendar.txt'), row => calendar.set(row.service_id, row));
  } catch (e) { console.warn('calendar.txt not available:', e.message); }
  const calendarDates = new Map();
  try {
    await csvRows(await entryStream(directory, 'calendar_dates.txt'), row => {
      if (!calendarDates.has(row.service_id)) calendarDates.set(row.service_id, new Map());
      calendarDates.get(row.service_id).set(row.date, Number(row.exception_type));
    });
  } catch (e) { console.warn('calendar_dates.txt not available:', e.message); }

  const journeys = [];
  for (const [tripId, pair] of relevant) {
    if (!pair.postojna || !pair.ljubljana) continue;
    const trip = trips.get(tripId), route = routes.get(trip.route_id);
    journeys.push({
      tripId,
      serviceId: trip.service_id,
      routeId: trip.route_id,
      tripShortName: trip.trip_short_name || '',
      headsign: trip.trip_headsign || '',
      routeShortName: route?.route_short_name || '',
      routeLongName: route?.route_long_name || '',
      postojna: pair.postojna,
      ljubljana: pair.ljubljana
    });
  }

  await fsp.unlink(tmp).catch(() => {});
  console.log(`GTFS indexed: ${journeys.length} rail journeys touching both stations`);
  return { journeys, calendar, calendarDates, sourceUrl: gtfsUrl, builtAt: Date.now() };
}
async function ensureGtfsIndex() {
  if (gtfsIndex && Date.now() - gtfsLoadedAt < GTFS_REFRESH_MS) return gtfsIndex;
  if (!gtfsLoading) {
    gtfsLoading = buildGtfsIndex().then(index => {
      gtfsIndex = index; gtfsLoadedAt = Date.now(); gtfsLoading = null; return index;
    }).catch(err => { gtfsLoading = null; throw err; });
  }
  return gtfsLoading;
}
async function realtimeMap() {
  const out = new Map();
  try {
    const buf = await fetchBuffer(RT_URL, { timeout: 20000 });
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);
    for (const ent of feed.entity || []) {
      const tu = ent.tripUpdate;
      if (!tu?.trip?.tripId) continue;
      const cancelled = Number(tu.trip.scheduleRelationship) === 3;
      let delay = null;
      for (const stu of tu.stopTimeUpdate || []) {
        const d = stu.departure?.delay ?? stu.arrival?.delay;
        if (Number.isFinite(d)) { delay = d; break; }
      }
      if (delay == null && Number.isFinite(tu.delay)) delay = tu.delay;
      out.set(tu.trip.tripId, { delaySeconds: Number(delay || 0), cancelled });
    }
  } catch (e) {
    console.warn('Realtime feed unavailable:', e.message);
  }
  return out;
}
function serviceName(j) {
  return j.tripShortName || j.routeShortName || j.routeLongName || 'Train';
}
async function getTrains(fromKey, date) {
  const toKey = fromKey === 'postojna' ? 'ljubljana' : 'postojna';
  const cacheKey = `${fromKey}|${date}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  const index = await ensureGtfsIndex();
  const rt = await realtimeMap();
  const trains = [];
  for (const j of index.journeys) {
    if (!serviceActive(index, j.serviceId, date)) continue;
    const a = j[fromKey], b = j[toKey];
    if (!a || !b || a.stop_sequence >= b.stop_sequence) continue;
    const depRaw = a.departure_time || a.arrival_time;
    const arrRaw = b.arrival_time || b.departure_time;
    const dep = displayTime(depRaw), arr = displayTime(arrRaw);
    if (!dep || !arr) continue;
    const live = rt.get(j.tripId);
    trains.push({
      tripId: j.tripId,
      departure: dep,
      arrival: arr,
      service: serviceName(j),
      trains: [serviceName(j)],
      transfers: 0,
      duration: durationText(depRaw, arrRaw),
      replacementBus: false,
      delayMinutes: live ? Math.max(0, Math.round(live.delaySeconds / 60)) : 0,
      delayText: live ? `${Math.max(0, Math.round(live.delaySeconds / 60))} min` : '',
      liveAvailable: Boolean(live),
      delayStation: '',
      liveRoute: j.headsign,
      cancelled: Boolean(live?.cancelled)
    });
  }
  trains.sort((a, b) => a.departure.localeCompare(b.departure));

  const data = {
    source: 'DUJPP GTFS (official dataset, mirrored by MobilityDatabase)',
    realtimeSource: 'IJPP GTFS-Realtime via oJPP/DERP',
    from: STATIONS[fromKey].name,
    to: STATIONS[toKey].name,
    date,
    updatedAt: new Date().toISOString(),
    refreshAfterSeconds: 120,
    trains,
    alerts: [],
    sourceUrls: {
      timetable: 'https://nap.si/en/datasets',
      mirror: MDB_PAGE,
      realtime: 'https://rt.gtfs.derp.si/'
    }
  };
  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

function mime(file) {
  return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)] || 'application/octet-stream';
}
function send(res, status, body, headers={}) { res.writeHead(status, {'cache-control':'no-store', ...headers}); res.end(body); }
function sendJson(res, status, value) { send(res, status, JSON.stringify(value), {'content-type':'application/json; charset=utf-8'}); }

const server = http.createServer(async (req,res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (u.pathname === '/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, service: 'postojna-ljubljana-trains', gtfsReady: Boolean(gtfsIndex), version: '1.4.0' });
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
  console.log(`Train app v1.4.0 running on http://0.0.0.0:${PORT}`);
  ensureGtfsIndex().catch(e => console.error('Initial GTFS load failed:', e.message));
});
