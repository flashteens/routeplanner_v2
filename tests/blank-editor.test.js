import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlankNetwork} from '../shared/blank-network.js';
import {addEditorItem,edgeDefaults} from '../shared/editor-defaults.js';
import {validateNetwork,searchStations} from '../shared/network.js';
import {mapPaths,insertControlPoint,midpointControlPoint} from '../shared/map-geometry.js';
import {mapStationLayout} from '../shared/map-stations.js';
import {normalizeOptions,expandEdges,findRoute} from '../shared/router.js';
import {recordEdit,replayHistory,validateEditorHistory,withoutHistory} from '../shared/editor-history.js';
import {editorSnapshot} from '../shared/editor-document.js';

const add=(data,tab,id)=>recordEdit(data,addEditorItem(data,tab,id),{kind:'add',target:`${tab}:${id}`},validateNetwork);
const render=data=>mapStationLayout(data,data.edges,mapPaths(data,data.edges),1);
function simpleNetwork(){
  let data=createBlankNetwork();
  for(const [tab,id] of [['stations','A'],['stations','B'],['lines','L1']])data=add(data,tab,id);
  const next={...data,stations:{...data.stations,B:{...data.stations.B,position:{x:120,y:80},coordinates:{x:120,y:62,z:80}}}};
  data=recordEdit(data,next,{kind:'move',target:'station:B:position'},validateNetwork);
  return add(data,'edges','AB');
}

test('blank document validates, normalizes options and renders without stations or lines',()=>{
  const data=createBlankNetwork();
  assert.deepEqual(validateNetwork(data),[]);assert.deepEqual(searchStations(data,'A'),[]);
  assert.equal(normalizeOptions(data).criteria,'time');assert.deepEqual(expandEdges(data),[]);
  assert.equal(render(data).markers.size,0);assert.equal(render(data).paths.size,0);
});
test('each blank document has independent nested objects and default options',()=>{
  const first=createBlankNetwork(),second=createBlankNetwork();
  first.stations.A={id:'A'};first.options.criteria.push('transferTime');first.options.comparators.time[0].timeSec=9;
  assert.deepEqual(second.stations,{});assert.equal(second.options.criteria.length,4);
  assert.equal(second.options.comparators.time[0].timeSec,1);
});
test('adding connections before two stations and a line is rejected without changing the document',()=>{
  let data=createBlankNetwork();const original=editorSnapshot(data);
  assert.throws(()=>addEditorItem(data,'edges','AB'),/invalidNetwork/);assert.equal(editorSnapshot(data),original);
  data=add(data,'stations','A');data=add(data,'lines','L1');
  assert.throws(()=>addEditorItem(data,'edges','AB'),/invalidNetwork/);
  const noLine=add(add(createBlankNetwork(),'stations','A'),'stations','B');
  assert.throws(()=>addEditorItem(noLine,'edges','AB'),/invalidNetwork/);
});
test('stations and lines can be created in either order, including coincident initial stations',()=>{
  for(const order of [[['lines','L1'],['stations','A'],['stations','B']],[['stations','A'],['stations','B'],['lines','L1']]]){
    let data=createBlankNetwork();for(const [tab,id] of order){data=add(data,tab,id);assert.deepEqual(validateNetwork(data),[]);render(data);}
    data=add(data,'edges','AB');assert.deepEqual(validateNetwork(data),[]);assert.deepEqual(validateEditorHistory(data,validateNetwork),[]);
    const layout=render(data);assert.equal(layout.markers.size,2);assert.equal(layout.paths.size,1);
    for(const marker of layout.markers.values())assert.ok(Number.isFinite(marker.x)&&Number.isFinite(marker.y));
    assert.ok(findRoute(data,'A','B').success);assert.ok(findRoute(data,'B','A').success);
  }
});
test('new stations, line, bend and connection render and route after moving a station',()=>{
  let data=simpleNetwork(),edge=data.edges[0];
  const points=insertControlPoint(data,edge,midpointControlPoint(data,edge));
  data=recordEdit(data,{...data,edges:[{...edge,points}]},{kind:'edit',target:'edge:AB:points'},validateNetwork);
  assert.deepEqual(validateNetwork(data),[]);assert.equal(data.edges[0].points.length,1);
  assert.ok(render(data).paths.get('AB').startsWith('M '));
  for(const criteria of data.options.criteria)for(const [from,to] of [['A','B'],['B','A']]){
    const route=findRoute(data,from,to,{criteria});assert.ok(route.success);assert.equal(route.metrics.timeSec,30);assert.equal(route.stops,1);
  }
});
test('all initial edits undo back to empty collections and redo to the same portable document',()=>{
  const original=simpleNetwork();let data=original;const count=data.editorHistory.cursor;
  for(let i=0;i<count;i++){data=replayHistory(data,false,validateNetwork);render(data);}
  assert.deepEqual(withoutHistory(data),createBlankNetwork());
  for(let i=0;i<count;i++){data=replayHistory(data,true,validateNetwork);render(data);}
  assert.deepEqual(data,original);
  const loaded=JSON.parse(editorSnapshot(data));assert.deepEqual(validateNetwork(loaded),[]);
  assert.deepEqual(validateEditorHistory(loaded,validateNetwork),[]);assert.deepEqual(render(loaded).paths,render(data).paths);
});
test('duplicate and unsafe IDs are rejected for an initially empty document',()=>{
  const data=add(createBlankNetwork(),'stations','A');
  for(const id of ['A','__proto__','constructor','prototype','editorHistory','bad id',''])assert.throws(()=>addEditorItem(data,'stations',id),/duplicateId/);
  assert.deepEqual(Object.keys(data.stations),['A']);
});

// These two segments turn 90 degrees but remain one continuous service.
test('new connections on the same line keep their travel direction around a right-angle bend',()=>{
  let data=simpleNetwork();
  data=add(data,'stations','C');
  data={...data,stations:{...data.stations,B:{...data.stations.B,position:{x:120,y:0}},C:{...data.stations.C,position:{x:120,y:100}}}};
  data=addEditorItem(data,'edges','BC');
  const next={...data.edges.at(-1),from:'B',to:'C'};
  data={...data,edges:[data.edges[0],{...next,...edgeDefaults(data,next)}]};
  assert.equal(data.edges[1].direction,data.edges[0].direction);
  assert.equal(data.edges[1].reverseDirection,data.edges[0].reverseDirection);
  assert.deepEqual(validateNetwork(data),[]);render(data);
  for(const [from,to] of [['A','C'],['C','A']]){
    const route=findRoute(data,from,to);assert.ok(route.success);assert.equal(route.metrics.timeSec,60);assert.equal(route.transfers,0);assert.equal(route.stops,2);
  }
});
