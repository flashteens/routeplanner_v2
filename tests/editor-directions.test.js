import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBlankNetwork} from '../shared/blank-network.js';
import {addEditorItem} from '../shared/editor-defaults.js';
import {directionCodeProblem,editorDirectionProblems,directionLabelTargets,directionLabelSummary,applyDirectionLabels} from '../shared/editor-directions.js';
import {validateNetwork} from '../shared/network.js';
import {recordEdit,replayHistory,validateEditorHistory} from '../shared/editor-history.js';
function fixture(){
  let data=createBlankNetwork();for(const [tab,id] of [['stations','A'],['stations','B'],['lines','L1'],['lines','L3']])data=addEditorItem(data,tab,id);
  data=addEditorItem(data,'edges','a');const edge={...data.edges[0],direction:'E',reverseDirection:'W',arrivalDirection:'AFTER_E',reverseArrivalDirection:'AFTER_W'};
  return {...data,edges:[
    {...edge,directionLabel:{zh:'往東',en:'East',ja:'東方面'},reverseDirectionLabel:{zh:'往西'}},
    {...edge,id:'b',directionLabel:{zh:'第二月台',en:'Platform 2'}},
    {...edge,id:'c',direction:'W',reverseDirection:'E',directionLabel:{zh:'往西'},reverseDirectionLabel:{zh:'第三月台'}},
    {...edge,id:'d',lineId:'L3',directionLabel:{zh:'另一條線'}},
    {...edge,id:'e',direction:'N',reverseDirection:'S',directionLabel:{zh:'另一方向'}}
  ]};
}
test('direction validation rejects blank and duplicate codes but labels remain optional',()=>{
  const edge=fixture().edges[0];
  for(const value of ['',undefined,'  '])assert.equal(directionCodeProblem(edge,'direction',value),'directionRequired');
  assert.equal(directionCodeProblem(edge,'direction',' W '),'directionsDistinct');
  assert.equal(directionCodeProblem(edge,'reverseDirection','E'),'directionsDistinct');
  assert.equal(directionCodeProblem(edge,'direction','N'),null);
  assert.deepEqual(validateNetwork(fixture()),[]);
});
test('batch scope matches actual line plus code across forward and reverse slots',()=>{
  const data=fixture();assert.deepEqual(directionLabelTargets(data,'L1','E').map(t=>[t.edgeId,t.key]),[['a','directionLabel'],['b','directionLabel'],['c','reverseDirectionLabel']]);
  assert.deepEqual(directionLabelTargets(data,'L1',''),[]);assert.deepEqual(directionLabelTargets(data,'L1',' E '),[]);
  data.edges[3].displayLineId='L1';assert.equal(directionLabelTargets(data,'L1','E').length,3);
});
test('batch replaces all language texts, preserves every other field and never mutates input',()=>{
  const data=fixture(),before=structuredClone(data),result=applyDirectionLabels(data,'a');
  for(const [index,key] of [[0,'directionLabel'],[1,'directionLabel'],[2,'reverseDirectionLabel']])assert.deepEqual(result.edges[index][key],data.edges[0].directionLabel);
  assert.deepEqual(result.edges[3],data.edges[3]);assert.deepEqual(result.edges[4],data.edges[4]);
  assert.deepEqual(result.edges[1].reverseDirectionLabel,data.edges[1].reverseDirectionLabel);assert.deepEqual(result.edges[2].directionLabel,data.edges[2].directionLabel);
  for(const [i,edge] of data.edges.entries())for(const key of ['direction','reverseDirection','lineId','from','to','metrics','arrivalDirection','reverseArrivalDirection'])assert.deepEqual(result.edges[i][key],edge[key]);
  assert.deepEqual(data,before);result.edges[1].directionLabel.zh='獨立物件';assert.equal(result.edges[2].reverseDirectionLabel.zh,'往東');
});
test('reverse source updates both slots and an empty optional label clears matching text',()=>{
  const data=fixture();data.edges[2].reverseDirectionLabel={};const result=applyDirectionLabels(data,'c',true);
  for(const [i,key] of [[0,'directionLabel'],[1,'directionLabel'],[2,'reverseDirectionLabel']])assert.deepEqual(result.edges[i][key],{});
  assert.deepEqual(validateNetwork(result),[]);assert.throws(()=>applyDirectionLabels(data,'missing'),/invalidNetwork/);
});
test('confirmation groups identical multilingual objects regardless of key order',()=>{
  const summary=directionLabelSummary([{label:{zh:'往東',en:'East'}},{label:{en:'East',zh:'往東'}},{label:{zh:'月台'}}],'zh');
  assert.deepEqual(summary,[{text:'往東',extra:null},{text:'月台',extra:null}]);
});
test('confirmation prefers selected language and adds only one distinguishing secondary language',()=>{
  const targets=[{label:{zh:'逆時針',en:'Platform 2',ja:'2番'}},{label:{zh:'逆時針',en:'Platform 3',ja:'3番'}},{label:{zh:'往森林',en:'Forest'}}];
  const summary=directionLabelSummary(targets,'zh');
  assert.equal(summary[0].text,'逆時針');assert.deepEqual(summary[0].extra,{language:'en',text:'Platform 2'});
  assert.deepEqual(summary[1].extra,{language:'en',text:'Platform 3'});assert.equal(summary[2].extra,null);
  assert.equal(directionLabelSummary(targets,'ja')[0].text,'2番');
  assert.deepEqual(directionLabelSummary([{label:{zh:'一樣',en:'Same',ja:'異なるA'}},{label:{zh:'一樣',en:'Same',ja:'異なるB'}}],'zh')[0].extra,{language:'ja',text:'異なるA'});
});
test('batch overwrite is one atomic history group and JSON preserves Undo/Redo',()=>{
  const data=fixture(),next=recordEdit(data,applyDirectionLabels(data,'a'),{kind:'edit',target:'directionLabels:L1:E'},validateNetwork);
  assert.equal(next.editorHistory.entries.length,1);assert.deepEqual(validateEditorHistory(next,validateNetwork),[]);
  const restored=replayHistory(JSON.parse(JSON.stringify(next)),false,validateNetwork);assert.deepEqual(restored.edges,data.edges);
  assert.deepEqual(replayHistory(restored,true,validateNetwork),next);
});
test('RoFT SAL_CCW scope retains branch route IDs and all existing wording groups',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../public/data/ftmc_preview.json',import.meta.url)));
  const targets=directionLabelTargets(data,'SAL','SAL_CCW');assert.ok(targets.length>5);assert.ok(targets.some(t=>t.key==='reverseDirectionLabel'));
  const summary=directionLabelSummary(targets,'zh');assert.ok(summary.length>=4);
  const source=targets[0],result=applyDirectionLabels(data,source.edgeId,source.key==='reverseDirectionLabel');
  assert.deepEqual(validateNetwork(result),[]);
  for(const [i,edge] of data.edges.entries())if(edge.lineId!=='SAL')assert.deepEqual(result.edges[i],edge);
});

test('walk codes are optional but filled opposites must differ; reverse ride code is required only when bidirectional',()=>{
  const walk={kind:'walk',direction:'',reverseDirection:'',bidirectional:true};
  assert.equal(directionCodeProblem(walk,'direction',''),null);assert.equal(directionCodeProblem(walk,'reverseDirection',''),null);
  walk.reverseDirection='E';assert.equal(directionCodeProblem(walk,'direction','E'),'directionsDistinct');
  assert.equal(directionCodeProblem(walk,'direction','W'),null);
  const ride={kind:'ride',direction:'E',bidirectional:false};
  assert.equal(directionCodeProblem(ride,'reverseDirection',''),null);assert.equal(directionCodeProblem(ride,'reverseDirection','E'),'directionsDistinct');
  ride.bidirectional=true;assert.equal(directionCodeProblem(ride,'reverseDirection',''),'directionRequired');
  const data=fixture();data.edges[0]={...data.edges[0],direction:'',reverseDirection:''};
  assert.equal(editorDirectionProblems(data).length,2);
  data.edges[0]={...data.edges[0],kind:'walk'};assert.equal(editorDirectionProblems(data).length,0);
});
