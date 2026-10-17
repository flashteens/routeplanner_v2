import {parseCoordinates,validateNetwork} from './network.js';
import {editorDirectionProblems} from './editor-directions.js';
import {cleanEdge} from './edge-fields.js';
import {delaysWhenUnfamiliar} from './familiarity.js';
import {nextEdgeId} from './editor-defaults.js';
import {sameJSON} from './editor-history.js';

export class BatchError extends Error{
  constructor(code,details={}){super(code);this.code=code;this.details=details;}
}
const fail=(code,details)=>{throw new BatchError(code,details);};
const own=(v,k)=>Object.hasOwn(v,k);
const validId=id=>/^[\w:#.-]+$/.test(id)&&!['__proto__','prototype','constructor','editorHistory'].includes(id);
const scalarKeys=['bidirectional','timeSec','distanceKm','price','reverseTimeSec','delayWhenUnfamiliar','variants'];
const travelKeys=['kind',...scalarKeys,'direction','directionLabel','reverseDirection','reverseDirectionLabel','arrivalDirection','reverseArrivalDirection','boardingAllowed','reverseBoardingAllowed','displayLineId','displayDirectionLabel'];
export const batchColumns=scope=>scope.type==='stations'?['id','nameEn','nameZh','coords']:scope.type==='transfer'?['id','fromLine','toLine',...scalarKeys,'countsAsTransfer']:['id','from','to',...travelKeys];
export const inBatchScope=(edge,scope)=>scope.type==='transfer'?edge.kind==='transfer'&&edge.from===scope.id:scope.type==='travel'&&edge.kind!=='transfer'&&edge.lineId===scope.id;
export function writeCSV(rows){return rows.map(row=>row.map(v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}).join(',')).join('\n')+'\n';}
export function readCSV(text){
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false,closed=false,line=1,start=1;
  const endCell=()=>{row.push(cell);cell='';closed=false;};
  const endRow=()=>{endCell();if(row.length>1||row.some(v=>v.trim()))rows.push({cells:row,line:start});row=[];start=line+1;};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n')line++;}continue;}
    if(c==='"'){if(cell||closed)fail('batchCSVQuote',{line});quoted=true;}
    else if(c===',')endCell();
    else if(c==='\n'||c==='\r'){endRow();if(c==='\r'&&text[i+1]==='\n')i++;line++;}
    else {if(closed)fail('batchCSVQuote',{line});cell+=c;}
  }
  if(quoted)fail('batchCSVQuote',{line:start});
  if(cell||closed||row.length)endRow();return rows;
}
const getField=(e,key)=>key==='timeSec'||key==='distanceKm'||key==='price'?e.metrics[key]:key==='delayWhenUnfamiliar'?delaysWhenUnfamiliar(e):e[key];
const printable=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v);
export function exportBatch(data,scope,headers=batchColumns(scope)){
  const keys=batchColumns(scope),items=scope.type==='stations'?Object.values(data.stations):data.edges.filter(e=>inBatchScope(e,scope));
  return writeCSV([headers,...items.map(item=>keys.map(key=>scope.type==='stations'?key==='id'?item.id:key==='coords'?item.coordinates?['x','y','z'].map(k=>item.coordinates[k]).join(' '):'':item.names[key==='nameEn'?'en':'zh']:printable(getField(cleanEdge(item),key))))]);
}
// k-NN selects neighbors in horizontal game XZ; fit each map axis separately.
// Positive slopes allow extrapolation, instead of pulling new stations back into the anchor cloud.
const axisScales=new WeakMap();
function fallbackScales(stations){
  if(axisScales.has(stations))return axisScales.get(stations);
  const anchors=Object.values(stations).filter(s=>s.coordinates&&s.position);
  const result=Object.fromEntries([['x','x'],['z','y']].map(([game,map])=>{
    const sorted=anchors.toSorted((a,b)=>a.coordinates[game]-b.coordinates[game]),slopes=[];
    for(let i=0;i<sorted.length;i++)for(let j=i+1;j<Math.min(i+5,sorted.length);j++){
      const delta=sorted[j].coordinates[game]-sorted[i].coordinates[game],slope=(sorted[j].position[map]-sorted[i].position[map])/delta;
      if(delta>1e-8&&Number.isFinite(slope)&&slope>1e-8)slopes.push(slope);
    }
    slopes.sort((a,b)=>a-b);return [game,slopes.length?slopes[Math.floor(slopes.length/2)]:1];
  }));axisScales.set(stations,result);return result;
}
export function predictStationPosition(data,coordinates,fallback={x:0,y:0}){
  const center=()=>({position:{x:Math.round(fallback.x),y:Math.round(fallback.y)},estimated:false});
  if(!coordinates)return center();
  const near=Object.values(data.stations).filter(s=>s.coordinates&&s.position).map(s=>({s,d:Math.hypot(s.coordinates.x-coordinates.x,s.coordinates.z-coordinates.z)})).sort((a,b)=>a.d-b.d||a.s.id.localeCompare(b.s.id)).slice(0,5);
  if(!near.length)return center();
  const exact=near.filter(n=>n.d<1e-8);
  if(exact.length)return {position:Object.fromEntries(['x','y'].map(k=>[k,Math.round(exact.reduce((sum,n)=>sum+n.s.position[k],0)/exact.length)])),estimated:true};
  const scales=fallbackScales(data.stations),weights=near.map(n=>1/n.d**2),total=weights.reduce((a,b)=>a+b,0);
  const position=Object.fromEntries([['x','x'],['z','y']].map(([game,map])=>{
    const meanX=near.reduce((sum,n,i)=>sum+n.s.coordinates[game]*weights[i],0)/total,meanY=near.reduce((sum,n,i)=>sum+n.s.position[map]*weights[i],0)/total;
    const variance=near.reduce((sum,n,i)=>sum+weights[i]*(n.s.coordinates[game]-meanX)**2,0),covariance=near.reduce((sum,n,i)=>sum+weights[i]*(n.s.coordinates[game]-meanX)*(n.s.position[map]-meanY),0),slope=covariance/variance;
    const value=Number.isFinite(slope)&&slope>1e-8?meanY+slope*(coordinates[game]-meanX):near[0].s.position[map]+scales[game]*(coordinates[game]-near[0].s.coordinates[game]);
    return [map,Math.round(value)];
  }));return Object.values(position).every(Number.isFinite)?{position,estimated:true}:center();
}
function removeStations(data,removed){
  if(!removed.size)return data;
  const next={...data,edges:data.edges.filter(e=>!removed.has(e.from)&&!removed.has(e.to)),fares:{...data.fares}};
  if(data.aliases)next.aliases=Object.fromEntries(Object.entries(data.aliases).filter(([,id])=>!removed.has(id)));
  if(data.fares.matrix)next.fares.matrix=Object.fromEntries(Object.entries(data.fares.matrix).filter(([id])=>!removed.has(id)).map(([id,row])=>[id,Object.fromEntries(Object.entries(row).filter(([to])=>!removed.has(to)))]));
  if(data.fares.externalTransfers)next.fares.externalTransfers=data.fares.externalTransfers.filter(r=>!removed.has(r.from)&&!removed.has(r.to));return next;
}
const numeric=new Set(['timeSec','distanceKm','price','reverseTimeSec']);
const boolean=new Set(['bidirectional','delayWhenUnfamiliar','countsAsTransfer','boardingAllowed','reverseBoardingAllowed']);
const json=new Set(['directionLabel','reverseDirectionLabel','displayDirectionLabel','variants']);
function parseField(key,text,line){
  if(numeric.has(key)){if(!text.trim()){if(key==='reverseTimeSec')return undefined;fail('batchNumberError',{line,field:key});}const v=Number(text);if(!Number.isFinite(v)||v<0)fail('batchNumberError',{line,field:key});return v;}
  if(boolean.has(key)){if(!text.trim())return undefined;if(!['true','false'].includes(text.trim().toLowerCase()))fail('batchBoolean',{line,field:key});return text.trim().toLowerCase()==='true';}
  if(json.has(key)){if(!text.trim())return undefined;try{return JSON.parse(text);}catch{fail('batchJSON',{line,field:key});}}
  return text.trim()||undefined;
}
export function batchDiff(before,after){
  const changes=[];
  const add=(collection,id,a,b)=>{if(!sameJSON(a,b))changes.push({collection,id,action:a===undefined?'insert':b===undefined?'delete':'update',before:a,after:b});};
  for(const collection of ['stations','edges']){
    const a=collection==='edges'?Object.fromEntries(before.edges.map(e=>[e.id,e])):before.stations,b=collection==='edges'?Object.fromEntries(after.edges.map(e=>[e.id,e])):after.stations;
    for(const id of new Set([...Object.keys(a),...Object.keys(b)]))add(collection,id,a[id],b[id]);
  }
  for(const key of ['aliases','fares'])add('settings',key,before[key],after[key]);return changes;
}
export function prepareBatch(data,scope,text,{headers=batchColumns(scope),fallback}={}){
  if(!['stations','travel','transfer'].includes(scope.type)||scope.type==='travel'&&!own(data.lines,scope.id)||scope.type==='transfer'&&!own(data.stations,scope.id))fail('batchScopeError');
  const keys=batchColumns(scope),rows=readCSV(text),head=rows.shift();
  if(!head||![keys,headers].some(h=>sameJSON(h,head.cells)))fail('batchHeader');
  const used=new Set(),records=rows.map(({cells,line})=>{
    if(cells.length!==keys.length)fail('batchColumnsError',{line,count:keys.length});
    const r=Object.fromEntries(keys.map((key,i)=>[key,cells[i]])),id=r.id.trim();r.id=id;r.rowLine=line;
    if(id&&!validId(id)||scope.type==='stations'&&!id)fail('batchID',{line});
    if(id&&used.has(id))fail('batchDuplicate',{line,id});if(id)used.add(id);return r;
  });
  let next={...data},placements=[];
  if(scope.type==='stations'){
    const removed=new Set(Object.keys(data.stations).filter(id=>!used.has(id))),anchors={...data,stations:Object.fromEntries(Object.entries(data.stations).filter(([id])=>!removed.has(id)))};
    next=removeStations(next,removed);next.stations=Object.fromEntries(records.map(r=>{
      const existing=data.stations[r.id],coordinates=r.coords.trim()?parseCoordinates(r.coords):null;
      if(r.coords.trim()&&(!coordinates||(r.coords.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g)||[]).length!==3))fail('batchCoordinates',{line:r.rowLine});
      if(existing&&existing.names.en===r.nameEn&&existing.names.zh===r.nameZh&&sameJSON(existing.coordinates??null,coordinates))return [r.id,existing];
      const location=existing?{position:existing.position}:predictStationPosition(anchors,coordinates,fallback);
      if(!existing)placements.push({id:r.id,estimated:location.estimated});
      return [r.id,{...(existing||{id:r.id,aliases:[],codes:[],symbol:'L-3'}),names:{...existing?.names,en:r.nameEn,zh:r.nameZh},coordinates,position:location.position}];
    }));
  }else{
    const all=new Map(data.edges.map(e=>[e.id,e])),scoped=new Set(data.edges.filter(e=>inBatchScope(e,scope)).map(e=>e.id));
    const reserve={...data,edges:[...data.edges,...[...used].filter(id=>!all.has(id)).map(id=>({id}))]};
    const edited=records.map(r=>{
      if(!r.id){r.id=nextEdgeId(reserve);reserve.edges.push({id:r.id});}
      if(all.has(r.id)&&!scoped.has(r.id))fail('batchOutside',{line:r.rowLine,id:r.id});
      const old=all.get(r.id),values=Object.fromEntries(keys.filter(k=>!['id','from','to','fromLine','toLine'].includes(k)).map(k=>[k,parseField(k,r[k],r.rowLine)]));
      if(old)for(const key of Object.keys(values))if(printable(getField(old,key))===r[key])values[key]=getField(old,key);
      // Like the regular editor, an edited empty list removes conditional timing.
      if(Array.isArray(values.variants)&&!values.variants.length&&(!old||printable(old.variants)!==r.variants))values.variants=undefined;
      const kind=scope.type==='transfer'?'transfer':values.kind;
      if(!['ride','walk','transfer'].includes(kind)||scope.type==='travel'&&kind==='transfer')fail('batchKind',{line:r.rowLine});
      const edge={...old,...values,id:r.id,kind,from:scope.type==='transfer'?scope.id:r.from.trim(),to:scope.type==='transfer'?scope.id:r.to.trim(),metrics:{...old?.metrics,...Object.fromEntries(['timeSec','distanceKm','price'].map(k=>[k,values[k]]))}};
      for(const key of ['timeSec','distanceKm','price'])delete edge[key];
      edge.bidirectional=values.bidirectional??true;edge.delayWhenUnfamiliar=values.delayWhenUnfamiliar??(kind==='transfer');
      if(scope.type==='transfer'){edge.fromLine=r.fromLine.trim();edge.toLine=r.toLine.trim();}else {edge.lineId=scope.id;if(!old)edge.points=[];}
      const cleaned=cleanEdge(edge);for(const key of Object.keys(cleaned))if(cleaned[key]===undefined)delete cleaned[key];
      // Do not turn an untouched legacy record's absent optional fields into an edit.
      if(old){const effective={...old,delayWhenUnfamiliar:delaysWhenUnfamiliar(old)};if(sameJSON(cleanEdge(effective),cleaned))return old;}
      return cleaned;
    });
    const replacements=new Map(edited.map(e=>[e.id,e]));
    next.edges=data.edges.flatMap(e=>!scoped.has(e.id)?[e]:replacements.has(e.id)?[replacements.get(e.id)]:[]).concat(edited.filter(e=>!all.has(e.id)));
  }
  const errors=validateNetwork(next),directions=editorDirectionProblems(next);
  if(errors.length||directions.length)fail('batchInvalid',{errors,directions});
  return {next,changes:batchDiff(data,next),placements};
}
