import { test, expect, startLocal } from '../helpers/oppstart.js';
import { gzipSync } from 'node:zlib';
import { Encoder, Profile } from '@garmin/fitsdk';

// Akseptansetester for docs/specs/fit-filer.md. Kjører i lokal modus med de tre eksempelturene.
// FIT-fila lages her med oppdiktede koordinater. Ingen ekte spor i repoet.
/* global Local, state, isPending, buildTrack, parseGPX -- globale i index.html, brukes inne i page.evaluate */

const T0 = Date.parse('2025-10-04T07:00:00Z');
const N = 400, STEP = 3000; // 400 punkter, 3 s mellom dem (20 minutter)
const MANUAL = [T0 + 300_000, T0 + 750_000]; // to Lap-trykk
const AUTO = T0 + 960_000; // automatisk runde (distanse)
const END = T0 + (N - 1) * STEP; // siste runde, sessionEnd
const sc = d => Math.round(d * 2 ** 31 / 180);
const pt = i => ({ lat: 69.62 + i * 0.00004, lon: 18.98 + i * 0.00006 + Math.sin(i / 15) * 0.0002, ele: 120 + i * 0.6, hr: 110 + (i % 30) });

function makeFit() {
  const e = new Encoder(), d = ms => new Date(ms);
  e.onMesg(Profile.MesgNum.FILE_ID, { manufacturer: 'development', product: 1, timeCreated: d(T0), type: 'activity' });
  for (let i = 0; i < N; i++) {
    const p = pt(i);
    e.onMesg(Profile.MesgNum.RECORD, { timestamp: d(T0 + i * STEP), positionLat: sc(p.lat), positionLong: sc(p.lon), enhancedAltitude: p.ele, heartRate: p.hr });
  }
  const ends = [[MANUAL[0], 'manual'], [MANUAL[1], 'manual'], [AUTO, 'distance'], [END, 'sessionEnd']];
  let start = T0;
  for (const [end, lapTrigger] of ends) {
    const s = (end - start) / 1000;
    e.onMesg(Profile.MesgNum.LAP, { timestamp: d(end), startTime: d(start), totalElapsedTime: s, totalTimerTime: s, lapTrigger });
    start = end;
  }
  const tot = (END - T0) / 1000;
  e.onMesg(Profile.MesgNum.SESSION, { timestamp: d(END), startTime: d(T0), totalElapsedTime: tot, totalTimerTime: tot, sport: 'hiking' });
  e.onMesg(Profile.MesgNum.ACTIVITY, { timestamp: d(END), numSessions: 1, type: 'manual', totalTimerTime: tot });
  return Buffer.from(e.close());
}
const FIT = makeFit();

const iso = ms => new Date(ms).toISOString();
const GPX = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>GPX-test</name><trkseg>${
  Array.from({ length: 50 }, (_, i) => { const p = pt(i * 8); return `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele><time>${iso(T0 + i * 24000)}</time></trkpt>`; }).join('')}</trkseg></trk></gpx>`;
const TCX = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Other"><Id>${iso(T0)}</Id><Lap StartTime="${iso(T0)}"><TotalTimeSeconds>1200</TotalTimeSeconds><TriggerMethod>Manual</TriggerMethod><Track>${
  Array.from({ length: 50 }, (_, i) => { const p = pt(i * 8); return `<Trackpoint><Time>${iso(T0 + i * 24000)}</Time><Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lon}</LongitudeDegrees></Position><AltitudeMeters>${p.ele}</AltitudeMeters></Trackpoint>`; }).join('')}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;

let errors, fitsdkRequests;
test.beforeEach(async ({ page }) => {
  errors = []; fitsdkRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/@garmin\/fitsdk/.test(r.url())) fitsdkRequests.push(r.url()); });
  // Vær er ikke en del av denne specen. Uten svar blir turen lagret uten værdata, og testen blir rask og lik hver gang.
  await page.route(/open-meteo\.com/, r => r.abort());
  await startLocal(page);
  await expect(page.locator('.trip')).toHaveCount(3, { timeout: 30_000 });
});
test.afterEach(() => expect(errors).toEqual([]));

const choose = (page, name, buffer, mimeType = 'application/octet-stream') => page.locator('#gpxInput').setInputFiles({ name, mimeType, buffer });
const summary = page => page.locator('#tSummary');
async function chooseAndSave(page, buffer) {
  await choose(page, 'tur.fit', buffer);
  await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
  await page.locator('#tSave').click();
  await expect(page.locator('#playBtn')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#tripModal')).toBeHidden();
  return page.evaluate(async () => {
    const id = state.trip.id, obs = await Local.listObs(id);
    return { id, obs: obs.map(o => ({ kind: o.kind, pending: isPending(o), seen: Date.parse(o.seen_at), lat: o.lat, lon: o.lon })) };
  });
}
// Avstand i meter fra et punkt til nærmeste punkt i det oppdiktede sporet.
const distToTrack = (lat, lon) => Math.min(...Array.from({ length: N }, (_, i) => { const p = pt(i); return Math.hypot((p.lat - lat) * 111320, (p.lon - lon) * 111320 * Math.cos(lat * Math.PI / 180)); }));

function expectTwoHits(obs) {
  const rype = obs.filter(o => o.kind === 'rype');
  expect(rype).toHaveLength(2);
  expect(rype.every(o => o.pending)).toBe(true);
  const times = rype.map(o => o.seen).sort((a, b) => a - b);
  MANUAL.forEach((ms, i) => expect(Math.abs(times[i] - ms)).toBeLessThanOrEqual(3000));
  for (const o of rype) expect(distToTrack(o.lat, o.lon)).toBeLessThan(30);
}

// AK1: FIT-fila åpner turdialogen med km, høydemeter og to rundetrykk.
test('AK1: FIT-fil åpner turdialogen med km, høydemeter og 2 rundetrykk', async ({ page }) => {
  await choose(page, 'tur.fit', FIT);
  await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
  await expect(summary(page)).toContainText('km');
  await expect(summary(page)).toContainText('høydemeter');
  await expect(summary(page)).toContainText('2 trykk på rundeknappen blir rypetreff du fyller ut');
});

// AK2: Lagret tur har nøyaktig to rypetreff som venter, på riktig tid og på sporet.
test('AK2: lagret FIT-tur får 2 rypetreff på riktig tid og sted', async ({ page }) => {
  const { obs } = await chooseAndSave(page, FIT);
  expectTwoHits(obs);
});

// AK3: Automatisk runde og sessionEnd gir ingen rypetreff.
test('AK3: automatisk runde og sessionEnd gir ingen rypetreff', async ({ page }) => {
  const { obs } = await chooseAndSave(page, FIT);
  expect(obs).toHaveLength(2);
  for (const o of obs) {
    expect(Math.abs(o.seen - AUTO)).toBeGreaterThan(60_000);
    expect(Math.abs(o.seen - END)).toBeGreaterThan(60_000);
  }
});

// AK4: Samme fil gzip-pakket gir samme dialog og samme rypetreff.
test('AK4: gzip-pakket FIT gir samme resultat', async ({ page }) => {
  const gz = gzipSync(FIT);
  await choose(page, 'tur.fit', gz);
  await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
  await expect(summary(page)).toContainText('2 trykk på rundeknappen blir rypetreff du fyller ut');
  await page.locator('#tripModal [data-close]').first().click();
  await expect(page.locator('#tripModal')).toBeHidden();
  const { obs } = await chooseAndSave(page, gz);
  expectTwoHits(obs);
});

// AK5: Etter ny lasting har turen samme distanse, og sporet er lagret som TCX med høyde og puls.
test('AK5: lagret FIT-tur er TCX med høyde og puls og samme distanse etter ny lasting', async ({ page }) => {
  // Testen lagrer, laster siden på nytt og åpner turen. Det tar lang tid når maskinen er treg.
  test.setTimeout(120_000);
  const { id } = await chooseAndSave(page, FIT);
  const before = await page.evaluate(id => Local.getTrip(id).then(t => t.distance_m), id);
  await page.reload();
  // Innloggingsskjermen vises bare når supabase-js er lastet fra CDN. Uten den går appen rett i lokal modus.
  const local = page.locator('#lLocal');
  await expect(local.or(page.locator('.trip').first())).toBeVisible({ timeout: 30_000 });
  if (await local.isVisible()) await local.click();
  await expect(page.locator('.trip')).toHaveCount(4, { timeout: 30_000 });
  await page.locator(`.trip[data-id="${id}"]`).click();
  await expect(page.locator('#playBtn')).toBeVisible({ timeout: 30_000 });
  const after = await page.evaluate(async id => {
    const t = await Local.getTrip(id);
    return { gpx: t.gpx, total: state.T.total, rebuilt: buildTrack(parseGPX(t.gpx)).total, open: state.trip.id };
  }, id);
  expect(after.open).toBe(id);
  expect(after.gpx).toContain('TrainingCenterDatabase');
  expect(after.gpx).toContain('<AltitudeMeters>');
  expect(after.gpx).toContain('<HeartRateBpm>');
  expect(Math.abs(after.total - before)).toBeLessThan(1);
  expect(Math.abs(after.rebuilt - before)).toBeLessThan(1);
});

// AK6: Ugyldig .fit gir norsk feilmelding, og ingenting lagres.
test('AK6: ugyldig .fit gir norsk feilmelding og ingen tur', async ({ page }) => {
  await choose(page, 'tur.fit', Buffer.from('dette er ikke en FIT-fil, bare tekst med feil endelse'));
  await expect(page.locator('#toast')).toBeVisible({ timeout: 30_000 });
  // Meldingen skal handle om FIT, ikke bare være dagens «Bruk en .gpx- eller .tcx-fil».
  await expect(page.locator('#toast')).toContainText(/fil/i);
  await expect(page.locator('#toast')).toContainText(/fit/i);
  await expect(page.locator('#toast')).not.toContainText(/error|invalid|undefined/i);
  await expect(page.locator('#tripModal')).toBeHidden();
  expect(await page.evaluate(() => Local.listTrips().then(l => l.length))).toBe(3);
});

// AK7: Uten valgt FIT-fil hentes ikke biblioteket. Det hentes først når en FIT-fil velges.
test('AK7: @garmin/fitsdk hentes ikke før en FIT-fil er valgt', async ({ page }) => {
  await page.locator('.trip').first().click();
  await expect(page.locator('#playBtn')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  expect(fitsdkRequests).toEqual([]);
  await choose(page, 'tur.fit', FIT);
  await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
  expect(fitsdkRequests.length).toBeGreaterThan(0);
});

// AK8: GPX og TCX virker som før, og filvelgeren tar fortsatt imot dem (i tillegg til .fit).
test('AK8: GPX- og TCX-filer åpner turdialogen som før', async ({ page }) => {
  const accept = await page.locator('#gpxInput').getAttribute('accept');
  for (const ext of ['.gpx', '.tcx', '.fit']) expect(accept).toContain(ext);
  for (const [name, text, type] of [['tur.gpx', GPX, 'application/gpx+xml'], ['tur.tcx', TCX, 'application/vnd.garmin.tcx+xml']]) {
    await choose(page, name, Buffer.from(text), type);
    await expect(page.locator('#tripModal')).toBeVisible({ timeout: 30_000 });
    await expect(summary(page)).toContainText('km');
    await page.locator('#tripModal [data-close]').first().click();
    await expect(page.locator('#tripModal')).toBeHidden();
  }
  expect(fitsdkRequests).toEqual([]);
});
