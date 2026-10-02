import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyHistory,recordEdit,replayHistory,validateEditorHistory,recoverEditorHistory,withoutHistory} from '../shared/editor-history.js';
import {validateNetwork,resolveStation} from '../shared/network.js';

function fixture(){
  const stations=Object.fromEntries(['A','B','C'].map((id,i)=>[id,{id,names:{en:id,zh:id},position:{x:i*100,y:0},labelOffset:{x:12,y:-12}}]));
  const edge=(id,from,to)=>({id,from,to,lineId:'L1',kind:'ride',bidirectional:true,metrics:{timeSec:10,distanceKm:1,price:0},points:[]});
  return {schemaVersion:2,id:'test',names:{en:'Test',zh:'測試'},ui:{enableDistance:true,enableFare:false},options:{defaults:{criteria:'time',transferCoef:1},criteria:['time'],transferCoefficients:[1],comparators:{time:[{timeSec:1}]}},fares:{type:'free'},aliases:{aliasB:'B'},stations,lines:{L1:{id:'L1',names:{en:'One',zh:'一'},color:'#000000'}},edges:[edge('e1','A','B'),edge('e2','B','C')]};
}
const record=(d,n,kind,target,merge=false)=>recordEdit(d,n,{kind,target},validateNetwork,merge);
const move=(d,id,x,merge=true)=>record(d,{...d,stations:{...d.stations,[id]:{...d.stations[id],position:{x,y:0}}}},'move',`station:${id}:position`,merge);
const rename=(d,id,en)=>record(d,{...d,stations:{...d.stations,[id]:{...d.stations[id],names:{...d.stations[id].names,en}}}},'edit',`stations:${id}`);
const undo=d=>replayHistory(d,false,validateNetwork),redo=d=>replayHistory(d,true,validateNetwork);

test('movement across arrows/drags merges by target; another target and property edit make three groups',()=>{
  const original=fixture();let d=original;
  for(const x of [1,2,7,15])d=move(d,'A',x);
  for(const x of [102,105,130])d=move(d,'B',x);
  d=rename(d,'B','New B');assert.equal(d.editorHistory.entries.length,3);
  assert.equal(d.editorHistory.entries[0].changes.length,1,'History stores just the changed station.');
  d=undo(d);assert.equal(d.stations.B.names.en,'B');assert.equal(d.stations.B.position.x,130);
  d=undo(d);assert.equal(d.stations.B.position.x,100);assert.equal(d.stations.A.position.x,15);
  d=undo(d);assert.deepEqual(withoutHistory(d),original);
  d=JSON.parse(JSON.stringify(d));assert.deepEqual(validateEditorHistory(d,validateNetwork),[]);
  d=redo(redo(redo(d)));assert.equal(d.stations.A.position.x,15);assert.equal(d.stations.B.position.x,130);assert.equal(d.stations.B.names.en,'New B');
});
test('a new change after undo clears redo even when its target matches the old movement',()=>{
  let d=move(fixture(),'A',10);d=move(d,'B',110);d=undo(d);d=move(d,'A',20);
  assert.equal(d.editorHistory.entries.length,2);assert.equal(d.editorHistory.cursor,2);assert.equal(redo(d),d);
  assert.equal(undo(d).stations.A.position.x,10);
});
test('net-zero groups disappear; limit is 100 total undo/redo groups and oldest groups expire',()=>{
  let d=move(fixture(),'A',10);d=move(d,'A',0);assert.deepEqual(d.editorHistory,emptyHistory());
  for(let i=0;i<105;i++)d=rename(d,'A',`A ${i}`);
  assert.equal(d.editorHistory.entries.length,100);assert.deepEqual(validateEditorHistory(d,validateNetwork),[]);
  for(let i=0;i<100;i++)d=undo(d);
  assert.equal(d.stations.A.names.en,'A 4');assert.equal(d.editorHistory.entries.length,100);assert.equal(undo(d),d);
});
test('edge nodes merge by node index, and add/delete/reorder operations retain exact order',()=>{
  const initial=fixture();initial.edges[0].points=[{x:25,y:0},{x:75,y:0}];let d=initial;
  const point=(index,x)=>{d=record(d,{...d,edges:d.edges.map(e=>e.id==='e1'?{...e,points:e.points.map((p,i)=>i===index?{x,y:0}:p)}:e)},'move',`edge:e1:point:${index}`,true);};
  point(0,26);point(0,30);point(1,80);assert.equal(d.editorHistory.entries.length,2);
  d=undo(undo(d));assert.deepEqual(withoutHistory(d),initial);
  const n={...initial.edges[0],id:'extra',from:'A',to:'C'};
  d=record(d,{...d,edges:[d.edges[1],n,d.edges[0]]},'add','edges:extra');
  assert.deepEqual(redo(undo(d)).edges.map(e=>e.id),['e2','extra','e1']);
});
test('cascading station deletion restores references, fares, aliases and edge order atomically',()=>{
  const initial=fixture();initial.fares.matrix={A:{B:20},B:{A:20}};
  const stations={...initial.stations};delete stations.B;
  let d=record(initial,{...initial,stations,edges:[],aliases:{},fares:{type:'free',matrix:{A:{}}}},'delete','stations:B');
  d=undo(d);assert.deepEqual(withoutHistory(d),initial);assert.deepEqual(validateEditorHistory(d,validateNetwork),[]);
  assert.deepEqual(Object.keys(d.stations),Object.keys(initial.stations),'Undo also restores the station list order.');
  d=redo(d);assert.equal(d.stations.B,undefined);assert.equal(d.edges.length,0);
  const lines=fixture();lines.lines.L2={id:'L2',names:{en:'Two',zh:'二'},color:'#ffffff'};
  const deleted=record(lines,{...lines,lines:{L2:lines.lines.L2},edges:[]},'delete','lines:L1');
  assert.deepEqual(Object.keys(undo(deleted).lines),['L1','L2'],'Undo restores the line list order.');
});
test('undo and redo validate current state and both snapshots before applying, without mutating on failure',()=>{
  const d=move(fixture(),'A',10);const broken=structuredClone(d);broken.stations.A.position.x=99;
  const untouched=structuredClone(broken);assert.throws(()=>undo(broken),/does not match after/);assert.deepEqual(broken,untouched);
  const badBefore=structuredClone(d);badBefore.editorHistory.entries[0].changes[0].before.value.names.en='';
  assert.throws(()=>undo(badBefore),/invalid network state/);assert.ok(validateEditorHistory(badBefore,validateNetwork).length);
  const badSymbol=structuredClone(d);badSymbol.editorHistory.entries[0].changes[0].before.value.symbol='I-9';assert.throws(()=>undo(badSymbol),/symbol/);
  const undone=undo(d),badAfter=structuredClone(undone);badAfter.editorHistory.entries[0].changes[0].after.value.position.x=null;
  assert.throws(()=>redo(badAfter),/finite map position/);
  const invalid=structuredClone(d);invalid.names.zh='';assert.throws(()=>undo(invalid),/invalid network state/);
  const original=fixture(),edited=record(original,{...original,edges:original.edges.map(e=>e.id==='e1'?{...e,metrics:{...e.metrics,timeSec:11}}:e)},'edit','edges:e1');
  const fakeStation=undo(structuredClone(edited));fakeStation.editorHistory.entries[0].changes[0].after.value.from='toString';
  assert.throws(()=>redo(fakeStation),/unknown station/,'Inherited object properties are not stations.');
  const fakeLine=undo(structuredClone(edited));fakeLine.editorHistory.entries[0].changes[0].after.value.lineId='constructor';
  assert.throws(()=>redo(fakeLine),/invalid line\/station references/,'Inherited object properties are not lines.');
  const badLabel=undo(structuredClone(edited));badLabel.editorHistory.entries[0].changes[0].after.value.directionLabel={en:{}};
  assert.throws(()=>redo(badLabel),/language strings/);
  const withSources={...fixture(),sources:{links:{en:[{text:'Official',url:'https://example.com'}]}}};
  const changed=record(withSources,{...withSources,sources:{links:{en:[{text:'Updated',url:'https://example.com'}]}}},'edit','settings');
  const badLinks=undo(changed);badLinks.editorHistory.entries[0].changes[0].after.value.links.en={};
  assert.throws(()=>redo(badLinks),/sources.links/);
});
test('imported history rejects unsupported operations, unsafe keys, malformed state and future mismatches',()=>{
  const d=move(fixture(),'A',10);
  const corrupt=change=>{const n=structuredClone(d);change(n.editorHistory);assert.ok(validateEditorHistory(n,validateNetwork).length);assert.throws(()=>undo(n));};
  corrupt(h=>h.entries[0].kind='execute');corrupt(h=>h.cursor=-1);corrupt(h=>h.entries[0].changes.push(h.entries[0].changes[0]));
  corrupt(h=>h.entries[0].changes[0].key='__proto__');corrupt(h=>h.entries[0].changes[0].before.value.id='other');
  corrupt(h=>h.entries[0].changes[0].before.value=JSON.parse('{"id":"A","constructor":{}}'));
  const future=undo(d);future.editorHistory.entries[0].changes[0].before.value.position.x=9;
  assert.ok(validateEditorHistory(future,validateNetwork).length);assert.throws(()=>redo(future),/does not match before/);
  assert.deepEqual({}.polluted,undefined);
});
test('invalid edits never enter history; old JSON without history remains supported',()=>{
  const d=fixture();assert.deepEqual(validateEditorHistory(d,validateNetwork),[]);assert.equal(undo(d),d);
  for(const value of ['constructor','toString','__proto__'])assert.equal(resolveStation(d,value),null);
  assert.throws(()=>rename(d,'A',''),/invalid network state/);assert.equal(d.editorHistory,undefined);
  const broken=structuredClone(d);broken.edges[0].metrics.timeSec=-1;
  assert.throws(()=>record(d,broken,'edit','edges:e1'),/nonnegative/);
});

test('damaged imports retain only a fully validated contiguous suffix, including both undo and redo',()=>{
  let d=rename(fixture(),'A','A 1');d=rename(d,'B','B 1');d=rename(d,'C','C 1');d=rename(d,'A','A 2');d=rename(d,'B','B 2');
  const bad=structuredClone(undo(undo(d)));bad.editorHistory.entries[1].changes[0].before.value.position.x=null;
  const original=structuredClone(bad),recovery=recoverEditorHistory(bad,validateNetwork);
  assert.equal(recovery.discarded,2);assert.equal(recovery.history.cursor,1);
  assert.deepEqual(recovery.history.entries,bad.editorHistory.entries.slice(2));assert.deepEqual(bad,original,'Inspection does not change the loaded document.');
  const recovered={...bad,editorHistory:recovery.history};assert.deepEqual(validateEditorHistory(recovered,validateNetwork),[]);
  assert.deepEqual(withoutHistory(redo(redo(recovered))),withoutHistory(d));
  assert.equal(undo(recovered).stations.C.names.en,'C');
  const multiple=structuredClone(d);multiple.editorHistory.entries[0].kind='execute';multiple.editorHistory.entries[3].changes[0].before.value.names.en='';
  assert.equal(recoverEditorHistory(multiple,validateNetwork).discarded,4,'Everything through the last damaged group is lost.');
  assert.deepEqual(recoverEditorHistory(d,validateNetwork).history,d.editorHistory);
});
test('unreachable future actions and an untrustworthy history envelope are discarded without changing the map',()=>{
  let d=rename(fixture(),'A','A 1');d=rename(d,'A','A 2');d=rename(d,'A','A 3');d=undo(undo(d));
  d.editorHistory.entries[1].kind='execute';const original=structuredClone(d);
  assert.deepEqual(recoverEditorHistory(d,validateNetwork),{history:emptyHistory(),discarded:3});assert.deepEqual(d,original);
  for(const h of [null,{version:1,entries:d.editorHistory.entries,cursor:99},{version:9,entries:d.editorHistory.entries,cursor:1}]){
    const broken={...d,editorHistory:h};assert.deepEqual(recoverEditorHistory(broken,validateNetwork).history,emptyHistory());
    assert.deepEqual(withoutHistory(broken),withoutHistory(d));
  }
});
test('a failed replay leaves the map intact and the next real edit repairs its past and replaces the redo branch',()=>{
  let d=rename(fixture(),'A','A 1');d=rename(d,'B','B 1');d=rename(d,'C','C 1');d=undo(d);
  d.editorHistory.entries[0].changes[0].before.value.names.en='';const original=structuredClone(d);
  // Undo B succeeds, but the earlier damaged A group then fails atomically.
  const atFailure=undo(d),failureCopy=structuredClone(atFailure);assert.throws(()=>undo(atFailure),/invalid network state/);assert.deepEqual(atFailure,failureCopy);
  const next={...atFailure,stations:{...atFailure.stations,C:{...atFailure.stations.C,names:{...atFailure.stations.C.names,en:'New C'}}}};
  const edited=recordEdit(atFailure,next,{kind:'edit',target:'stations:C'},validateNetwork,false,true);
  assert.equal(edited.editorHistory.entries.length,1);assert.equal(edited.editorHistory.cursor,1);assert.equal(redo(edited),edited);
  assert.deepEqual(withoutHistory(undo(edited)),withoutHistory(atFailure));assert.deepEqual(validateEditorHistory(edited,validateNetwork),[]);
  // A later valid applied group survives even when an earlier group is damaged.
  const nextB={...d,stations:{...d.stations,B:{...d.stations.B,names:{...d.stations.B.names,en:'New B'}}}};
  const suffix=recordEdit(d,nextB,{kind:'edit',target:'stations:B'},validateNetwork,false,true);
  assert.equal(suffix.editorHistory.entries.length,2);assert.deepEqual(validateEditorHistory(suffix,validateNetwork),[]);assert.deepEqual(d,original);
  const futureFailure=undo(undo(rename(rename(rename(fixture(),'A','A 1'),'B','B 1'),'C','C 1')));
  futureFailure.editorHistory.entries[1].changes[0].after.value.names.en='';const futureCopy=structuredClone(futureFailure);
  assert.throws(()=>redo(futureFailure),/invalid network state/);assert.deepEqual(futureFailure,futureCopy);
  const nextC={...futureFailure,stations:{...futureFailure.stations,C:{...futureFailure.stations.C,names:{...futureFailure.stations.C.names,en:'After failed redo'}}}};
  const afterRedoFailure=recordEdit(futureFailure,nextC,{kind:'edit',target:'stations:C'},validateNetwork,false,true);
  assert.equal(afterRedoFailure.editorHistory.entries.length,2,'Failed redo keeps the valid past and replaces all future groups.');
  assert.deepEqual(validateEditorHistory(afterRedoFailure,validateNetwork),[]);assert.deepEqual(withoutHistory(undo(afterRedoFailure)),withoutHistory(futureFailure));
});
test('malformed redo cannot block a new edit, and a no-op never clears or repairs history',()=>{
  let d=move(fixture(),'A',10);d=move(d,'B',110);d=undo(d);d.editorHistory.entries[1].kind='execute';
  assert.equal(recordEdit(d,d,{kind:'edit',target:'settings'},validateNetwork),d);
  const edited=rename(d,'C','New C');assert.equal(edited.editorHistory.entries.length,2);assert.equal(redo(edited),edited);
  assert.deepEqual(validateEditorHistory(edited,validateNetwork),[]);
  const malformed=structuredClone(edited);malformed.editorHistory.entries[0].kind='execute';
  const appended=rename(malformed,'B','New B');assert.deepEqual(validateEditorHistory(appended,validateNetwork),[]);assert.equal(appended.editorHistory.entries.length,2);
  const mismatched=move(fixture(),'A',10);mismatched.editorHistory.entries[0].changes[0].after.value.position.x=9;
  const moved=move(mismatched,'A',20);assert.equal(moved.editorHistory.entries.length,1);assert.equal(undo(moved).stations.A.position.x,10);
});
