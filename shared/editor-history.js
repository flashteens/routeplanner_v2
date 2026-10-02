const LIMIT=100;
const roots=new Set(['names','preview','updated','ui','sources','options','fares','aliases','map']);
const forbidden=new Set(['__proto__','prototype','constructor','editorHistory']);
const orderedCollections={stationOrder:'stations',lineOrder:'lines',edgeOrder:'edges'};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const own=(v,k)=>Object.hasOwn(v,k);
const clone=v=>JSON.parse(JSON.stringify(v));
export const emptyHistory=()=>({version:1,entries:[],cursor:0});
export const withoutHistory=({editorHistory,...network})=>network;
export function sameJSON(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>own(b,k)&&sameJSON(a[k],b[k]));
}
function safeJSON(value,ancestors=new Set(),depth=0){
  if(value===null||typeof value==='string'||typeof value==='boolean')return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(typeof value!=='object'||depth>100||ancestors.has(value))return false;
  if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  ancestors.add(value);
  const safe=Object.keys(value).every(k=>!forbidden.has(k)&&safeJSON(value[k],ancestors,depth+1));
  ancestors.delete(value);return safe;
}
const exactKeys=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>own(v,k));
const snapshot=(exists,value)=>exists?{exists:true,value:clone(value)}:{exists:false};
const state=(data,collection,key)=>collection==='edges'?snapshot(data.edges.some(e=>e.id===key),data.edges.find(e=>e.id===key)):
  own(orderedCollections,collection)?snapshot(true,collection==='edgeOrder'?data.edges.map(e=>e.id):Object.keys(data[orderedCollections[collection]])):snapshot(own(collection==='root'?data:data[collection],key),(collection==='root'?data:data[collection])[key]);
const changeKey=c=>JSON.stringify([c.collection,c.key]);
function checkSnapshot(s){return exactKeys(s,s?.exists===true?['exists','value']:['exists'])&&typeof s.exists==='boolean'&&(!s.exists||safeJSON(s.value));}
export function checkHistoryShape(history){
  if(!exactKeys(history,['version','entries','cursor'])||history.version!==1||!Array.isArray(history.entries)||history.entries.length>LIMIT||!Number.isInteger(history.cursor)||history.cursor<0||history.cursor>history.entries.length)throw new Error('History: invalid version, entries, cursor or 100-group limit.');
  for(const [i,entry] of history.entries.entries()){
    if(!exactKeys(entry,['kind','target','changes'])||!['move','edit','add','delete'].includes(entry.kind)||typeof entry.target!=='string'||!entry.target||!Array.isArray(entry.changes)||!entry.changes.length)throw new Error(`History group ${i+1}: invalid action.`);
    const seen=new Set();
    for(const c of entry.changes){
      if(!exactKeys(c,['collection','key','before','after'])||typeof c.key!=='string'||!c.key||forbidden.has(c.key)||!['root','stations','lines','edges',...Object.keys(orderedCollections)].includes(c.collection)||c.collection==='root'&&!roots.has(c.key)||own(orderedCollections,c.collection)&&c.key!=='ids'||!checkSnapshot(c.before)||!checkSnapshot(c.after)||sameJSON(c.before,c.after))throw new Error(`History group ${i+1}: invalid before/after data or target.`);
      if(seen.has(changeKey(c)))throw new Error(`History group ${i+1}: duplicate target.`);seen.add(changeKey(c));
      if(own(orderedCollections,c.collection)&&[c.before,c.after].some(s=>!s.exists||!Array.isArray(s.value)||s.value.some(id=>typeof id!=='string'||!id||forbidden.has(id))||new Set(s.value).size!==s.value.length))throw new Error(`History group ${i+1}: invalid collection order.`);
      if(['stations','lines','edges'].includes(c.collection)&&[c.before,c.after].some(s=>s.exists&&(!object(s.value)||s.value.id!==c.key)))throw new Error(`History group ${i+1}: entity ID does not match its target.`);
    }
  }
  return history;
}
function validateState(data,validate){
  const errors=validate(withoutHistory(data));
  if(errors.length)throw new Error('History: invalid network state.\n'+errors.join('\n'));
}
function changesBetween(before,after){
  const changes=[];
  const add=(collection,key)=>{const a=state(before,collection,key),b=state(after,collection,key);if(!sameJSON(a,b))changes.push({collection,key,before:a,after:b});};
  for(const collection of ['stations','lines'])for(const key of new Set([...Object.keys(before[collection]),...Object.keys(after[collection])])){
    if(before[collection][key]!==after[collection][key])add(collection,key);
  }
  const oldEdges=new Map(before.edges.map(e=>[e.id,e])),newEdges=new Map(after.edges.map(e=>[e.id,e]));
  for(const key of new Set([...oldEdges.keys(),...newEdges.keys()]))if(oldEdges.get(key)!==newEdges.get(key)){
    const a=snapshot(oldEdges.has(key),oldEdges.get(key)),b=snapshot(newEdges.has(key),newEdges.get(key));
    if(!sameJSON(a,b))changes.push({collection:'edges',key,before:a,after:b});
  }
  for(const collection of Object.keys(orderedCollections))add(collection,'ids');
  for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(!['editorHistory','stations','lines','edges'].includes(key)&&before[key]!==after[key]){
    if(!roots.has(key))throw new Error(`History: unsupported root change: ${key}`);add('root',key);
  }
  return changes;
}
function applyGroup(data,group,redo,validate){
  validateState(data,validate);
  const source=redo?'before':'after',target=redo?'after':'before';
  // Check every precondition before changing anything, including deleted entities.
  for(const c of group.changes)if(!sameJSON(state(data,c.collection,c.key),c[source]))throw new Error(`History: current ${c.collection}/${c.key} does not match ${source}.`);
  const next={...withoutHistory(data),stations:{...data.stations},lines:{...data.lines}},edges=new Map(data.edges.map(e=>[e.id,e]));
  const orders={edgeOrder:data.edges.map(e=>e.id),stationOrder:Object.keys(data.stations),lineOrder:Object.keys(data.lines)};
  for(const c of group.changes){
    const s=c[target];
    if(own(orderedCollections,c.collection)){orders[c.collection]=s.value;continue;}
    if(c.collection==='edges'){if(s.exists)edges.set(c.key,clone(s.value));else edges.delete(c.key);continue;}
    const destination=c.collection==='root'?next:next[c.collection];
    if(s.exists)destination[c.key]=clone(s.value);else delete destination[c.key];
  }
  const edgeOrder=orders.edgeOrder;
  if(edgeOrder.length!==edges.size||edgeOrder.some(id=>!edges.has(id)))throw new Error('History: edge order does not match the edge collection.');
  next.edges=edgeOrder.map(id=>edges.get(id));
  for(const [orderKey,collection] of Object.entries(orderedCollections))if(collection!=='edges'){
    const order=orders[orderKey];
    if(order.length!==Object.keys(next[collection]).length||order.some(id=>!own(next[collection],id)))throw new Error(`History: ${orderKey} does not match its collection.`);
    next[collection]=Object.fromEntries(order.map(id=>[id,next[collection][id]]));
  }
  validateState(next,validate);return next;
}
export function validateEditorHistory(data,validate){
  if(data.editorHistory===undefined)return [];
  try{
    const h=checkHistoryShape(data.editorHistory);
    validateState(data,validate);
    let past=data,future=data;
    for(let i=h.cursor-1;i>=0;i--)past=applyGroup(past,h.entries[i],false,validate);
    for(let i=h.cursor;i<h.entries.length;i++)future=applyGroup(future,h.entries[i],true,validate);
    return [];
  }catch(error){return [error.message];}
}
export function recoverEditorHistory(data,validate){
  validateState(data,validate);
  const raw=data.editorHistory??emptyHistory();
  // Without a trustworthy cursor there is no safe way to attach imported
  // operations to the current network. Never change the network to repair it.
  if(!exactKeys(raw,['version','entries','cursor'])||raw.version!==1||!Array.isArray(raw.entries)||raw.entries.length>LIMIT||!Number.isInteger(raw.cursor)||raw.cursor<0||raw.cursor>raw.entries.length){
    return {history:emptyHistory(),discarded:Array.isArray(raw?.entries)?raw.entries.length:0};
  }
  // Keep only a contiguous suffix whose complete past AND future can be
  // replayed from this exact network. The damaged group itself is discarded.
  // Future groups that depended on discarded actions may also be unreachable.
  for(let start=0;start<=raw.entries.length;start++){
    const history={version:1,entries:raw.entries.slice(start),cursor:Math.max(0,raw.cursor-start)};
    if(!validateEditorHistory({...data,editorHistory:history},validate).length)return {history,discarded:start};
  }
  return {history:emptyHistory(),discarded:raw.entries.length};
}
export function recordEdit(before,after,action,validate,merge=false,repair=false){
  validateState(before,validate);validateState(after,validate);
  const changes=changesBetween(before,after);
  if(!changes.length)return before;
  const raw=before.editorHistory??emptyHistory();
  // A real edit always replaces the redo branch, even if that branch is broken.
  const cursorValid=object(raw)&&Array.isArray(raw.entries)&&Number.isInteger(raw.cursor)&&raw.cursor>=0&&raw.cursor<=raw.entries.length;
  const applied=cursorValid?{...raw,entries:raw.entries.slice(0,raw.cursor)}:raw;
  let h;
  try{h=checkHistoryShape(applied);}catch{repair=true;}
  if(repair)h=recoverEditorHistory({...before,editorHistory:applied},validate).history;
  let entries=h.entries.slice(),last=entries.at(-1);
  const group={kind:action.kind??'edit',target:action.target,changes};
  let canMerge=merge&&!repair&&raw.cursor===raw.entries.length&&group.kind==='move'&&last?.kind==='move'&&last.target===group.target;
  if(canMerge&&changes.some(c=>{const old=last.changes.find(v=>changeKey(v)===changeKey(c));return old&&!sameJSON(old.after,c.before);})){
    h=recoverEditorHistory({...before,editorHistory:applied},validate).history;
    entries=h.entries.slice();last=entries.at(-1);canMerge=false;
  }
  if(canMerge){
    const combined=new Map(last.changes.map(c=>[changeKey(c),c]));
    for(const c of changes){const old=combined.get(changeKey(c));if(old&&!sameJSON(old.after,c.before))throw new Error('History: grouped movement does not match its previous state.');combined.set(changeKey(c),old?{...c,before:old.before}:c);}
    group.changes=[...combined.values()].filter(c=>!sameJSON(c.before,c.after));entries.pop();
  }
  if(group.changes.length)entries.push(group);
  if(entries.length>LIMIT)entries.splice(0,entries.length-LIMIT);
  const editorHistory={version:1,entries,cursor:entries.length};checkHistoryShape(editorHistory);
  return {...after,editorHistory};
}
export function replayHistory(data,redo,validate){
  const h=checkHistoryShape(data.editorHistory??emptyHistory());
  const index=redo?h.cursor:h.cursor-1;
  if(index<0||index>=h.entries.length)return data;
  const next=applyGroup(data,h.entries[index],redo,validate);
  return {...next,editorHistory:{...h,cursor:h.cursor+(redo?1:-1)}};
}
