import { test, expect, startLocal } from '../helpers/oppstart.js';
import * as oppstart from '../helpers/oppstart.js';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { Encoder, Profile } from '@garmin/fitsdk';

// Akseptansetester for docs/specs/turer-fra-klokka.md.
// App-testene kjører innlogget med startCloud fra den felles oppstarten. Supabase (/auth, /rest og funksjonen
// /functions/v1/klokke) er en liten falsk tjeneste her i fila, med tabellene i minnet. Handler-testene kjører i
// Node mot supabase/functions/klokke/handler.js med falsk fetch og falsk getUser. Ingen test når det ekte
// intervals.icu eller det ekte Supabase-prosjektet. Alle data er oppdiktet.
/* global seasonStart -- global i index.html, brukes inne i page.evaluate */

const EIER = { id: '00000000-0000-4000-8000-00000000e1e1', email: 'din@epost.no' };
const KOMPIS = '00000000-0000-4000-8000-00000000c0c0';
const NOKKEL = 'test-nokkel';

/* ---------- kunstig FIT-fil (samme oppbygging som i fit-filer) ---------- */
const N = 400, STEP = 3000;
const sc = d => Math.round(d * 2 ** 31 / 180);
const pt = i => ({ lat: 69.62 + i * 0.00004, lon: 18.98 + i * 0.00006 + Math.sin(i / 15) * 0.0002, ele: 120 + i * 0.6, hr: 110 + (i % 30) });
function makeFit(T0) {
  const e = new Encoder(), d = ms => new Date(ms), END = T0 + (N - 1) * STEP;
  e.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: d(T0), type: 'activity' });
  for (let i = 0; i < N; i++) {
    const p = pt(i);
    e.onMesg(Profile.MesgNum.RECORD, { timestamp: d(T0 + i * STEP), positionLat: sc(p.lat), positionLong: sc(p.lon), enhancedAltitude: p.ele, heartRate: p.hr });
  }
  let start = T0;
  for (const [end, lapTrigger] of [[T0 + 300_000, 'manual'], [T0 + 750_000, 'manual'], [T0 + 960_000, 'distance'], [END, 'sessionEnd']]) {
    const s = (end - start) / 1000;
    e.onMesg(Profile.MesgNum.LAP, { timestamp: d(end), startTime: d(start), totalElapsedTime: s, totalTimerTime: s, lapTrigger });
    start = end;
  }
  const tot = (END - T0) / 1000;
  e.onMesg(Profile.MesgNum.SESSION, { timestamp: d(END), startTime: d(T0), totalElapsedTime: tot, totalTimerTime: tot, sport: 'hiking' });
  e.onMesg(Profile.MesgNum.ACTIVITY, { timestamp: d(END), numSessions: 1, type: 'manual', totalTimerTime: tot });
  return Buffer.from(e.close());
}

/* ---------- oppdiktede aktiviteter fra klokka ---------- */
// 18. okt kl. 08:00 norsk tid, og 12. okt kl. 00:30 norsk tid (11. okt kl. 22:30 UTC).
const A = { id: 'i900001', type: 'Hike', start_date: '2026-10-18T06:00:00Z', start_date_local: '2026-10-18T08:00:00', distance: 8400 };
const B = { id: 'i900002', type: 'Hike', start_date: '2026-10-11T22:30:00Z', start_date_local: '2026-10-12T00:30:00', distance: 5200 };
const FIL = { [A.id]: makeFit(Date.parse(A.start_date)), [B.id]: makeFit(Date.parse(B.start_date)) };
const at = (iso, min) => new Date(Date.parse(iso) + min * 60_000).toISOString();
const gpx = startedAt => `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Tidligere tur</name><trkseg>${
  Array.from({ length: 40 }, (_, i) => { const p = pt(i * 10); return `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele><time>${new Date(Date.parse(startedAt) + i * 30_000).toISOString()}</time></trkpt>`; }).join('')}</trkseg></trk></gpx>`;
const tur = (startedAt, extra = {}) => ({ id: crypto.randomUUID(), owner: EIER.id, name: 'Tidligere tur', area: null, started_at: startedAt, distance_m: 4000, gain_m: 200, duration_s: 7200, participants: null, with_dog: false, dogs: null, bag: 0, notes: null, conditions: {}, weather: null, weather_summary: null, track_simple: null, effort: null, gpx: gpx(startedAt), source_id: null, ...extra });

/* ---------- falsk Supabase ---------- */
// klokke(url, metode) gir { status, json } eller { status, body }, eller HENG for et svar som aldri kommer.
const HENG = Symbol('heng');
function lagSky({ trips = [], obs = [], skip = [], klokke }) {
  const db = { trips: [...trips], observations: [...obs], import_skip: [...skip] };
  const kall = [], sky = { db, kall, klokke };
  const unik = { trips: r => r.source_id != null && [r.owner, r.source_id].join('|'), import_skip: r => [r.owner, r.source_id].join('|'), observations: r => r.id };
  async function rute(route, req) {
    const url = new URL(req.url()), metode = req.method(), h = req.headers();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': h['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': 'content-range' };
    if (metode === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    kall.push({ metode, sti: url.pathname, sok: url.searchParams, url: url.href });
    const json = (status, body) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return json(200, EIER);
    if (url.pathname.startsWith('/auth/v1/')) return json(204);
    if (url.pathname.startsWith('/functions/v1/klokke')) {
      const s = await sky.klokke(url, metode);
      if (s === HENG) return new Promise(() => {});
      return route.fulfill({ status: s.status, headers: cors, contentType: s.json !== undefined ? 'application/json' : 'application/octet-stream', body: s.json !== undefined ? JSON.stringify(s.json) : s.body });
    }
    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (!m || !db[m[1]]) return json(404, { code: 'PGRST205', message: `Ukjent tabell ${url.pathname}` });
    const tabell = db[m[1]], key = unik[m[1]];
    const filtre = [...url.searchParams].filter(([k]) => !['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k));
    const treff = r => filtre.every(([k, v]) => v.startsWith('eq.') && String(r[k]) === v.slice(3));
    const enkel = (h.accept || '').includes('vnd.pgrst.object'), prefer = h.prefer || '';
    const svar = (status, rader) => {
      if (!prefer.includes('return=representation') && metode !== 'GET') return json(status === 201 ? 201 : 204);
      if (enkel) return rader.length === 1 ? json(status, rader[0]) : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      return json(status, rader);
    };
    if (metode === 'GET') {
      const rader = tabell.filter(treff);
      if (m[1] === 'trips') rader.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
      return svar(200, rader);
    }
    if (metode === 'POST') {
      let body = JSON.parse(req.postData() || '[]'); body = Array.isArray(body) ? body : [body];
      const upsert = prefer.includes('resolution=merge-duplicates'), ut = [];
      for (const r0 of body) {
        const r = { owner: EIER.id, created_at: new Date().toISOString(), ...r0 };
        const k = key(r), i = k ? tabell.findIndex(x => key(x) === k) : -1;
        if (i >= 0 && !upsert) return json(409, { code: '23505', message: `duplicate key value violates unique constraint "${m[1]}_owner_source_id_key"`, details: 'Key (owner, source_id) already exists.', hint: null });
        if (i >= 0) tabell[i] = { ...tabell[i], ...r }; else tabell.push(r);
        ut.push(i >= 0 ? tabell[i] : r);
      }
      return svar(201, ut);
    }
    if (metode === 'PATCH') {
      const body = JSON.parse(req.postData() || '{}'), ut = [];
      tabell.forEach((r, i) => { if (treff(r)) { tabell[i] = { ...r, ...body }; ut.push(tabell[i]); } });
      return svar(200, ut);
    }
    if (metode === 'DELETE') {
      const ut = tabell.filter(treff);
      db[m[1]] = tabell.filter(r => !treff(r));
      return svar(200, ut);
    }
    return json(405, { message: 'Ikke støttet' });
  }
  sky.svar = { bruker: EIER, rute };
  return sky;
}
// Standardsvar fra funksjonen: listen med aktiviteter, og fila for en aktivitet.
const klokkeMed = aktiviteter => async url => {
  const id = url.searchParams.get('id');
  if (id) return FIL[id] ? { status: 200, body: FIL[id] } : { status: 502, json: { error: 'ukjent' } };
  return { status: 200, json: aktiviteter };
};
const klokkeKall = sky => sky.kall.filter(k => k.sti.startsWith('/functions/v1/klokke'));
const listeKall = sky => klokkeKall(sky).filter(k => !k.sok.get('id'));

/* ---------- hjelpere i appen ---------- */
const boks = page => page.locator('#klokke');
const rader = page => page.locator('#klokke .klokke-rad');
const rad = (page, id) => page.locator(`#klokke .klokke-rad[data-id="${id}"]`);
const nyeRader = page => rader(page).filter({ has: page.getByRole('button', { name: 'Legg inn' }) });
const FEIL = 'Fikk ikke kontakt med klokka';

async function start(page, sky) {
  if (typeof oppstart.startCloud !== 'function') throw new Error('startCloud mangler i tests/helpers/oppstart.js');
  await oppstart.startCloud(page, sky.svar);
}
// Venter til appen har spurt funksjonen om listen og fått svar.
const ventListe = sky => expect.poll(() => listeKall(sky).length, { timeout: 15_000 }).toBeGreaterThan(0);
async function tilbakeTilLoggen(page) {
  await page.locator('#crumbLog').click();
  await expect(page.locator('#pane-log')).toBeVisible();
}

test.describe('appen', () => {
  // Klokkeslett skal vises i norsk tid uansett tidssonen til maskinen. Testene kjører derfor i UTC.
  test.use({ timezoneId: 'UTC' });
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('pageerror', e => errors.push(e.message));
  });
  test.afterEach(() => expect(errors).toEqual([]));

  // AK1: Boksen viser nye turer med dato, klokkeslett i norsk tid og km, nyeste først.
  test('AK1: boksen «Nye turer fra klokka» viser 2 linjer, nyeste først, i norsk tid', async ({ page }) => {
    const sky = lagSky({ klokke: klokkeMed([B, A]) });
    await start(page, sky);
    await expect(boks(page)).toBeVisible({ timeout: 15_000 });
    await expect(boks(page)).toContainText('Nye turer fra klokka');
    await expect(rader(page)).toHaveCount(2);
    await expect(rader(page).nth(0)).toHaveAttribute('data-id', A.id);
    await expect(rader(page).nth(1)).toHaveAttribute('data-id', B.id);
    await expect(rader(page).nth(0)).toContainText('08:00');
    await expect(rader(page).nth(0)).toContainText(/\b18\b/);
    await expect(rader(page).nth(0)).toContainText(/8,4\d? km/);
    await expect(rader(page).nth(1)).toContainText('00:30');
    await expect(rader(page).nth(1)).toContainText(/\b12\b/);
    await expect(rader(page).nth(1)).not.toContainText('22:30');
    await expect(rader(page).nth(1)).toContainText(/5,2\d? km/);
    for (const i of [0, 1]) {
      await expect(rader(page).nth(i).getByRole('button', { name: 'Legg inn' })).toBeVisible();
      await expect(rader(page).nth(i).getByRole('button', { name: 'Ikke jakt' })).toBeVisible();
    }
    // Boksen står over turlisten.
    const [b, l] = [await boks(page).boundingBox(), await page.locator('#pane-log .trips').boundingBox()];
    expect(b.y).toBeLessThan(l.y);
  });

  // AK2: «Legg inn» henter fila for akkurat den aktiviteten, og «Lagre tur» lagrer turen med source_id.
  test('AK2: «Legg inn» åpner turdialogen med fila, og lagring gir source_id og fjerner linjen', async ({ page }) => {
    const sky = lagSky({ klokke: klokkeMed([A, B]) });
    await start(page, sky);
    await expect(rader(page)).toHaveCount(2, { timeout: 15_000 });
    await rad(page, A.id).getByRole('button', { name: 'Legg inn' }).click();
    await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#tSummary')).toContainText('2 trykk på rundeknappen blir rypetreff du fyller ut');
    expect(klokkeKall(sky).map(k => k.sok.get('id')).filter(Boolean)).toEqual([A.id]);
    await page.locator('#tSave').click();
    await expect(page.locator('#tripModal')).toBeHidden({ timeout: 30_000 });
    await expect.poll(() => sky.db.trips.filter(t => t.source_id === A.id).length).toBe(1);
    const lagret = sky.db.trips.find(t => t.source_id === A.id);
    expect(sky.db.observations.filter(o => o.trip_id === lagret.id && o.kind === 'rype')).toHaveLength(2);
    await tilbakeTilLoggen(page);
    await expect(rad(page, A.id)).toHaveCount(0);
    await expect(rad(page, B.id)).toHaveCount(1);
  });

  // AK3: Lukkes dialogen uten å lagre, lagres ingenting, og linjen blir stående.
  test('AK3: dialogen lukket uten lagring gir ingen tur, og linjen blir stående', async ({ page }) => {
    const sky = lagSky({ klokke: klokkeMed([A, B]) });
    await start(page, sky);
    await rad(page, A.id).getByRole('button', { name: 'Legg inn' }).click({ timeout: 15_000 });
    await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
    await page.locator('#tripModal [data-close]').first().click();
    await expect(page.locator('#tripModal')).toBeHidden();
    expect(sky.db.trips).toHaveLength(0);
    expect(sky.db.observations).toHaveLength(0);
    await expect(rad(page, A.id)).toHaveCount(1);
    await expect(rad(page, A.id).getByRole('button', { name: 'Legg inn' })).toBeVisible();
  });

  // AK4: «Ikke jakt» lagrer en rad i import_skip, og aktiviteten er borte også etter ny lasting.
  test('AK4: «Ikke jakt» lagrer import_skip og skjuler turen, også etter ny lasting', async ({ page }) => {
    const sky = lagSky({ klokke: klokkeMed([A, B]) });
    await start(page, sky);
    await rad(page, A.id).getByRole('button', { name: 'Ikke jakt' }).click({ timeout: 15_000 });
    await expect(nyeRader(page)).toHaveCount(1);
    await expect(rad(page, A.id)).toHaveCount(0);
    await expect.poll(() => sky.db.import_skip.map(r => r.source_id)).toEqual([A.id]);
    expect(sky.db.import_skip[0].owner).toBe(EIER.id);
    await page.reload();
    await expect(nyeRader(page)).toHaveCount(1, { timeout: 30_000 });
    await expect(rad(page, B.id)).toHaveCount(1);
    await expect(rad(page, A.id)).toHaveCount(0);
  });

  // AK5: Egen tur innen 5 minutter skjuler aktiviteten. 6 minutter, eller en lagkamerats tur, gjør det ikke.
  test('AK5: egen tur innen 5 min skjuler, 6 min unna eller lagkameratens tur gjør det ikke', async ({ page }) => {
    const A1 = { ...A, id: 'i900011', start_date: '2026-09-01T06:00:00Z' };
    const A2 = { ...A, id: 'i900012', start_date: '2026-09-05T06:00:00Z' };
    const A3 = { ...A, id: 'i900013', start_date: '2026-09-09T06:00:00Z' };
    const sky = lagSky({
      trips: [tur(at(A1.start_date, 5)), tur(at(A2.start_date, 6)), tur(at(A3.start_date, 1), { owner: KOMPIS })],
      klokke: klokkeMed([A1, A2, A3]),
    });
    await start(page, sky);
    await expect(nyeRader(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(rad(page, A2.id)).toHaveCount(1);
    await expect(rad(page, A3.id)).toHaveCount(1);
    await expect(rad(page, A1.id)).toHaveCount(0);
  });

  // AK6: Egen tur med samme source_id skjuler aktiviteten, uansett starttid.
  test('AK6: egen tur med samme source_id skjuler aktiviteten', async ({ page }) => {
    const sky = lagSky({ trips: [tur('2026-08-15T10:00:00Z', { source_id: A.id })], klokke: klokkeMed([A, B]) });
    await start(page, sky);
    await expect(nyeRader(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(rad(page, B.id)).toHaveCount(1);
    await expect(rad(page, A.id)).toHaveCount(0);
  });

  // AK7: Ingen nye og ingen skjulte gir ingen boks. Er siste linje lagt inn, forsvinner boksen.
  test('AK7: ingen nye og ingen skjulte aktiviteter gir ingen boks', async ({ page }) => {
    const sky = lagSky({ trips: [tur(at(A.start_date, 1))], klokke: klokkeMed([A]) });
    await start(page, sky);
    await ventListe(sky);
    await expect(page.locator('.trip')).toHaveCount(1);
    await page.waitForTimeout(1000);
    await expect(boks(page)).toBeHidden();
  });
  test('AK7: når den eneste linjen er lagt inn, er boksen borte', async ({ page }) => {
    const sky = lagSky({ klokke: klokkeMed([A]) });
    await start(page, sky);
    await rad(page, A.id).getByRole('button', { name: 'Legg inn' }).click({ timeout: 15_000 });
    await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
    await page.locator('#tSave').click();
    await expect(page.locator('#tripModal')).toBeHidden({ timeout: 30_000 });
    await tilbakeTilLoggen(page);
    await expect(page.locator('.trip')).toHaveCount(1);
    await expect(boks(page)).toBeHidden();
  });
  test('AK7: når den eneste linjen er skjult, står bare lenken igjen', async ({ page }) => {
    const sky = lagSky({ klokke: klokkeMed([A]) });
    await start(page, sky);
    await rad(page, A.id).getByRole('button', { name: 'Ikke jakt' }).click({ timeout: 15_000 });
    await expect(rader(page)).toHaveCount(0);
    await expect(boks(page)).toBeVisible();
    await expect(boks(page).getByText('Vis skjulte turer (1)')).toBeVisible();
    await expect(boks(page).getByRole('button', { name: 'Legg inn' })).toHaveCount(0);
  });

  // AK8: 401 og 403 («ikke koblet») gir verken boks eller feillinje, og loggen virker.
  for (const status of [401, 403]) {
    test(`AK8: svar ${status} gir verken boks eller feillinje`, async ({ page }) => {
      const sky = lagSky({ trips: [tur('2026-09-20T07:00:00Z')], klokke: async () => ({ status, json: { error: 'ikke koblet' } }) });
      await start(page, sky);
      await ventListe(sky);
      await page.waitForTimeout(1500);
      await expect(boks(page)).toBeHidden();
      await expect(page.getByText(FEIL)).toHaveCount(0);
      await expect(page.locator('#toast')).toBeHidden();
      await expect(page.locator('.trip')).toHaveCount(1);
      await page.locator('.trip').first().click();
      await expect(page.locator('#crumbTrip')).toHaveText('Tidligere tur', { timeout: 30_000 });
    });
  }

  // AK9: I lokal modus kalles funksjonen aldri. Kontroll: innlogget kalles den.
  test('AK9: lokal modus kaller aldri funksjonen og viser ingen boks', async ({ page }) => {
    const funksjon = [];
    page.on('request', r => { if (/\/functions\/v1\/klokke/.test(r.url())) funksjon.push(r.url()); });
    await startLocal(page);
    await page.waitForTimeout(2000);
    expect(funksjon).toEqual([]);
    await expect(boks(page)).toBeHidden();
    // Kontroll på at testen ser kallet når det finnes: samme side innlogget skal kalle funksjonen.
    const sky = lagSky({ klokke: klokkeMed([A]) });
    await start(page, sky);
    await expect.poll(() => funksjon.length, { timeout: 15_000 }).toBeGreaterThan(0);
  });

  // AK14: Feil fra funksjonen gir bare én diskret linje, uten toast.
  for (const status of [500, 502]) {
    test(`AK14: svar ${status} gir linjen «${FEIL}» og ingen toast`, async ({ page }) => {
      const sky = lagSky({ trips: [tur('2026-09-20T07:00:00Z')], klokke: async () => ({ status, json: { error: 'feil' } }) });
      await start(page, sky);
      await expect(boks(page)).toBeVisible({ timeout: 15_000 });
      await expect(boks(page)).toContainText(FEIL);
      await expect(rader(page)).toHaveCount(0);
      await expect(boks(page).getByRole('button')).toHaveCount(0);
      await expect(page.locator('#toast')).toBeHidden();
      await expect(page.locator('.trip')).toHaveCount(1);
    });
  }
  test('AK14: svar som aldri kommer gir linjen etter 8 sekunder når nettleseren har fått svar før', async ({ page }) => {
    test.setTimeout(90_000);
    const sky = lagSky({ trips: [tur('2026-09-20T07:00:00Z')], klokke: klokkeMed([A]) });
    await start(page, sky);
    await expect(rad(page, A.id)).toHaveCount(1, { timeout: 15_000 });
    sky.klokke = async () => HENG;
    const før = listeKall(sky).length;
    await page.reload();
    await expect(page.locator('.trip')).toHaveCount(1, { timeout: 30_000 });
    await expect.poll(() => listeKall(sky).length, { timeout: 15_000 }).toBeGreaterThan(før);
    const t0 = Date.now();
    await expect(page.getByText(FEIL)).toBeVisible({ timeout: 20_000 });
    expect(Date.now() - t0).toBeGreaterThan(4000);
    await expect(rader(page)).toHaveCount(0);
    await expect(page.locator('#toast')).toBeHidden();
  });
  test('AK14: svar som aldri kommer gir ingenting når nettleseren aldri har fått svar', async ({ page }) => {
    test.setTimeout(90_000);
    const sky = lagSky({ trips: [tur('2026-09-20T07:00:00Z')], klokke: async () => HENG });
    await start(page, sky);
    await ventListe(sky);
    await page.waitForTimeout(10_000);
    await expect(page.getByText(FEIL)).toHaveCount(0);
    await expect(boks(page)).toBeHidden();
    await expect(page.locator('#toast')).toBeHidden();
    await expect(page.locator('.trip')).toHaveCount(1);
  });

  // AK15: start_date (UTC) brukes, aldri start_date_local.
  test('AK15: egen tur 2 minutter etter start_date skjuler aktiviteten', async ({ page }) => {
    const sky = lagSky({ trips: [tur('2026-10-18T06:02:00Z')], klokke: klokkeMed([A, B]) });
    await start(page, sky);
    await expect(nyeRader(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(rad(page, B.id)).toHaveCount(1);
    await expect(rad(page, A.id)).toHaveCount(0);
  });
  test('AK15: egen tur på den lokale tiden (2 timer feil i UTC) skjuler ikke aktiviteten', async ({ page }) => {
    const sky = lagSky({ trips: [tur('2026-10-18T08:00:00Z')], klokke: klokkeMed([A, B]) });
    await start(page, sky);
    await expect(nyeRader(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(rad(page, A.id)).toHaveCount(1);
  });

  // AK16: seasonStart gir 1. august kl. 00:00 norsk tid, og den datoen sendes som oldest.
  test('AK16: seasonStart og oldest følger kontrollpunktene', async ({ page }) => {
    const sky = lagSky({ klokke: klokkeMed([]) });
    await page.clock.setFixedTime(new Date('2026-07-31T22:30:00Z'));
    await start(page, sky);
    await ventListe(sky);
    expect(listeKall(sky)[0].sok.get('oldest')).toBe('2026-08-01');
    const punkter = [['2026-10-21T12:00:00Z', 2026], ['2026-08-01T12:00:00Z', 2026], ['2026-07-31T12:00:00Z', 2025], ['2027-02-10T12:00:00Z', 2026], ['2026-07-31T22:30:00Z', 2026]];
    for (const [now, år] of punkter) {
      const s = await page.evaluate(now => { const v = seasonStart(new Date(now)); return typeof v === 'string' ? v : new Date(v).toISOString(); }, now);
      // Enten datoen «YYYY-08-01» eller tidspunktet 1. august kl. 00:00 norsk tid (sommertid, UTC+2).
      expect(s, now).toBe(s.length === 10 ? `${år}-08-01` : `${år}-07-31T22:00:00.000Z`);
    }
  });

  // AK17: En tur med samme source_id finnes allerede: norsk melding, ingen dobbel tur, ingen rypetreff.
  test('AK17: dobbel source_id gir «Turen er allerede lagt inn» og ingen dobbel tur', async ({ page }) => {
    const sky = lagSky({ klokke: klokkeMed([A]) });
    await start(page, sky);
    await rad(page, A.id).getByRole('button', { name: 'Legg inn' }).click({ timeout: 15_000 });
    await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
    // Lagret i en annen fane mens dialogen var åpen.
    sky.db.trips.push(tur(A.start_date, { source_id: A.id, name: 'Fra den andre fanen' }));
    await page.locator('#tSave').click();
    await expect(page.getByText('Turen er allerede lagt inn')).toBeVisible({ timeout: 30_000 });
    expect(sky.db.trips.filter(t => t.source_id === A.id)).toHaveLength(1);
    expect(sky.db.observations).toHaveLength(0);
    expect(sky.kall.some(k => k.metode === 'POST' && k.sti === '/rest/v1/trips')).toBe(true);
  });

  // AK18: Skjulte turer kan vises og hentes tilbake.
  test('AK18: «Vis skjulte turer (N)» viser skjulte turer, og «Hent tilbake» gjør dem nye igjen', async ({ page }) => {
    const sky = lagSky({ skip: [{ owner: EIER.id, source_id: A.id, created_at: '2026-10-19T10:00:00Z' }], klokke: klokkeMed([A]) });
    await start(page, sky);
    const lenke = boks(page).getByText('Vis skjulte turer (1)');
    await expect(lenke).toBeVisible({ timeout: 15_000 });
    await expect(nyeRader(page)).toHaveCount(0);
    await expect(boks(page).getByRole('button', { name: 'Legg inn' })).toHaveCount(0);
    await lenke.click();
    await expect(rad(page, A.id)).toHaveCount(1);
    await expect(rad(page, A.id)).toContainText('08:00');
    await expect(rad(page, A.id)).toContainText(/\b18\b/);
    await expect(rad(page, A.id)).toContainText(/8,4\d? km/);
    await rad(page, A.id).getByRole('button', { name: 'Hent tilbake' }).click();
    await expect.poll(() => sky.db.import_skip).toEqual([]);
    expect(sky.kall.some(k => k.metode === 'DELETE' && k.sti === '/rest/v1/import_skip')).toBe(true);
    await expect(nyeRader(page)).toHaveCount(1);
    await expect(rad(page, A.id).getByRole('button', { name: 'Legg inn' })).toBeVisible();
    await expect(rad(page, A.id).getByRole('button', { name: 'Ikke jakt' })).toBeVisible();
  });
  test('AK18: lenken vises også sammen med nye turer', async ({ page }) => {
    const sky = lagSky({ skip: [{ owner: EIER.id, source_id: A.id, created_at: '2026-10-19T10:00:00Z' }], klokke: klokkeMed([A, B]) });
    await start(page, sky);
    await expect(nyeRader(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(rad(page, B.id)).toHaveCount(1);
    await expect(boks(page).getByText('Vis skjulte turer (1)')).toBeVisible();
  });

  // AK19: En hel runde gjennom boksen uten JavaScript-feil (afterEach sjekker pageerror i alle app-testene).
  test('AK19: ingen JavaScript-feil gjennom legg inn, lukk, ikke jakt og hent tilbake', async ({ page }) => {
    const sky = lagSky({ klokke: klokkeMed([A, B]) });
    await start(page, sky);
    await rad(page, A.id).getByRole('button', { name: 'Legg inn' }).click({ timeout: 15_000 });
    await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
    await page.locator('#tripModal [data-close]').first().click();
    await rad(page, B.id).getByRole('button', { name: 'Ikke jakt' }).click();
    await boks(page).getByText('Vis skjulte turer (1)').click();
    await rad(page, B.id).getByRole('button', { name: 'Hent tilbake' }).click();
    await expect(nyeRader(page)).toHaveCount(2);
    expect(errors).toEqual([]);
  });
});

/* ---------- handleren i Node ---------- */
const HANDLER = new URL('../../supabase/functions/klokke/handler.js', import.meta.url);
async function lastHandler() {
  const mod = await import(HANDLER.href);
  const fn = mod.handle || mod.default;
  if (typeof fn !== 'function') throw new Error('handler.js eksporterer ingen funksjon (handle eller default)');
  return fn;
}
const ENV = { INTERVALS_API_KEY: NOKKEL, INTERVALS_OWNER_EMAIL: 'din@epost.no' };
const BRUKERE = { 'eier-token': 'din@epost.no', 'eier-store': 'DIN@Epost.NO', 'kompis-token': 'kompis@epost.no' };
// Som sb.auth.getUser(token) i supabase-js: { data: { user }, error }.
function lagGetUser() {
  const tokens = [];
  const getUser = async token => {
    tokens.push(token);
    const email = BRUKERE[token];
    return email ? { data: { user: { id: crypto.randomUUID(), email } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT', status: 401 } };
  };
  return { getUser, tokens };
}
const AKTIVITETER = [
  { id: 'i800001', type: 'Hike', start_date: '2026-10-18T06:00:00Z', start_date_local: '2026-10-18T08:00:00', distance: 8400, name: 'Tur' },
  { id: 'i800002', type: 'Ride', start_date: '2026-10-17T06:00:00Z', start_date_local: '2026-10-17T08:00:00', distance: 30000, name: 'Sykkel' },
  { id: 'i800003', type: 'Hike', start_date: '2026-10-12T05:30:00Z', start_date_local: '2026-10-12T07:30:00', distance: 5200, name: 'Tur 2' },
  { id: 'i800004', type: 'Run', start_date: '2026-10-10T16:00:00Z', start_date_local: '2026-10-10T18:00:00', distance: 10000, name: 'Løp' },
];
const HFIT = makeFit(Date.parse('2026-10-18T06:00:00Z'));
// Falsk fetch for intervals.icu. Registrerer alle kall.
function lagFetch({ fil = HFIT } = {}) {
  const kall = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
    const headers = new Headers(init.headers ?? (typeof input === 'object' && input.headers) ?? {});
    kall.push({ url, headers, method: init.method ?? (typeof input === 'object' && input.method) ?? 'GET' });
    if (url.hostname !== 'intervals.icu') return new Response('ukjent', { status: 404 });
    if (/^\/api\/v1\/athlete\/0\/activities$/.test(url.pathname)) return new Response(JSON.stringify(AKTIVITETER), { status: 200, headers: { 'content-type': 'application/json' } });
    if (/^\/api\/v1\/activity\/[\w-]+\/file$/.test(url.pathname)) return new Response(fil, { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    return new Response('ukjent', { status: 404 });
  };
  return { fetch, kall };
}
const BASE = 'https://prosjekt.supabase.co/functions/v1/klokke';
const req = (sok, { headers = {}, method = 'GET', body } = {}) => new Request(`${BASE}${sok}`, { method, headers: { origin: 'https://nordmo.github.io', ...headers }, body });
async function kjør(request, { fetch = lagFetch(), getUser = lagGetUser() } = {}) {
  const handle = await lastHandler();
  const res = await handle(request, fetch.fetch, getUser.getUser, ENV);
  return { res, fetch, getUser };
}

test.describe('handleren', () => {
  // AK10: Listen hentes fra intervals.icu med basic auth og oldest, og svaret har bare Hike uten nøkkelen.
  test('AK10: liste kaller activities med basic auth og oldest, og gir bare Hike', async () => {
    const { res, fetch, getUser } = await kjør(req('?oldest=2026-08-01', { headers: { authorization: 'Bearer eier-token' } }));
    expect(res.status).toBe(200);
    expect(getUser.tokens).toEqual(['eier-token']);
    const ut = fetch.kall.filter(k => k.url.hostname === 'intervals.icu');
    expect(ut).toHaveLength(1);
    expect(ut[0].method.toUpperCase()).toBe('GET');
    expect(ut[0].url.pathname).toBe('/api/v1/athlete/0/activities');
    expect(ut[0].url.searchParams.get('oldest')).toBe('2026-08-01');
    expect(ut[0].headers.get('authorization')).toBe('Basic ' + Buffer.from(`API_KEY:${NOKKEL}`).toString('base64'));
    const tekst = await res.text();
    expect(tekst).not.toContain(NOKKEL);
    expect(tekst).not.toContain(Buffer.from(`API_KEY:${NOKKEL}`).toString('base64'));
    const liste = JSON.parse(tekst);
    expect(Array.isArray(liste)).toBe(true);
    expect(liste.map(a => a.id).sort()).toEqual(['i800001', 'i800003']);
    for (const a of liste) {
      const kilde = AKTIVITETER.find(x => x.id === a.id);
      expect(a.start_date).toBe(kilde.start_date);
      expect(a.distance).toBe(kilde.distance);
    }
  });

  // AK11: Fila hentes fra activity/{id}/file og sendes som rå FIT, både gzip-pakket og upakket fra intervals.icu.
  for (const [navn, fil] of [['gzip-pakket', gzipSync(HFIT)], ['upakket', HFIT]]) {
    test(`AK11: fil kaller activity/{id}/file og gir rå FIT (${navn})`, async () => {
      const { res, fetch } = await kjør(req('?id=i800001', { headers: { authorization: 'Bearer eier-token' } }), { fetch: lagFetch({ fil }) });
      expect(res.status).toBe(200);
      const ut = fetch.kall.filter(k => k.url.hostname === 'intervals.icu');
      expect(ut).toHaveLength(1);
      expect(ut[0].url.pathname).toBe('/api/v1/activity/i800001/file');
      expect(ut[0].headers.get('authorization')).toBe('Basic ' + Buffer.from(`API_KEY:${NOKKEL}`).toString('base64'));
      const bytes = Buffer.from(await res.arrayBuffer());
      expect(bytes.equals(HFIT)).toBe(true);
    });
  }

  // AK12: Brukeren avgjøres bare av getUser(token). Ellers 401 eller 403, og intervals.icu kalles ikke.
  test('AK12: uten Authorization gir 401', async () => {
    const { res, fetch } = await kjør(req('?oldest=2026-08-01'));
    expect(res.status).toBe(401);
    expect(fetch.kall.filter(k => k.url.hostname === 'intervals.icu')).toEqual([]);
  });
  test('AK12: token som getUser avviser gir 401', async () => {
    const { res, fetch, getUser } = await kjør(req('?oldest=2026-08-01', { headers: { authorization: 'Bearer ugyldig' } }));
    expect(res.status).toBe(401);
    expect(getUser.tokens).toEqual(['ugyldig']);
    expect(fetch.kall.filter(k => k.url.hostname === 'intervals.icu')).toEqual([]);
  });
  test('AK12: gyldig token for en annen e-post gir 403', async () => {
    const { res, fetch } = await kjør(req('?oldest=2026-08-01', { headers: { authorization: 'Bearer kompis-token' } }));
    expect(res.status).toBe(403);
    expect(fetch.kall.filter(k => k.url.hostname === 'intervals.icu')).toEqual([]);
  });
  test('AK12: eierens e-post i header, parameter eller body uten gyldig token gir 401', async () => {
    const forsøk = [
      req('?oldest=2026-08-01', { headers: { 'x-user-email': 'din@epost.no', email: 'din@epost.no' } }),
      req('?oldest=2026-08-01&email=din@epost.no'),
      req('?oldest=2026-08-01', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'din@epost.no', user: { email: 'din@epost.no' } }) }),
      req('?oldest=2026-08-01&email=din@epost.no', { headers: { authorization: 'Bearer ugyldig', 'x-user-email': 'din@epost.no' } }),
    ];
    for (const r of forsøk) {
      const { res, fetch } = await kjør(r);
      expect(res.status, r.url).toBe(401);
      expect(fetch.kall.filter(k => k.url.hostname === 'intervals.icu')).toEqual([]);
    }
  });
  test('AK12: e-posten sammenlignes uten forskjell på store og små bokstaver', async () => {
    const { res, fetch } = await kjør(req('?oldest=2026-08-01', { headers: { authorization: 'Bearer eier-store' } }));
    expect(res.status).toBe(200);
    expect(fetch.kall.filter(k => k.url.hostname === 'intervals.icu')).toHaveLength(1);
  });

  // AK13: CORS for nordmo.github.io og localhost, med listen øverst i handler.js.
  test('AK13: OPTIONS fra tillatte adresser gir CORS-hoder for den adressen', async () => {
    for (const origin of ['https://nordmo.github.io', 'http://localhost:8000']) {
      const { res, fetch } = await kjør(new Request(BASE + '?oldest=2026-08-01', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization, apikey, x-client-info, content-type' } }));
      expect(res.status, origin).toBeGreaterThanOrEqual(200);
      expect(res.status, origin).toBeLessThan(300);
      expect(res.headers.get('access-control-allow-origin'), origin).toBe(origin);
      const tillatt = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
      for (const h of ['authorization', 'apikey', 'x-client-info', 'content-type']) expect(tillatt, `${origin} ${h}`).toContain(h);
      expect(fetch.kall).toEqual([]);
    }
    // Vanlige svar har også hodet, ellers kan ikke appen lese dem.
    const { res } = await kjør(req('?oldest=2026-08-01', { headers: { authorization: 'Bearer eier-token' } }));
    expect(res.headers.get('access-control-allow-origin')).toBe('https://nordmo.github.io');
    // En fremmed adresse får ikke sin egen adresse tilbake.
    const { res: fremmed } = await kjør(new Request(BASE, { method: 'OPTIONS', headers: { origin: 'https://ond.example', 'access-control-request-method': 'GET' } }));
    expect(fremmed.headers.get('access-control-allow-origin')).not.toBe('https://ond.example');
    // Listen står øverst i handler.js, med kommentar om eget domene (CNAME).
    const kilde = readFileSync(HANDLER, 'utf8'), topp = kilde.split('\n').slice(0, 25).join('\n');
    expect(topp).toContain('https://nordmo.github.io');
    expect(topp).toMatch(/CNAME/);
  });
});
