import {validStationSymbol} from './station-symbol.js';
export const languageKey = lang => lang === 'zh' || lang === 'zh-TW' ? 'zh' : 'en';
export const nameOf = (item, lang) => item?.names?.[languageKey(lang)] || item?.names?.en || item?.id || '';
export function resolveStation(data, value) {
  if (typeof value !== 'string') return null;
  const q = value.trim().toLocaleLowerCase();
  if (Object.hasOwn(data.stations,value)) return value;
  if (data.aliases&&Object.hasOwn(data.aliases,value)) return data.aliases[value];
  for (const s of Object.values(data.stations)) if ([s.id,...Object.values(s.names),...(s.aliases || []),...(s.codes || [])].some(v => v.toLocaleLowerCase() === q)) return s.id;
  return null;
}
export function parseCoordinates(input) {
  if (!input || /[~^]/.test(input)) return null;
  const tokens = input.toLowerCase().match(/[xyz]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g);
  if (!tokens || input.toLowerCase().replace(/[xyz]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)|[\s,()=:[\]]/g,'').length) return null;
  const named = {}, values = [];
  for (let i=0;i<tokens.length;i++) {
    const t=tokens[i];
    if (/[xyz]/.test(t)) {
      if (named[t] != null || !tokens[i+1] || /[xyz]/.test(tokens[i+1])) return null;
      named[t]=Number(tokens[++i]);
    } else values.push(Number(t));
  }
  const axes=values.length >= 3 ? ['x','y','z'] : ['x','z','y'];
  for (const axis of axes) if (named[axis] == null && values.length) named[axis]=values.shift();
  named.y ??= 62;
  return Number.isFinite(named.x) && Number.isFinite(named.y) && Number.isFinite(named.z) && !values.length ? named : null;
}
const normalized = value => value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export function searchStations(data, input, lang='en', limit=50) {
  const q=normalized(input.trim()), coord=parseCoordinates(input);
  const matches=[];
  for (const s of Object.values(data.stations)) {
    let best=null;
    const fields=[nameOf(s,lang),...Object.values(s.names),s.id,...(s.codes || []),...(s.aliases || [])];
    for (const text of fields) {
      const value=normalized(text), index=value.indexOf(q);
      if (index < 0) continue;
      const score=q ? (value === q ? 0 : index === 0 ? 1 : 2) * 1000 + index * 10 + value.length : 0;
      if (!best || score < best.score) best={station:s,score,matched:text};
    }
    if (best) matches.push(best);
  }
  if (coord && matches.length === 0) {
    for (const s of Object.values(data.stations)) {
      const p=s.coordinates;
      if (p && ['x','y','z'].every(axis => Number.isFinite(p[axis]))) {
        const distanceMeters=Math.hypot(p.x-coord.x,p.y-coord.y,p.z-coord.z);
        matches.push({station:s,score:distanceMeters,distanceMeters,matched:null});
      }
    }
  }
  return matches.sort((a,b) => a.score-b.score || nameOf(a.station,lang).localeCompare(nameOf(b.station,lang))).slice(0,limit);
}

export function validateNetwork(data) {
  const errors=[];
  const object=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
  const names=value=>object(value)&&Object.values(value).every(v=>typeof v==='string')&&['en','zh'].every(key=>value[key]?.trim());
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['The root must be an object.'];
  if (data.schemaVersion !== 2) errors.push('schemaVersion must be 2.');
  if (typeof data.id !== 'string' || !/^[a-z0-9_-]+$/i.test(data.id)) errors.push('id must contain letters, numbers, hyphens or underscores.');
  if (!names(data.names)) errors.push('names.en and names.zh must be nonempty strings.');
  for (const key of ['stations','lines']) if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) errors.push(`${key} must be an object.`);
  if (!Array.isArray(data.edges)) errors.push('edges must be an array.');
  if (errors.length) return errors;
  if (typeof data.ui?.enableDistance !== 'boolean' || typeof data.ui?.enableFare !== 'boolean') errors.push('ui.enableDistance and ui.enableFare must be booleans.');
  if(data.ui?.unofficial!=null&&typeof data.ui.unofficial!=='boolean')errors.push('ui.unofficial must be boolean.');
  if(data.footer!=null&&(!object(data.footer)||!object(data.footer.description)||Object.values(data.footer.description).some(v=>typeof v!=='string')))errors.push('footer.description must contain language strings.');
  if(data.sources?.wikiSearchUrl!=null&&(typeof data.sources.wikiSearchUrl!=='string'||!/^https?:\/\//.test(data.sources.wikiSearchUrl)))errors.push('sources.wikiSearchUrl must be an HTTP(S) URL.');
  if(data.preview!=null&&typeof data.preview!=='boolean')errors.push('preview must be boolean.');
  if(data.updated!=null&&(!object(data.updated)||Object.values(data.updated).some(v=>typeof v!=='string')))errors.push('updated must contain language strings.');
  if(data.sources!=null&&!object(data.sources))errors.push('sources must be an object.');
  if(data.sources?.links!=null&&(!object(data.sources.links)||Object.values(data.sources.links).some(links=>!Array.isArray(links)||links.some(link=>!object(link)||typeof link.url!=='string'||typeof link.text!=='string'))))errors.push('sources.links must contain arrays of text/URL links.');
  if(data.aliases!=null&&!object(data.aliases))errors.push('aliases must be an object.');
  if(data.map!=null&&!object(data.map))errors.push('map must be an object.');
  for(const key of ['cornerRadius','parallelGap'])if(data.map?.[key]!=null&&(!Number.isFinite(data.map[key])||data.map[key]<0))errors.push(`map.${key} must be finite and nonnegative.`);
  if (!object(data.options?.defaults) || !Array.isArray(data.options?.criteria) || !Array.isArray(data.options?.transferCoefficients) || !object(data.options?.comparators)) errors.push('options requires defaults, criteria, transferCoefficients and comparators.');
  else {
    if(Object.values(data.options.defaults).some(v=>v!==null&&!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)))errors.push('Option defaults must be finite JSON scalars.');
    if (!data.options.criteria.length || data.options.criteria.some(v=>!['time','transfers','transferTime','stops','mixed'].includes(v)) || !data.options.criteria.includes(data.options.defaults.criteria)) errors.push('The default criterion must be supported.');
    if (!data.options.transferCoefficients.length || data.options.transferCoefficients.some(v=>!Number.isFinite(v)||v<1) || !data.options.transferCoefficients.includes(data.options.defaults.transferCoef)) errors.push('Transfer coefficients must be finite, at least 1, and include the default.');
    for (const criterion of data.options.criteria.filter(v=>typeof v==='string')) {
      const list=data.options.comparators[criterion];
      if (!Array.isArray(list)||!list.length||list.some(weights=>!object(weights)||!Object.values(weights).some(v=>v>0)||Object.entries(weights).some(([key,v])=>!['timeSec','transfers','transferTimeSec','stops'].includes(key)||!Number.isFinite(v)||v<0))) errors.push(`Invalid nonnegative comparator for ${criterion}.`);
    }
    for (const [key,defaultKey] of [['horseSpeeds','horseSpeedClass'],['expressLevels','enableExpressCarts']]) if (data.options[key] && (!Array.isArray(data.options[key]) || !data.options[key].includes(data.options.defaults[defaultKey]) || data.options[key].some(v=>key==='horseSpeeds'?typeof v!=='string':!Number.isFinite(v)))) errors.push(`Invalid ${key} or default.`);
  }
  for (const [id,s] of Object.entries(data.stations)) {
    if (!object(s)) {errors.push(`Station ${id}: must be an object.`);continue;}
    if (s.id !== id || !names(s.names)) errors.push(`Station ${id}: matching id and bilingual names required.`);
    if (!s.position || !Number.isFinite(s.position.x) || !Number.isFinite(s.position.y)) errors.push(`Station ${id}: finite map position required.`);
    if (s.coordinates != null && !['x','y','z'].every(axis => Number.isFinite(s.coordinates[axis]))) errors.push(`Station ${id}: coordinates require finite x, y, z.`);
    if(s.symbol!==undefined&&!validStationSymbol(s.symbol))errors.push(`Station ${id}: symbol must be I, L or M followed by - and a direction from 1 to 8.`);
    if (s.labelOffset != null && (!Number.isFinite(s.labelOffset.x)||!Number.isFinite(s.labelOffset.y))) errors.push(`Station ${id}: label offset requires finite x and y.`);
    if(s.labelAnchor!=null&&!['start','end'].includes(s.labelAnchor))errors.push(`Station ${id}: labelAnchor must be start or end.`);
    if(s.detailsHtml!=null&&typeof s.detailsHtml!=='string')errors.push(`Station ${id}: detailsHtml must be a string.`);
    for (const list of ['aliases','codes']) if (s[list]!=null && (!Array.isArray(s[list]) || s[list].some(v => typeof v !== 'string'))) errors.push(`Station ${id}: ${list} must contain strings.`);
  }
  for (const [id,line] of Object.entries(data.lines)) if (!object(line) || line.id !== id || !names(line.names) || !/^#[0-9a-f]{6}$/i.test(line.color)) errors.push(`Line ${id}: matching id, names and six-digit hex color required.`);
  for(const [id,line] of Object.entries(data.lines))if(line?.interior!=null&&typeof line.interior!=='boolean')errors.push(`Line ${id}: interior must be boolean.`);
  const edgeIds=new Set();
  const isStation=id=>typeof id==='string'&&Object.hasOwn(data.stations,id);
  const isLine=syntax => typeof syntax === 'string' && Object.hasOwn(data.lines,syntax.split(':')[0]);
  for (const e of data.edges) {
    const p=`Edge ${typeof e?.id==='string'?e.id:'?'}`;
    if (!e || typeof e !== 'object') {errors.push('Every edge must be an object.');continue;}
    if (typeof e.id!=='string' || !e.id || edgeIds.has(e.id)) errors.push(`${p}: duplicate, empty or non-string id.`);
    edgeIds.add(e.id);
    if (!isStation(e.from) || !isStation(e.to)) errors.push(`${p}: unknown station.`);
    if (!['ride','walk','transfer'].includes(e.kind)) errors.push(`${p}: unsupported kind.`);
    if (e.kind === 'transfer' ? e.from !== e.to || !isLine(e.fromLine) || !isLine(e.toLine) : e.from === e.to || typeof e.lineId!=='string' || !Object.hasOwn(data.lines,e.lineId)) errors.push(`${p}: invalid line/station references.`);
    if (typeof e.bidirectional !== 'boolean') errors.push(`${p}: bidirectional must be boolean.`);
    for (const key of ['boardingAllowed','reverseBoardingAllowed','countsAsTransfer']) if (e[key] != null && typeof e[key] !== 'boolean') errors.push(`${p}: ${key} must be boolean.`);
    for (const key of ['direction','reverseDirection','arrivalDirection','reverseArrivalDirection']) if (e[key] != null && typeof e[key] !== 'string') errors.push(`${p}: ${key} must be a string.`);
    for(const key of ['directionLabel','reverseDirectionLabel','displayDirectionLabel'])if(e[key]!=null&&(!object(e[key])||Object.values(e[key]).some(v=>typeof v!=='string')))errors.push(`${p}: ${key} must contain language strings.`);
    if (e.displayLineId != null && (typeof e.displayLineId!=='string'||!Object.hasOwn(data.lines,e.displayLineId))) errors.push(`${p}: unknown display line.`);
    for (const k of ['timeSec','distanceKm','price']) if (!Number.isFinite(e.metrics?.[k]) || e.metrics[k] < 0) errors.push(`${p}: ${k} must be finite and nonnegative.`);
    for (const k of ['reverseTimeSec','transferSlope','reverseTransferSlope']) if (e[k] != null && (!Number.isFinite(e[k]) || e[k] < 0)) errors.push(`${p}: ${k} must be finite and nonnegative.`);
    if (e.variants && !Array.isArray(e.variants)) {errors.push(`${p}: variants must be an array.`);continue;}
    for (const v of e.variants || []) {
      if (!v || typeof v!=='object') {errors.push(`${p}: variant must be an object.`);continue;}
      if (!object(v.when)) errors.push(`${p}: variant conditions required.`);
      for (const [key,values] of Object.entries(v.when || {})) if (!['horseSpeedClass','enableExpressCarts'].includes(key) || !Array.isArray(values) || !values.length) errors.push(`${p}: invalid variant condition.`);
      if (!Number.isFinite(v.timeSec) || v.timeSec < 0) errors.push(`${p}: invalid variant time.`);
      for (const k of ['reverseTimeSec','transferSlope','reverseTransferSlope']) if (v[k] != null && (!Number.isFinite(v[k]) || v[k] < 0)) errors.push(`${p}: invalid variant ${k}.`);
    }
    if (e.points != null && (!Array.isArray(e.points) || e.points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)))) errors.push(`${p}: invalid map control points.`);
  }
  for (const [alias,station] of Object.entries(data.aliases || {})) if (!isStation(station)) errors.push(`Alias ${alias}: unknown station.`);
  if (!['free','origin-destination','additive'].includes(data.fares?.type)) errors.push('fares.type must be free, origin-destination or additive.');
  if(data.fares?.currency!=null&&typeof data.fares.currency!=='string')errors.push('fares.currency must be a string or null.');
  if (data.fares?.matrix != null && !object(data.fares.matrix)) errors.push('fares.matrix must be an object.');
  for (const [from,row] of Object.entries(data.fares?.matrix || {})) {
    if (!object(row)) {errors.push(`Invalid fare row ${from}.`);continue;}
    for (const [to,price] of Object.entries(row)) if (!Object.hasOwn(data.stations,from) || !Object.hasOwn(data.stations,to) || !Number.isFinite(price) || price < 0) errors.push(`Invalid fare ${from} → ${to}.`);
  }
  if (data.fares?.externalTransfers != null) {
    if (!Array.isArray(data.fares.externalTransfers)) errors.push('fares.externalTransfers must be an array.');
    else for (const rule of data.fares.externalTransfers) if (!object(rule) || !isStation(rule.from) || !isStation(rule.to) || !Number.isFinite(rule.maxSeconds) || rule.maxSeconds < 0) errors.push('External transfers require valid station IDs and nonnegative maxSeconds.');
  }
  return errors;
}
