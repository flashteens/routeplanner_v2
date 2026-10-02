import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root, oldRoot, systems, loadLegacy } from './legacy.js';
import {correctRoft} from './roft-corrections.js';
import {applyBenoLayout} from './beno-layout.js';
import {applyTrtcLayout} from './trtc-layout.js';

const out = path.join(root, 'public/data');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
const clone = value => JSON.parse(JSON.stringify(value));
const round = value => Math.round(value * 1e6) / 1e6;
function inventory(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const rel = prefix + entry.name;
    return entry.isDirectory() ? inventory(path.join(dir, entry.name), rel + '/') :
      [{ file: rel, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, entry.name))).digest('hex') }];
  });
}
const auditPath = path.join(root, 'docs/legacy-hashes.json');
if (!fs.existsSync(auditPath)) write(auditPath, inventory(oldRoot));

function getDetails(id) {
  if (!id.startsWith('ftmc')) return {};
  const source = fs.readFileSync(path.join(oldRoot, id === 'ftmc_preview' ? 'preview/stationInfo.php' : 'stationInfo.php'), 'utf8');
  const entries = [...source.matchAll(/<\?php\s*}\s*else if\(\$ID == "([^"]+)"\)\s*{\s*\?>([\s\S]*?)(?=<\?php\s*})/g)];
  return Object.fromEntries(entries.map(([, station, html]) => [station, html.replace(/<\?=\$MSG_FLOOR_GUIDE\?>/g, '{{floorGuide}}').trim()]));
}

// The CSV is supplied by TRTC through Taipei City's open-data service.
const fareFile = path.join(root, 'official-fares.csv');
const fareRows = fs.existsSync(fareFile) ? new TextDecoder('big5').decode(fs.readFileSync(fareFile)).replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).map(row => row.split(',').map(v => v.replace(/^"|"$/g, ''))) : [];
const registry = [];
for (const id of Object.keys(systems)) {
  const c = loadLegacy(id);
  const legacyConfig = JSON.parse(fs.readFileSync(path.join(oldRoot, systems[id][1]), 'utf8'));
  const canonical = value => String(c.customStationIDAliasFunc ? c.customStationIDAliasFunc(value) : value);
  const horseValues = c.horseOptionVals ? [...c.horseOptionVals] : [null];
  const expressValues = c.expCartsOptionVals ? [...c.expCartsOptionVals] : [null];
  const profiles = horseValues.flatMap(horse => expressValues.map(express => ({ horseSpeedClass: horse, enableExpressCarts: express, transferCoef: 1 })));
  const records = new Map();
  const metadata = new Map();
  const key = (from, to, line, target = '') => JSON.stringify([from, to, line, target]);
  const original = c.makePath;
  c.makePath = function(a, b, line, seconds, bidirectional, alias, ...rest) {
    const result = original(a, b, line, seconds, bidirectional, alias, ...rest);
    if (!Number.isFinite(seconds) || seconds <= 0) return result;
    const resolve = typeof alias === 'function' ? alias : canonical;
    a = String(resolve(a)); b = b == null ? a : String(resolve(b));
    if (typeof line === 'string' && a !== b) {
      const lineId = c.getLineDirAliasesRef(line).split(':')[0];
      metadata.set(key(a, b, lineId), bidirectional !== false);
      if (bidirectional !== false) metadata.set(key(b, a, lineId), true);
    } else if (line && typeof line === 'object') {
      const from = line.from ?? line[0], to = line.to ?? line[1];
      if (typeof from === 'string' && typeof to === 'string') {
        const f = c.getLineDirAliasesRef(from), t = c.getLineDirAliasesRef(to);
        metadata.set(key(a, a, f, t), bidirectional !== false);
        if (bidirectional !== false) metadata.set(key(a, a, t, f), true);
      }
    }
    return result;
  };
  function snapshot() {
    const rows = new Map();
    for (const [from, neighbors] of Object.entries(c.myMap)) for (const [to, links] of Object.entries(neighbors)) {
      if (from === to) {
        for (const [fromLine, targets] of Object.entries(links)) for (const [toLine, vec] of Object.entries(targets))
          rows.set(key(from, to, fromLine, toLine), { from, to, fromLine, toLine, kind: 'transfer', seconds: vec.value });
      } else for (const [lineId, vec] of Object.entries(links))
        rows.set(key(from, to, lineId), { from, to, lineId, direction: c.getNeighborPathDirection(from, to, lineId), kind: lineId.startsWith('#') ? 'walk' : 'ride', seconds: vec.value });
    }
    return rows;
  }
  profiles.forEach((profile, index) => {
    c.myStationLinks = {}; c.myMapDirs = {}; metadata.clear();
    c.reconstructTheSubwayMap(profile);
    const base = snapshot(), meta = new Map(metadata);
    c.reconstructTheSubwayMap({ ...profile, transferCoef: 4 });
    const adjusted = snapshot();
    for (const [k, row] of base) {
      if (!records.has(k)) records.set(k, { ...row, bidirectional: meta.get(k) === true, values: {} });
      records.get(k).values[index] = { timeSec: round(row.seconds), transferSlope: round(((adjusted.get(k)?.seconds ?? row.seconds) - row.seconds) / 3) };
    }
  });
  const stations = {};
  const detailData = getDetails(id);
  for (const [oldId, name] of Object.entries(c.stationNames)) {
    const staId = canonical(oldId);
    if (!stations[staId]) {
      const row = c.stationData?.[staId] || {};
      const coords = row.coord;
      stations[staId] = {
        id: staId, names: { en: c.stationNames[staId] || name, zh: c.stationNames_zh?.[staId] || c.stationNames_zh?.[oldId] || name },
        aliases: [], codes: [],
        coordinates: coords && ['x','y','z'].every(axis => Number.isFinite(coords[axis])) ? clone(coords) : null,
        position: { x: 0, y: 0 }, labelOffset: { x: 12, y: -12 },
        ...(row.benoType ? { symbol: row.benoType } : {}),
        ...(detailData[staId] ? { detailsHtml: detailData[staId] } : {}),
      };
    }
    const s = stations[staId];
    s.aliases.push(oldId, name, c.stationNames_zh?.[oldId]);
    const codes = c.stationIdToCodes?.[oldId] || c.stationCodes?.[oldId];
    if (codes) s.codes.push(...(Array.isArray(codes) ? codes.map(String) : String(codes).split(/\s+/)));
  }
  for (const [name, oldId] of Object.entries(c.multiLangSearchMap || {})) stations[canonical(oldId)]?.aliases.push(name);
  for (const row of records.values()) for (const staId of [row.from, row.to]) if (!stations[staId])
    throw new Error(`${id}: edge references unnamed station ${staId}`);
  for (const s of Object.values(stations)) {
    s.aliases = [...new Set(s.aliases.filter(Boolean))]; s.codes = [...new Set(s.codes)];
  }
  const coordStations = Object.values(stations).filter(s => s.coordinates);
  if (coordStations.length) {
    // Compress the geographically distant branches without changing gameplay XYZ.
    const compress = v => Math.sign(v) * Math.log1p(Math.abs(v) / 1000) * 900;
    for (const [index, s] of Object.values(stations).entries()) s.position = s.coordinates ?
      { x: Math.round(compress(s.coordinates.x)), y: Math.round(compress(s.coordinates.z)) } : { x: -1400 + index % 4 * 100, y: -1000 - Math.floor(index / 4) * 80 };
  } else {
    // Deterministic force layout for systems whose legacy files contain no XYZ.
    const list = Object.values(stations), indices = new Map(list.map((s, i) => [s.id, i]));
    list.forEach((s, i) => s.position = { x: Math.cos(i * 2.4) * (450 + i * 3), y: Math.sin(i * 2.4) * (450 + i * 3) });
    const pairs = [...records.values()].filter(e => e.kind === 'ride').map(e => [indices.get(e.from), indices.get(e.to)]);
    for (let iter = 0; iter < 350; iter++) {
      const force = list.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const dx = list[i].position.x - list[j].position.x, dy = list[i].position.y - list[j].position.y, d = Math.max(20, Math.hypot(dx, dy)), f = 9000 / d ** 2;
        force[i].x += dx / d * f; force[i].y += dy / d * f; force[j].x -= dx / d * f; force[j].y -= dy / d * f;
      }
      for (const [i, j] of pairs) {
        const dx = list[j].position.x - list[i].position.x, dy = list[j].position.y - list[i].position.y, d = Math.max(1, Math.hypot(dx,dy)), f = (d - 90) * 0.012;
        force[i].x += dx/d*f; force[i].y += dy/d*f; force[j].x -= dx/d*f; force[j].y -= dy/d*f;
      }
      list.forEach((s,i) => { s.position.x += Math.max(-12, Math.min(12, force[i].x)); s.position.y += Math.max(-12, Math.min(12, force[i].y)); });
    }
    list.forEach(s => { s.position.x = Math.round(s.position.x * 2); s.position.y = Math.round(s.position.y * 2); });
  }
  const lines = Object.fromEntries(Object.entries(c.lineColors).map(([lineId,color]) => [lineId, {
    id: lineId, names: { en: c.lineFullNames[lineId] || lineId, zh: c.lineFullNames_zh?.[lineId] || c.lineFullNames[lineId] || lineId },
    color: color.fg, interior: Boolean(color.isInteriorMark),
  }]));
  const directionLabel = (dir, station, line) => Object.fromEntries(['en','zh'].map(lang => {
    const item = (lang === 'zh' ? c.directionMsgs_zh : c.directionMsgs)?.[dir];
    return [lang, (typeof item === 'function' ? item(station, line) : item || '').replace(/^\s*-\s*/, '')];
  }));
  const used = new Set(), edges = [];
  for (const [k, row] of records) {
    if (used.has(k)) continue;
    const reverseKey = row.kind === 'transfer' ? key(row.to, row.from, row.toLine, row.fromLine) : key(row.to,row.from,row.lineId);
    const reverse = row.bidirectional ? records.get(reverseKey) : null;
    used.add(k); if (reverse) used.add(reverseKey);
    const allValues = Object.keys(row.values).map(Number);
    const defaultIndex = profiles.findIndex(p => p.horseSpeedClass === '_HX' && p.enableExpressCarts === 3);
    const baseValue = row.values[defaultIndex] || row.values[allValues[0]];
    let distanceKm = 0;
    if (row.kind === 'ride') {
      const a = stations[row.from].coordinates, b = stations[row.to].coordinates;
      if (a && b) distanceKm = Math.round(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)) / 1000;
    }
    const edge = {
      id: `e${String(edges.length + 1).padStart(5,'0')}`, kind: row.kind, from: row.from, to: row.to,
      ...(row.kind === 'transfer' ? { fromLine: row.fromLine, toLine: row.toLine } : { lineId: row.lineId, direction: row.direction, directionLabel: directionLabel(row.direction,row.from,row.lineId) }),
      bidirectional: Boolean(reverse), metrics: { timeSec: baseValue.timeSec, distanceKm, price: 0 },
      ...(reverse ? { reverseTimeSec: (reverse.values[defaultIndex] || reverse.values[allValues[0]]).timeSec,
        ...(row.kind !== 'transfer' ? { reverseDirection: reverse.direction, reverseDirectionLabel: directionLabel(reverse.direction, reverse.from,reverse.lineId) } : {}) } : {}),
      transferSlope: baseValue.transferSlope,
      ...(reverse ? { reverseTransferSlope: (reverse.values[defaultIndex] || reverse.values[allValues[0]]).transferSlope } : {}),
    };
    if (profiles.length > 1 && (allValues.length !== profiles.length || new Set(allValues.map(i => JSON.stringify([row.values[i],reverse?.values[i]]))).size > 1)) {
      const groups = new Map();
      for (const horse of horseValues) {
        const byValue = new Map();
        for (const i of allValues.filter(i => profiles[i].horseSpeedClass === horse)) {
          const v = { ...row.values[i], ...(reverse ? { reverseTimeSec: reverse.values[i].timeSec, reverseTransferSlope: reverse.values[i].transferSlope } : {}) };
          const sig = JSON.stringify(v);
          if (!byValue.has(sig)) byValue.set(sig, { ...v, expresses: [] });
          byValue.get(sig).expresses.push(profiles[i].enableExpressCarts);
        }
        for (const g of byValue.values()) {
          const sig = JSON.stringify(g);
          if (!groups.has(sig)) groups.set(sig, { ...g, horses: [] });
          groups.get(sig).horses.push(horse);
        }
      }
      edge.variants = [...groups.values()].map(({horses,expresses,...timing}) => ({when: {
        ...(horses.length === horseValues.length ? {} : { horseSpeedClass: horses }),
        ...(expresses.length === expressValues.length ? {} : { enableExpressCarts: expresses }),
      }, ...timing}));
    }
    if (edge.kind !== 'transfer') edge.points = [];
    edges.push(edge);
  }
  const options = {
    defaults: { criteria: 'time', transferCoef: 1, ...(c.horseOptionVals ? {horseSpeedClass:'_HX', enableExpressCarts:3} : {}) },
    criteria: c.sortByOptionVals.length === 5 ? ['time','transfers','transferTime','stops','mixed'] : ['time','transfers','stops','mixed'],
    comparators: {
      time: [{timeSec:1},{transfers:1},{transferTimeSec:1},{stops:1}],
      transfers: c.sortByOptionVals.length === 5 ? [{transfers:1},{transferTimeSec:1},{timeSec:1},{stops:1}] : [{transfers:1},{timeSec:1},{transferTimeSec:1},{stops:1}],
      transferTime: [{transferTimeSec:1},{transfers:1},{timeSec:1},{stops:1}],
      stops: [{stops:1},{timeSec:1},{transfers:1},{transferTimeSec:1}],
      mixed: [{transfers:1,timeSec:0.05,transferTimeSec:0.1,stops:0.2},{timeSec:1}],
    },
    transferCoefficients: clone(c.transferOptionVals),
    ...(c.horseOptionVals ? {horseSpeeds: clone(c.horseOptionVals), expressLevels:clone(c.expCartsOptionVals)} : {}),
  };
  const names = {ftmc:{en:'Republic of FlashTeens',zh:'FlashTeens共和國'},ftmc_preview:{en:'Republic of FlashTeens · Preview',zh:'FlashTeens共和國 · 預覽版'},trtc:{en:'Taipei Metro',zh:'台北捷運'},newisle:{en:'Newisle',zh:'Newisle'}}[id];
  const aliases = Object.fromEntries(Object.entries(c.stationNames).map(([oldId]) => [oldId,canonical(oldId)]));
  const fares = { type: id === 'trtc' ? 'origin-destination' : 'free', currency: id === 'trtc' ? 'TWD' : null };
  if (id === 'trtc') {
    fares.ticketType = 'adult-single';
    fares.source = 'https://data.gov.tw/dataset/128418';
    fares.download = 'https://data.taipei/api/dataset/4acb4911-0360-4063-808d-fcee629508b3/resource/893c2f2a-dcfd-407b-b871-394a14105532/download';
    fares.retrieved = '2026-09-30';
    fares.externalTransfers = [
      {from:'BL07',to:'Y16',maxSeconds:1200},
      {from:'BL08',to:'Y17',maxSeconds:1200},
    ];
    fares.transferSource = 'https://www.metro.taipei/News_Content.aspx?n=566DA580861CEE77&s=C2DB2D09B73A31AA';
    fares.matrix = {};
    const namesToId = new Map(Object.entries(c.stationNames_zh).map(([station,name]) => [name.replace(/\s*\(.*\)\s*/g,''), canonical(station)]));
    // The two Banqiao stations have separate fare identities even though names match.
    const resolveFare = name => namesToId.get(name) || namesToId.get(name.replace('臺','台'));
    for (const row of fareRows) {
      const from = resolveFare(row[0]), to = resolveFare(row[1]), value = Number(row[2]);
      if (from && to && Number.isFinite(value)) (fares.matrix[from] ||= {})[to] = value;
    }
    // Separate Banqiao Circular Line identity shares official Banqiao fare data.
    if (fares.matrix.Y16) fares.matrix.BL07 = clone(fares.matrix.Y16);
    for (const row of Object.values(fares.matrix)) if (row.Y16 != null) row.BL07 = row.Y16;
    for (const e of edges) if (e.kind === 'ride') {
      const price = fares.matrix[e.from]?.[e.to];
      if (price == null) throw new Error(`Missing official fare: ${e.from} → ${e.to}`);
      e.metrics.price = price;
    }
  }
  const data = { schemaVersion: 2, id, names, preview: id === 'ftmc_preview',
    updated: legacyConfig.updated, ui: { enableDistance: id !== 'trtc', enableFare: id === 'trtc' },
    sources: { legacy: systems[id][0], links: Object.fromEntries(['en','zh'].map(lang => [lang, [legacyConfig.gui[lang].DOWNLOAD_LINK,legacyConfig.gui[lang].DETAILS_LINK]])) },
    options, fares, aliases, lines, stations, edges };
  if(id.startsWith('ftmc'))applyBenoLayout(correctRoft(data),fs.readFileSync(path.join(root,'docs/roft-beno-20260920.txt'),'utf8'));
  if(id==='trtc')applyTrtcLayout(data,JSON.parse(fs.readFileSync(path.join(root,'docs/trtc-official-layout.json'),'utf8')));
  write(path.join(out, id + '.json'),data);
  registry.push({id,names,preview:data.preview,stationCount:Object.keys(stations).length});
  console.log(`${id}: ${Object.keys(stations).length} stations, ${Object.keys(lines).length} lines, ${edges.length} edges`);
}
write(path.join(out,'systems.json'),registry);
