import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {findRoute,expandEdges} from '../shared/router.js';
import {searchStations,parseCoordinates,validateNetwork} from '../shared/network.js';
import {loadLegacy,systems,oldRoot} from '../scripts/legacy.js';

const data=id => JSON.parse(fs.readFileSync(new URL(`../public/data/${id}.json`,import.meta.url)));
const correctedLine=syntax=>['L6','L6N','YYL','YYL2','B1'].includes(syntax?.split(':')[0]);
const affected=e=>correctedLine(e.lineId)||correctedLine(e.fromLine)||correctedLine(e.toLine);
const signature=e => JSON.stringify([e.from,e.to,e.kind==='transfer'?e.fromLine:e.lineId,e.kind==='transfer'?e.toLine:e.direction]);
for(const id of Object.keys(systems)){
  test(`${id}: migrated JSON validates`,()=>assert.deepEqual(validateNetwork(data(id)),[]));
  test(`${id}: unchanged legacy edges, directions and option profiles match`, {skip:!fs.existsSync(oldRoot)},()=>{
    const d=data(id),c=loadLegacy(id);
    for(const horse of d.options.horseSpeeds || [undefined])for(const express of d.options.expressLevels || [undefined])for(const coef of d.options.transferCoefficients){
      const options={horseSpeedClass:horse,enableExpressCarts:express,transferCoef:coef};
      c.myMapDirs={};c.reconstructTheSubwayMap(options);
      const expected=new Map();
      for(const [from,neighbors]of Object.entries(c.myMap))for(const[to,links]of Object.entries(neighbors)){
        if(from===to){for(const[fromLine,targets]of Object.entries(links))for(const[toLine,v]of Object.entries(targets))expected.set(JSON.stringify([from,to,fromLine,toLine]),v.value);}
        else for(const[line,v]of Object.entries(links))expected.set(JSON.stringify([from,to,line,c.getNeighborPathDirection(from,to,line)]),v.value);
      }
      if(id.startsWith('ftmc'))for(const key of expected.keys()){const parts=JSON.parse(key);if(correctedLine(parts[2])||correctedLine(parts[3]))expected.delete(key);}
      const actual=expandEdges(d,options).filter(e=>!id.startsWith('ftmc')||!affected(e));assert.equal(actual.length,expected.size,`${id} edge count ${JSON.stringify(options)}`);
      for(const e of actual){const time=expected.get(signature(e));assert.ok(time!=null,`Missing legacy edge ${signature(e)}`);assert.ok(Math.abs(time-e.timeSec)<0.00001,`${signature(e)} ${time} != ${e.timeSec}`);}
    }
  });
  test(`${id}: unaffected route objectives agree with v1`,{skip:!fs.existsSync(oldRoot)},()=>{
    const d=data(id),c=loadLegacy(id), ids=Object.keys(d.stations);
    const pairs=id.startsWith('ftmc')?[['NV','FH'],['CM','SV'],['SV','CM'],['DG','NX01U'],['ZY_NJT','SJ02'],['BX_KH','GT'],['RB','CO']]:id==='trtc'?[['BR01','R28'],['BL08','Y17'],['BR09','G04'],['O54','O21'],['BL07','Y20']]:[['AZ','WF'],['BS','VL'],['HR','EC']];
    pairs.push(...Array.from({length:8},(_,i)=>[ids[i*7%ids.length],ids[(i*11+19)%ids.length]]));
    for(const options of [d.options.defaults,{...d.options.defaults,transferCoef:d.options.transferCoefficients[1]},...(d.options.horseSpeeds?[{...d.options.defaults,horseSpeedClass:'_NEX',enableExpressCarts:0},{...d.options.defaults,horseSpeedClass:'_SH',enableExpressCarts:-1}]:[])]){
      c.reconstructTheSubwayMap(options);
      for(const criteria of d.options.criteria)for(const[from,to]of pairs){
        if(!d.stations[from]||!d.stations[to])continue;
        const old=new c.MyPathResult(from,to,null,c.sortByOptionVals[(c.sortByOptionVals.length===5?['time','transfers','transferTime','stops','mixed']:['time','transfers','stops','mixed']).indexOf(criteria)]);
        const result=findRoute(d,from,to,{...options,criteria});
        assert.equal(result.success,old.isFound,`${from}→${to} ${criteria}`);
        const legacyLines=[];for(let step=old;step;step=step.nextStep)legacyLines.push(step.fromLineSyntax);
        // Operational corrections intentionally replace v1 behavior on these services.
        if(id.startsWith('ftmc')&&(legacyLines.some(correctedLine)||result.steps.some(e=>affected({...e,lineId:d.edges.find(v=>v.id===e.edgeId)?.lineId}))))continue;
        if(result.success){assert.ok(Math.abs(result.metrics.timeSec-old.getTotalDistance())<0.0001,`${id} ${from}→${to} ${criteria}: ${result.metrics.timeSec} != ${old.getTotalDistance()}`);}
      }
    }
  });
}
test('coordinate syntax and multilingual ranking',()=>{
  for(const value of ['123 45 678','(123,45,678)','x=123 z=678 y=45','123 678 y=45'])assert.deepEqual(parseCoordinates(value),{x:123,y:45,z:678});
  assert.deepEqual(parseCoordinates('123 678'),{x:123,z:678,y:62});
  for(const invalid of ['x=3','1 2 garbage','~1 2','NaN 3','x=1 x=2 z=3'])assert.equal(parseCoordinates(invalid),null);
  const d=data('ftmc');
  assert.equal(searchStations(d,'諾基蘭村','en')[0].station.id,'NV');
  assert.equal(searchStations(d,'Notchland Village','zh')[0].station.id,'NV');
  assert.equal(searchStations(d,'-620 80 580','ja')[0].station.id,'NV');
  assert.equal(searchStations(d,'-620 80 580','ja')[0].distanceMeters,0);
});
test('TRTC totals use official OD fare, not the sum of individual ride fares',()=>{
  const d=data('trtc'),r=findRoute(d,'BR01','R28');
  assert.equal(r.metrics.price,d.fares.matrix.BR01.R28);
  assert.ok(r.steps.reduce((sum,s)=>sum+s.metrics.price,0)>r.metrics.price);
  assert.equal(findRoute(d,'R05','BL15').from,'BR09');
  assert.equal(findRoute(d,'BR01','BR01').metrics.price,0);
});
test('invalid parameters and unknown station are rejected',()=>{
  const d=data('ftmc');
  assert.throws(()=>findRoute(d,'NV','unknown'),/UNKNOWN_STATION/);
  assert.throws(()=>findRoute(d,'NV','FH',{criteria:'fare'}),/INVALID_CRITERIA/);
  assert.throws(()=>findRoute(d,'NV','FH',{transferCoef:-1}),/INVALID_TRANSFER_COEFFICIENT/);
  assert.throws(()=>findRoute(d,'NV','FH',{enableExpressCarts:100}),/INVALID_EXPRESS_LEVEL/);
});
test('malformed imported JSON produces validation errors without crashing',()=>{
  const d=data('trtc');
  for(const change of [
    {stations:{...d.stations,BR01:null}},
    {lines:{...d.lines,BR:null}},
    {options:{...d.options,defaults:[],comparators:[]}},
    {edges:[{...d.edges[0],points:[null]}]},
    {fares:{...d.fares,matrix:{BR01:null},externalTransfers:[null]}},
    {names:{en:123,zh:'台北捷運'}}
  ])assert.ok(validateNetwork({...d,...change}).length>0);
});
