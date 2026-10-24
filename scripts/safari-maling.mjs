#!/usr/bin/env node
// Måler halen (route-tail) i ekte Safari, for AK1–AK5 i docs/specs/rute-hale-webgl.md. Kjøres lokalt av Martin før merge,
// og på nytt når MapLibre oppgraderes (Fallgruver i CLAUDE.md). Krever «Tillat fjernautomatisering» i Safari
// (eller `sudo safaridriver --enable`).
//
// Bruk: node scripts/safari-maling.mjs <spor.gpx> [--ut <mappe>]
//
// Starter safaridriver og to lokale servere: denne arbeidskopien og index.html fra origin/main. Måler begge i samme økt:
//   AK1 (3D) og AK2 (2D): 40 s avspilling med følgekamera. Avstanden langs sporet fra markøren til enden av halen, og
//        hullet fra enden av den tegnede route-done (querySourceFeatures) til starten av halen, høyst 1 sporpunkt i
//        minst 0.98 av bildene i 3D og 0.99 i 2D.
//   AK3: bildefrekvensen i 3D og 2D er minst 0.95 av main.
//   AK4: skjermbilde av skjøten mellom route-done og halen på tre steder (flatt, bratt opp, bratt ned). Bredden på
//        tvers av linjen 10 px på hver side av skjøten skiller høyst 1 px, og fargen høyst 8 per kanal.
//   AK5: de seks stedene der halen ligger bak terreng sett fra følgekameraet (0.23, 0.24, 0.77, 0.78, 0.82, 0.84 av
//        turen). Fasit er route-done tegnet helt fram. Av pikslene halen ville hatt uten dybdetest og som fasiten ikke
//        har, er minst 90 % skjult (0.9), og høyst 15 % (0.15) av fasitens piksler mangler.
// Skjermbildene og en JSON med alle tallene lagres i --ut (standard: en ny mappe i systemets temp-mappe).
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2), GPX = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--ut');
if (!GPX) { console.error('Bruk: node scripts/safari-maling.mjs <spor.gpx> [--ut <mappe>]'); process.exit(2); }
const UT = args.includes('--ut') ? resolve(args[args.indexOf('--ut') + 1]) : mkdtempSync(join(tmpdir(), 'safari-maling-'));
mkdirSync(UT, { recursive: true });
const ROT = resolve(new URL('..', import.meta.url).pathname), WD = 4445, P_GREN = 8765, P_MAIN = 8766;
const SPOTS = [0.23, 0.24, 0.77, 0.78, 0.82, 0.84], GRENSE = { andel3D: 0.98, andel: 0.99, fps: 0.95, bredde: 1, farge: 8, skjult: 0.9, mangler: 0.15 };

/* ---------- servere og safaridriver ---------- */
const barn = [];
const start = (cmd, a, cwd) => { const p = spawn(cmd, a, { cwd, stdio: 'ignore' }); barn.push(p); return p; };
const rydd = () => { for (const p of barn) try { p.kill(); } catch { /* allerede stoppet */ } };
process.on('exit', rydd); process.on('SIGINT', () => process.exit(130));
const mainDir = mkdtempSync(join(tmpdir(), 'safari-maling-main-'));
writeFileSync(join(mainDir, 'index.html'), execFileSync('git', ['show', 'origin/main:index.html'], { cwd: ROT }));
start('python3', ['-m', 'http.server', String(P_GREN), '--bind', '127.0.0.1'], ROT);
start('python3', ['-m', 'http.server', String(P_MAIN), '--bind', '127.0.0.1'], mainDir);
start('safaridriver', ['-p', String(WD)]);
const vent = async (url, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { await fetch(url); return; } catch { await new Promise(r => setTimeout(r, 200)); } } throw new Error('svarer ikke: ' + url); };
await vent(`http://127.0.0.1:${P_GREN}/index.html`); await vent(`http://127.0.0.1:${P_MAIN}/index.html`); await vent(`http://127.0.0.1:${WD}/status`);

/* ---------- WebDriver ---------- */
const wd = async (m, p, b) => { const r = await fetch(`http://127.0.0.1:${WD}${p}`, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const x = await r.json(); if (x.value && x.value.error) throw new Error(`${x.value.error}: ${x.value.message}`); return x.value; };
async function okt(port) {
  let s;
  try { s = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } }); }
  catch (e) { if (/remote automation/i.test(e.message)) { console.error('Slå på «Tillat fjernautomatisering» i Safari (Utvikler-menyen), eller kjør: sudo safaridriver --enable'); process.exit(2); } throw e; }
  const S = p => `/session/${s.sessionId}${p}`, ex = (script, a = []) => wd('POST', S('/execute/sync'), { script, args: a }), exa = (script, a = []) => wd('POST', S('/execute/async'), { script, args: a });
  await wd('POST', S('/timeouts'), { script: 280000, pageLoad: 60000 });
  await wd('POST', S('/window/rect'), { width: 1280, height: 820, x: 0, y: 0 });
  await wd('POST', S('/url'), { url: `http://127.0.0.1:${port}/` });
  const til = async f => { const t = Date.now(); while (Date.now() - t < 30000) { if (await ex(`return !!(${f})`)) return; await new Promise(r => setTimeout(r, 300)); } throw new Error('venter på ' + f); };
  await til("document.querySelector('#lLocal')&&document.querySelector('#lLocal').offsetParent");
  await ex("document.querySelector('#lLocal').click()");
  await til("document.querySelector('.trip')");
  const info = await exa(`const [gpx,done]=arguments;(async()=>{const id=crypto.randomUUID();await Local.saveTrip({id,name:'Safari-måling',started_at:new Date().toISOString(),gpx,conditions:{}},true);await openTrip(id);await mapIdle(30000);done({n:state.T.n,km:+(state.T.total/1000).toFixed(2),workers:maplibregl.getWorkerCount(),tail:!!map.getLayer('route-tail'),safari:navigator.userAgent.match(/Version\\/([\\d.]+)/)?.[1]});})().catch(e=>done({feil:String(e)}));`, [readFileSync(GPX, 'utf8')]);
  if (info.feil) throw new Error(info.feil);
  return { ex, exa, info, slutt: () => wd('DELETE', S('')) };
}

/* ---------- i siden ---------- */
// Felles hjelpere: nærmeste sporpunkt nær en indeks, tegnet ende av route-done, kamera som i tick, og oransje piksler.
const HJELP = `window.__m=window.__m||(()=>{const T=()=>state.T;
const naer=(lon,lat,a,bak=900,frem=60)=>{const t=T(),k=Math.cos(lat*Math.PI/180);let b=Infinity,bi=a;for(let i=Math.max(0,a-bak);i<=Math.min(t.n-1,a+frem);i++){const dx=(t.pts[i].lon-lon)*k,dy=t.pts[i].lat-lat,s=dx*dx+dy*dy;if(s<b){b=s;bi=i;}}return bi;};
const ende=(kilder,a)=>{let m=-1;for(const id of kilder){if(!map.getSource(id))continue;for(const f of map.querySourceFeatures(id)){const g=f.geometry,ls=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];for(const c of ls)for(const e of [c[0],c[c.length-1]])m=Math.max(m,naer(e[0],e[1],a));}}return m;};
const kamera=p=>{let tg=camFor('follow',p);tg=applyAdj(tg,chooseAdj({cam:tg,tg:viewTargets(p)},null,ZERO_ADJ));map._elevationFreeze=false;map.jumpTo(tg);state.cam=tg;state.camDirty=false;};
const ro=async()=>{await mapIdle(20000);await new Promise(r=>setTimeout(r,1000));await mapIdle(20000);for(let k=0;k<3;k++)await new Promise(r=>{map.once('render',r);map.triggerRepaint();});};
const maske=(lls,pad=14)=>{const mc=map.getCanvas(),dpr=mc.width/mc.clientWidth,sp=lls.map(l=>map.project(l));let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of sp){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}
 x0=Math.max(0,Math.floor((x0-pad)*dpr));y0=Math.max(0,Math.floor((y0-pad)*dpr));x1=Math.min(mc.width-1,Math.ceil((x1+pad)*dpr));y1=Math.min(mc.height-1,Math.ceil((y1+pad)*dpr));
 const w=Math.max(1,x1-x0+1),h=Math.max(1,y1-y0+1),c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.drawImage(mc,-x0,-y0);const d=g.getImageData(0,0,w,h).data,m=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++){const r=d[i*4],gg=d[i*4+1],b=d[i*4+2];m[i]=r>205&&gg>135&&gg<215&&b<120&&r-b>110?1:0;}return {m,w,h,png:c.toDataURL('image/png')};};
const dil=(M,r=2)=>{const o=new Uint8Array(M.w*M.h);for(let y=0;y<M.h;y++)for(let x=0;x<M.w;x++)if(M.m[y*M.w+x])for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const yy=y+dy,xx=x+dx;if(yy>=0&&yy<M.h&&xx>=0&&xx<M.w)o[yy*M.w+xx]=1;}return o;};
return {naer,ende,kamera,ro,maske,dil};})();`;

// 40 s avspilling med følgekamera. medTail: mål gapet mot route-tail (grenen), ellers bare tegnet ende (main).
const SPILL = `const [modus,done]=arguments;(async()=>{${HJELP}const M=window.__m,T=state.T;
if(modus==='2D'&&map.getTerrain()){setTerrain(false);await new Promise(r=>setTimeout(r,1500));}
if(modus==='3D'&&!map.getTerrain()){setTerrain(true);await new Promise(r=>setTimeout(r,1500));}
state.duration=40;setCamMode('follow',{quiet:true});setProgress(0,true);state.cam=camFor('follow',0);map.jumpTo(state.cam);state.camDirty=false;await mapIdle(30000);
const tail=map.getLayer('route-tail'),f=[],gap=[],hull=[],gapM=[];
const paa=()=>{f.push(performance.now());const d=state.progress*T.total,a=locate(T,d)[0];
 if(tail){const L=tail.implementation.last,de=M.ende(['route-done'],a);
  if(!L){gap.push(a-Math.max(de,0));hull.push(0);}else{gap.push(Math.abs(a-locate(T,L.p*T.total)[0]));hull.push(Math.max(0,L.i0-de));}}
 else{const e=M.ende(['route-head','route-done'],a);if(e>=0)gapM.push(T.cum[a]-T.cum[e]);}};
map.on('render',paa);const t0=performance.now();setPlaying(true);while(state.playing)await new Promise(r=>setTimeout(r,250));map.off('render',paa);
const sek=(performance.now()-t0)/1000,q=(v,p)=>{if(!v.length)return null;const s=[...v].sort((x,y)=>x-y);return Math.round(s[Math.min(s.length-1,Math.floor(s.length*p))]);};
done({modus,fps:+(f.length/sek).toFixed(1),bilder:f.length,gapInnen1:gap.length?+(gap.filter(g=>g<=1).length/gap.length).toFixed(4):null,hullInnen1:hull.length?+(hull.filter(g=>g<=1).length/hull.length).toFixed(4):null,gapMaks:gap.length?Math.max(...gap):null,gapMeterMain:gapM.length?{median:q(gapM,.5),p90:q(gapM,.9),maks:q(gapM,1)}:null});
})().catch(e=>done({feil:String(e&&e.stack||e)}));`;

// AK4: skjøt mellom route-done og halen ved andel p. Halen er 30 punkter lang.
const SKJOT = `const [p,done]=arguments;(async()=>{${HJELP}const M=window.__m,T=state.T;if(!map.getTerrain()){setTerrain(true);await new Promise(r=>setTimeout(r,1500));}
setPlaying(false);setCamMode('follow',{quiet:true});setProgress(p,true);M.kamera(p);await M.ro();
const a=locate(T,p*T.total)[0],i0=Math.max(1,a-30);paintRoute(T.cum[i0]/T.total,true);RP.shown=i0;state.progress=p;await M.ro();
const mc=map.getCanvas(),dpr=mc.width/mc.clientWidth,c=document.createElement('canvas');c.width=mc.width;c.height=mc.height;const g=c.getContext('2d');g.drawImage(mc,0,0);const img=g.getImageData(0,0,c.width,c.height);
const px=(x,y)=>{const X=Math.round(x*dpr),Y=Math.round(y*dpr);if(X<0||Y<0||X>=img.width||Y>=img.height)return null;const k=(Y*img.width+X)*4;return [img.data[k],img.data[k+1],img.data[k+2]];};
const or=c=>!!c&&c[0]>205&&c[1]>135&&c[1]<215&&c[2]<120&&c[0]-c[2]>110;
// Bredden måles ved sporpunktet ca. 10 px fra skjøten langs sporet på hver side, på tvers av sporet der (ikke i en
// rett linje fra skjøten, som havner utenfor linjen der sporet svinger).
const pr=i=>map.project(new maplibregl.LngLat(T.pts[i].lon,T.pts[i].lat)),P=pr(i0);
const ved=retn=>{let i=i0;while(i+retn>0&&i+retn<T.n-1&&Math.hypot(pr(i).x-P.x,pr(i).y-P.y)<10)i+=retn;return i;};
const bredde=i=>{const m=pr(i),q=pr(i+1),Lq=Math.hypot(q.x-m.x,q.y-m.y)||1,ux=(q.x-m.x)/Lq,uy=(q.y-m.y)/Lq;let n=0,mid=null;for(let t=-14;t<=14;t+=1/dpr){const c=px(m.x-uy*t,m.y+ux*t);if(or(c)){n++;if(!mid||Math.abs(t)<Math.abs(mid.t))mid={t,c};}}return {b:n,farge:mid&&mid.c};};
// Median av tre målinger på hver side (ved 10 px og ett punkt før og etter), så ett målepunkt ikke avgjør.
const tre=i=>{const v=[i-1,i,i+1].map(bredde),b=v.map(x=>x.b).sort((x,y)=>x-y)[1];return v.find(x=>x.b===b);};
const done1=tre(ved(-1)),hale=tre(ved(1));const R=M.maske([P,pr(ved(1)),pr(ved(-1))].map(x=>map.unproject(x)),40);
paintRoute(state.progress,true);
done({p,grad:+(T.grade?T.grade[a]:0).toFixed(1),breddeDone:done1.b,breddeHale:hale.b,fargeDone:done1.farge,fargeHale:hale.farge,png:R.png});})().catch(e=>done({feil:String(e&&e.stack||e)}));`;

// AK5: halen bak terreng ved andel p, mot fasit (route-done tegnet helt fram).
const BAK = `const [p,done]=arguments;(async()=>{${HJELP}const M=window.__m,T=state.T,L=map.getLayer('route-tail').implementation;if(!map.getTerrain()){setTerrain(true);await new Promise(r=>setTimeout(r,1500));}
setPlaying(false);setCamMode('follow',{quiet:true});setProgress(p,true);M.kamera(p);
const a=locate(T,p*T.total)[0],i0=Math.max(0,a-RP.S),lls=[];for(let i=i0;i<=a;i++)lls.push(new maplibregl.LngLat(T.pts[i].lon,T.pts[i].lat));
L.skjul=true;paintRoute(p,true);await M.ro();const R=M.maske(lls);L.skjul=false;
paintRoute(T.cum[i0]/T.total,true);RP.shown=i0;state.progress=p;await M.ro();const X=M.maske(lls);
L.utenDybde=true;await M.ro();const U=M.maske(lls);L.utenDybde=false;
const Rd=M.dil(R),Xd=M.dil(X);let r=0,fX=0,fU=0,mangler=0;for(let i=0;i<R.m.length;i++){r+=R.m[i];if(X.m[i]&&!Rd[i])fX++;if(U.m[i]&&!Rd[i])fU++;if(R.m[i]&&!Xd[i])mangler++;}
paintRoute(state.progress,true);
done({p,fasit:r,falskSynlig:fX,utenDybde:fU,skjult:fU?+(1-fX/fU).toFixed(3):1,mangler:r?+(mangler/r).toFixed(3):0,R:R.png,X:X.png,U:U.png});})().catch(e=>done({feil:String(e&&e.stack||e)}));`;

const lagre = (navn, dataUrl) => { if (dataUrl) writeFileSync(join(UT, navn), Buffer.from(dataUrl.split(',')[1], 'base64')); };
const resultat = { gpx: resolve(GPX), ut: UT, main: {}, gren: {}, ak: {} };
try {
  /* main */
  const m = await okt(P_MAIN); resultat.main.info = m.info;
  for (const modus of ['3D', '2D']) resultat.main[modus] = await m.exa(SPILL, [modus]);
  await m.slutt();
  /* grenen */
  const g = await okt(P_GREN); resultat.gren.info = g.info;
  if (!g.info.tail) throw new Error('route-tail finnes ikke i denne arbeidskopien');
  for (const modus of ['3D', '2D']) resultat.gren[modus] = await g.exa(SPILL, [modus]);
  // AK4: tre steder etter stigning (flatt, bratt opp, bratt ned), mellom 10 % og 90 % av turen.
  const grad = await g.ex('const T=state.T,g=T.grade||[],v=[];for(let i=Math.floor(T.n*.1);i<T.n*.9;i+=5)v.push([i,g[i]||0]);return v.map(([i,x])=>[T.cum[i]/T.total,x]);');
  // Prøver opptil åtte kandidater per type, til skjøten synes (bredde > 0 på begge sider).
  const kand = f => [...grad].sort(f).slice(0, 8).map(x => x[0]);
  resultat.gren.skjot = [];
  for (const [navn, ps] of [['flatt', kand((x, y) => Math.abs(x[1]) - Math.abs(y[1]))], ['opp', kand((x, y) => y[1] - x[1])], ['ned', kand((x, y) => x[1] - y[1])]]) {
    let r = null;
    for (const p of ps) { r = await g.exa(SKJOT, [p]); if (r.breddeDone > 0 && r.breddeHale > 0) break; }
    lagre(`AK4-skjot-${navn}.png`, r.png); delete r.png; resultat.gren.skjot.push({ navn, ...r });
  }
  resultat.gren.bak = [];
  for (const p of SPOTS) { const r = await g.exa(BAK, [p]); for (const k of ['R', 'X', 'U']) { lagre(`AK5-${p}-${{ R: 'fasit', X: 'hale', U: 'uten-dybde' }[k]}.png`, r[k]); delete r[k]; } resultat.gren.bak.push(r); }
  await g.slutt();
} catch (e) { console.error(String(e && e.stack || e)); resultat.feil = String(e); }

/* ---------- vurdering ---------- */
const ok = b => (b ? 'bestått' : 'IKKE bestått'), G = resultat.gren, Mn = resultat.main;
if (!resultat.feil) {
  resultat.ak.AK1 = G['3D'].gapInnen1 >= GRENSE.andel3D && G['3D'].hullInnen1 >= GRENSE.andel3D;
  resultat.ak.AK2 = G['2D'].gapInnen1 >= GRENSE.andel && G['2D'].hullInnen1 >= GRENSE.andel;
  resultat.ak.AK3 = G['3D'].fps >= GRENSE.fps * Mn['3D'].fps && G['2D'].fps >= GRENSE.fps * Mn['2D'].fps;
  resultat.ak.AK4 = G.skjot.every(s => s.breddeDone > 0 && Math.abs(s.breddeDone - s.breddeHale) <= GRENSE.bredde * 1 && s.fargeDone && s.fargeHale && s.fargeDone.every((v, i) => Math.abs(v - s.fargeHale[i]) <= GRENSE.farge));
  resultat.ak.AK5 = G.bak.every(b => b.skjult >= GRENSE.skjult && b.mangler <= GRENSE.mangler);
}
writeFileSync(join(UT, 'resultat.json'), JSON.stringify(resultat, null, 2));
console.log(`Safari ${G.info?.safari ?? '?'}, ${G.info?.n ?? '?'} punkter, ${G.info?.km ?? '?'} km, ${G.info?.workers ?? '?'} workers`);
if (resultat.feil) { console.log(`Målingen stoppet: ${resultat.feil}`); process.exit(1); }
console.log(`AK1 (3D) gap ≤ 1 punkt: ${G['3D'].gapInnen1}, hull ≤ 1: ${G['3D'].hullInnen1} (krav ${GRENSE.andel3D}) – ${ok(resultat.ak.AK1)}. main: gap ${JSON.stringify(Mn['3D'].gapMeterMain)} m`);
console.log(`AK2 (2D) gap ≤ 1 punkt: ${G['2D'].gapInnen1}, hull ≤ 1: ${G['2D'].hullInnen1} (krav ${GRENSE.andel}) – ${ok(resultat.ak.AK2)}. main: gap ${JSON.stringify(Mn['2D'].gapMeterMain)} m`);
console.log(`AK3 bilder/s 3D ${G['3D'].fps} mot main ${Mn['3D'].fps}, 2D ${G['2D'].fps} mot main ${Mn['2D'].fps} (krav ${GRENSE.fps} av main) – ${ok(resultat.ak.AK3)}`);
for (const s of G.skjot) console.log(`AK4 skjøt ${s.navn} (${(s.p * 100).toFixed(0)} %, ${s.grad} %): bredde route-done ${s.breddeDone} px, hale ${s.breddeHale} px, farge ${s.fargeDone} / ${s.fargeHale}`);
console.log(`AK4 – ${ok(resultat.ak.AK4)} (se også skjermbildene)`);
for (const b of G.bak) console.log(`AK5 ${b.p}: skjult ${b.skjult} (krav ${GRENSE.skjult}), mangler ${b.mangler} (krav ≤ ${GRENSE.mangler}), fasit ${b.fasit} px`);
console.log(`AK5 – ${ok(resultat.ak.AK5)} (se også skjermbildene)`);
console.log(`Skjermbilder og resultat.json: ${UT}`);
process.exit(Object.values(resultat.ak).every(Boolean) ? 0 : 1);
