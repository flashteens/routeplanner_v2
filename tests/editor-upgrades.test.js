import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBlankNetwork} from '../shared/blank-network.js';
import {addEditorItem,nextEdgeId,changeEdgeKind} from '../shared/editor-defaults.js';
import {cleanEdge} from '../shared/edge-fields.js';
import {transferCoefFunc,modernizeEdgeTiming} from '../shared/familiarity.js';
import {editorItems} from '../shared/editor-search.js';
import {transferGraph} from '../shared/transfer-graph.js';
import {expandEdges,findRoute} from '../shared/router.js';
import {validateNetwork} from '../shared/network.js';
import {recordEdit,replayHistory,validateEditorHistory} from '../shared/editor-history.js';
const fixture=()=>{
 let d=createBlankNetwork();for(const [tab,id]of [['stations','A'],['stations','B'],['stations','C'],['lines','L1'],['lines','L2'],['lines','#B.HALL'],['lines','#_B_C']])d=addEditorItem(d,tab,id);
 d=addEditorItem(d,'edges','e00001');d.stations.B.names.zh='暗黑河';d.stations.B.codes=['DR02'];d.stations.B.aliases=['Dark River'];d.stations.B.coordinates={x:100,y:66,z:200};return d;
};
test('Auto IDs handle mixed/custom IDs, imported gaps and retained deleted IDs',()=>{
 const d=fixture();d.edges.push({...d.edges[0],id:'01290'},{...d.edges[0],id:'custom-name'});d.editorHistory={entries:[{changes:[{collection:'edges',key:'e01300'}]}]};assert.equal(nextEdgeId(d),'e01301');assert.equal(nextEdgeId(createBlankNetwork()),'e00001');
});
test('Station creation accepts a rounded visible map position, without changing game XYZ',()=>{
 const d=addEditorItem(createBlankNetwork(),'stations','A',{x:124.4,y:-315.7});assert.deepEqual(d.stations.A.position,{x:124,y:-316});assert.equal(d.stations.A.coordinates,null);
});
test('Kind changes discard obsolete properties atomically and undo restores them',()=>{
 const d=fixture(),original={...d.edges[0],arrivalDirection:'NEXT',reverseArrivalDirection:'PREV',displayLineId:'L1',boardingAllowed:false};d.edges=[original];
 const transfer=changeEdgeKind(d,original,'transfer');assert.equal(transfer.delayWhenUnfamiliar,true);for(const key of ['lineId','direction','directionLabel','reverseDirection','reverseDirectionLabel','arrivalDirection','displayLineId','boardingAllowed','points'])assert.equal(Object.hasOwn(transfer,key),false,key);
 const changed=recordEdit(d,{...d,edges:[transfer]},{kind:'edit',target:'edges:e00001'},validateNetwork);assert.deepEqual(validateEditorHistory(changed,validateNetwork),[]);assert.deepEqual(replayHistory(changed,false,validateNetwork).edges[0],original);assert.deepEqual(replayHistory(replayHistory(changed,false,validateNetwork),true,validateNetwork),changed);
 for(const kind of ['ride','walk']){const converted=changeEdgeKind(d,transfer,kind);assert.equal(converted.delayWhenUnfamiliar,false);assert.equal(Object.hasOwn(converted,'fromLine'),false);assert.equal(Object.hasOwn(converted,'toLine'),false);assert.deepEqual(validateNetwork({...d,edges:[converted]}),[]);}
});
test('Imported transfer ignores invalid stale ride fields in validation and route display',()=>{
 const d=fixture(),first={...d.edges[0],direction:'E',reverseDirection:'W'},last={...first,id:'last',from:'B',to:'C',lineId:'L2'};
 const transfer={id:'t',kind:'transfer',from:'B',to:'B',fromLine:'L1',toLine:'L2',bidirectional:true,metrics:{timeSec:5,distanceKm:0,price:0},lineId:'L1',directionLabel:{zh:'WRONG'},direction:[],reverseDirection:{},displayLineId:'missing',boardingAllowed:'invalid'};d.edges=[first,transfer,last];assert.deepEqual(validateNetwork(d),[]);
 const result=findRoute(d,'A','C');assert.equal(result.success,true);assert.equal(result.steps[1].lineId,'L2');assert.deepEqual(result.steps[1].directionLabel,{});assert.equal(result.metrics.timeSec,65);assert.equal(cleanEdge(transfer).lineId,undefined);
});
test('Search uses aliases, station codes, real XYZ, endpoint names and transfer syntax',()=>{
 const d=fixture();assert.equal(editorItems(d,'stations','100 66 200','zh')[0].id,'B');assert.equal(editorItems(d,'stations','Dark River','zh')[0].id,'B');assert.equal(editorItems(d,'edges','DR02','zh')[0].id,'e00001');assert.equal(editorItems(d,'edges','暗黑河','en')[0].id,'e00001');assert.equal(editorItems(d,'lines','L2','zh')[0].id,'L2');
 d.edges=[{...changeEdgeKind(d,d.edges[0],'transfer'),fromLine:'L2:E',toLine:'#B.HALL'}];assert.equal(editorItems(d,'edges','#B.HALL','zh').length,1);assert.equal(editorItems(d,'edges','L1','zh').length,0);
});
test('Transfer graph preserves exact endpoints, parallel edges and stable layout after selection/timing changes',()=>{
 const d=fixture(),t={id:'t',kind:'transfer',from:'B',to:'B',fromLine:'L1',toLine:'L2',bidirectional:true,metrics:{timeSec:10,distanceKm:0,price:0}};
 d.edges=[t,{...t,id:'t2',fromLine:'L1:E',toLine:'#B.HALL'},{...t,id:'t3',fromLine:'L2',toLine:'L1'}, {...t,id:'t4',fromLine:'#B.HALL',toLine:'#_B_C'},{id:'walk',kind:'walk',from:'B',to:'C',lineId:'#_B_C'}];
 const graph=transferGraph(d,'B');assert.deepEqual(graph.nodes.map(n=>n.id).sort(),['#B.HALL','#_B_C','L1','L1:E','L2']);assert.equal(graph.links.length,4);assert.equal(graph.walks.length,1);assert.notEqual(graph.links[0].path,graph.links[2].path);
 const again=transferGraph({...d,edges:d.edges.toReversed().map(e=>({...e,metrics:{timeSec:99}}))},'B');assert.deepEqual(again.nodes,graph.nodes);assert.deepEqual(again.links.map(e=>e.path),graph.links.map(e=>e.path));
});
test('Shared formula handles enabled/disabled, asymmetric reverse and conditional base times',()=>{
 assert.deepEqual([1,4,7].map(c=>transferCoefFunc(20,c)),[20,37,54]);const d=fixture();d.edges[0]={...d.edges[0],delayWhenUnfamiliar:true,metrics:{timeSec:20,distanceKm:0,price:0},reverseTimeSec:30};let expanded=expandEdges(d,{transferCoef:4});assert.equal(expanded[0].timeSec,37);assert.equal(expanded[1].timeSec,53);
 d.edges[0].variants=[{when:{},timeSec:10,reverseTimeSec:15}];expanded=expandEdges(d,{transferCoef:7});assert.equal(expanded[0].timeSec,32);assert.equal(expanded[1].timeSec,43);d.edges[0].delayWhenUnfamiliar=false;assert.equal(expandEdges(d,{transferCoef:7})[0].timeSec,10);
});
test('Legacy slopes remain readable, while migration removes TRTC walk dwell and stored slopes',()=>{
 const d=fixture();d.edges[0]={...d.edges[0],delayWhenUnfamiliar:undefined,transferSlope:2,reverseTransferSlope:3};assert.equal(expandEdges(d,{transferCoef:4})[0].timeSec,36);assert.equal(expandEdges(d,{transferCoef:4})[1].timeSec,39);
 const fixed=modernizeEdgeTiming({kind:'walk',metrics:{timeSec:630},transferSlope:121.666667,reverseTimeSec:630,reverseTransferSlope:121.666667},'trtc');assert.equal(fixed.metrics.timeSec,600);assert.equal(fixed.reverseTimeSec,600);assert.equal(fixed.delayWhenUnfamiliar,true);assert.equal(fixed.transferSlope,undefined);
});
test('Four shipped maps use booleans only; DR delays and TRTC walking time are corrected',()=>{
 for(const id of ['ftmc','ftmc_preview','trtc','newisle']){const d=JSON.parse(fs.readFileSync(new URL(`../public/data/${id}.json`,import.meta.url)));assert.deepEqual(validateNetwork(d),[]);for(const e of d.edges){assert.equal(typeof e.delayWhenUnfamiliar,'boolean');for(const v of [e,...(e.variants||[])]){assert.equal(v.transferSlope,undefined);assert.equal(v.reverseTransferSlope,undefined);}}}
 const trtc=JSON.parse(fs.readFileSync(new URL('../public/data/trtc.json',import.meta.url)));assert.equal(trtc.edges.find(e=>e.id==='e00316').metrics.timeSec,600);assert.equal(trtc.edges.find(e=>e.id==='e00320').metrics.timeSec,360);
 const roft=JSON.parse(fs.readFileSync(new URL('../public/data/ftmc_preview.json',import.meta.url)));for(const id of ['e01277','e01288','e01289','01290','e01291','e01292'])assert.equal(roft.edges.find(e=>e.id===id).delayWhenUnfamiliar,true);
});
