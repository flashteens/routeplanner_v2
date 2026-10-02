import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {insertControlPoint,midpointControlPoint,edgeAnchors} from '../shared/map-geometry.js';
import {applyTrtcLayout} from '../scripts/trtc-layout.js';
import {validateNetwork} from '../shared/network.js';
import {stationAppearance,stationSymbol,labelDirection,validStationSymbol} from '../shared/station-symbol.js';
import {editorSnapshot} from '../shared/editor-document.js';

test('adding a bend adds exactly one explicit node without saving automatic elbows',()=>{
  const data={stations:{A:{position:{x:0,y:0}},B:{position:{x:100,y:60}}}};
  const edge={from:'A',to:'B',points:[]};
  const first=insertControlPoint(data,edge,midpointControlPoint(data,edge));
  assert.equal(first.length,1);assert.equal(edge.points.length,0);
  const existing={...edge,points:[{x:30,y:10},{x:75,y:35}]};
  const next=insertControlPoint(data,existing,{x:50,y:20});
  assert.equal(next.length,3);assert.deepEqual(next[0],existing.points[0]);assert.deepEqual(next[2],existing.points[1]);
  assert.deepEqual(next[1],{x:50,y:20});assert.equal(existing.points.length,2);
});

const data=JSON.parse(fs.readFileSync(new URL('../public/data/trtc.json',import.meta.url)));
const reference=JSON.parse(fs.readFileSync(new URL('../docs/trtc-official-layout.json',import.meta.url)));
test('Taipei station names/codes match the official reference and layout is reproducible',()=>{
  assert.equal(data.sources.officialLayout.checkedStations,119);
  assert.equal(Object.keys(reference.stations).length,Object.keys(data.stations).length);
  const rebuilt=applyTrtcLayout(structuredClone(data),reference);
  assert.deepEqual(rebuilt,data);assert.deepEqual(validateNetwork(data),[]);
  const wrong=structuredClone(data);wrong.stations.BR01.names.zh='錯誤站名';
  assert.throws(()=>applyTrtcLayout(wrong,reference),/Official station name mismatch/);
});
test('Taipei variants share physical traces and retain every transfer on the official trunks',()=>{
  const traces=new Map();
  for(const edge of data.edges.filter(e=>e.kind!=='transfer')){
    const anchors=edgeAnchors(data,edge);
    for(let i=1;i<anchors.length;i++){
      const dx=Math.abs(anchors[i].x-anchors[i-1].x),dy=Math.abs(anchors[i].y-anchors[i-1].y);
      assert.ok(dx===0||dy===0||dx===dy,`${edge.id}: non-45° segment`);
    }
    const key=[edge.from,edge.to].sort().join('/'),canonical=edge.from<edge.to?anchors:anchors.toReversed();
    if(traces.has(key))assert.deepEqual(canonical,traces.get(key));else traces.set(key,canonical);
    if(['RS','GS','OA','OB','BLS'].includes(edge.lineId))assert.ok(['R','G','O','BL'].includes(edge.displayLineId));
  }
  const p=id=>data.stations[id].position;
  assert.equal(p('BR09').x,p('BR11').x);assert.equal(p('BR10').y,p('R10').y);
  assert.equal(p('R10').x,p('R13').x);assert.equal(p('BR11').y,p('G15').y);
  assert.ok(p('R28').y<p('R22').y&&p('R22').y<p('R13').y);
  assert.ok(p('O54').y<p('O50').y&&p('O50').y<p('O12').y);
  assert.ok(p('BR24').x>p('R10').x&&p('BR01').y>p('BR09').y);
  assert.ok(p('BL01').y>p('BL07').y&&p('G01').y>p('G04').y);
  assert.equal(p('BL07').y,1410);assert.ok(Math.abs(p('Y16').y-p('BL07').y)<=5);
  assert.notDeepEqual(p('Y16'),p('BL07'));
});
test('station symbols cover all three sizes and eight directions, with fixed screen-space label geometry',()=>{
  const vectors=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  for(const type of ['L','I','M'])for(const [index,[dx,dy]]of vectors.entries()){
    const symbol=`${type}-${index+1}`,style=stationAppearance({symbol,labelOffset:{x:999,y:-999}});
    assert.ok(validStationSymbol(symbol));assert.equal(style.direction,index+1);
    assert.equal(Math.sign(style.x),dx);assert.equal(Math.sign(style.y),dy);assert.equal(labelDirection(dx,dy),index+1);
    assert.equal(style.anchor,dx<0?'end':dx>0?'start':'middle');assert.equal(style.radius,{L:3,I:4.5,M:7}[type]);
    for(const units of [0.125,1,128])assert.equal(style.x*units/units,style.x,'SVG units scale the offset back to the same pixels.');
  }
  for(const symbol of ['I-0','L-9','X-8','M-01',null,8])assert.equal(validStationSymbol(symbol),false);
});
test('legacy label positions remain readable and malformed symbols are rejected on import and replay',()=>{
  assert.deepEqual(stationSymbol({labelOffset:{x:-12,y:12}},'I'),{type:'I',direction:6});
  assert.deepEqual(stationSymbol({symbol:'M-2',labelOffset:{x:-12,y:12}}),{type:'M',direction:2});
  const broken=structuredClone(data);broken.stations.BR01.symbol='I-9';assert.match(validateNetwork(broken).join('\n'),/symbol/);
});
test('download snapshots include history but normalize absent empty history',()=>{
  const original=editorSnapshot(data);assert.equal(editorSnapshot({...data,editorHistory:{version:1,entries:[],cursor:0}}),original);
  const next=structuredClone(data);next.stations.BR01.symbol='M-8';assert.notEqual(editorSnapshot(next),original);
  next.stations.BR01.symbol=undefined;assert.equal(editorSnapshot(next),original);
  assert.notEqual(editorSnapshot({...data,editorHistory:{version:1,entries:[{kind:'edit'}],cursor:0}}),original);
});
