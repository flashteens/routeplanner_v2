import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {findRoute,expandEdges} from '../shared/router.js';
import {validateNetwork} from '../shared/network.js';
import {edgeDefaults,stationDistanceKm} from '../shared/editor-defaults.js';
import {octilinearPoints,mapPaths,roundedPath} from '../shared/map-geometry.js';
const load=id=>JSON.parse(fs.readFileSync(new URL(`../public/data/${id}.json`,import.meta.url)));
const options={horseSpeedClass:'_NEX',enableExpressCarts:0};
for(const id of ['ftmc','ftmc_preview']){
  test(`${id}: unified L6 default loop and same-platform Camel cart`,()=>{
    const full=load(id),d={...full,edges:full.edges.filter(e=>e.lineId==='L6'||e.fromLine?.startsWith('L6:')&&e.toLine?.startsWith('L6:'))};
    assert.equal(d.lines.L6N,undefined);assert.equal(d.lines.YYL2,undefined);
    assert.ok(full.edges.every(e=>![e.lineId,e.fromLine,e.toLine,e.direction,e.reverseDirection].some(v=>/L6N|YYL2/.test(v||''))),'No obsolete route/direction references remain');
    const normal=findRoute(d,'RS','CMI',{...options,criteria:'transfers'});
    assert.deepEqual(normal.steps.map(e=>e.to),['CH','NSV','CMI']);assert.equal(normal.transfers,0);
    const shortcut=findRoute(d,'RS','CMI',options);
    assert.deepEqual(shortcut.steps.map(e=>e.to),['CH','CH','CMI']);assert.equal(shortcut.steps[1].kind,'transfer');assert.equal(shortcut.transfers,1);
    assert.equal(shortcut.steps[1].fromLine,'L6:L6_N');assert.equal(shortcut.steps[1].toLine,'L6:L6_CAMEL');
    for(const [from,to,expected] of [['CMI','SHV',['CH','RS','CP','NH','OC','RLR','NHT','FP','SVM','SHV']],['NSV','SHV',['CH','RS','CP','NH','OC','RLR','NHT','FP','SVM','SHV']]]){
      const r=findRoute(d,from,to,options);assert.equal(r.success,true);assert.deepEqual(r.steps.map(e=>e.to),expected);assert.equal(r.steps.some(e=>e.kind==='transfer'),false);assert.equal(r.segments.length,1);
    }
    // Force entry onto the default north loop and verify it continues south without changing carts.
    const loopStart={id:'loop-entry',kind:'ride',from:'NV',to:'NSV',lineId:'L6',direction:'L6_N',bidirectional:false,metrics:{timeSec:0,distanceKm:0,price:0}};
    const loop=findRoute({...d,edges:[...d.edges,loopStart]},'NV','RS',options);
    assert.deepEqual(loop.steps.map(e=>e.to),['NSV','CMI','CH','RS']);
    // Force the special cart to arrive at Camel Island and verify the opposite loop order.
    const special=findRoute({...d,edges:[...d.edges,{...loopStart,to:'CMI',direction:'L6_CAMEL'}]},'NV','RS',options);
    assert.deepEqual(special.steps.map(e=>e.to),['CMI','NSV','CH','RS']);
  });
  test(`${id}: Yin Yang branch shares one service and continues to the valley`,()=>{
    const full=load(id),d={...full,edges:full.edges.filter(e=>e.lineId==='YYL'||e.fromLine?.startsWith('YYL:')&&e.toLine?.startsWith('YYL:'))};
    for(const from of ['EP','YY02','YY03']){const r=findRoute(d,from,'YYV',options);assert.equal(r.success,true);assert.ok(r.steps.every(e=>e.lineId==='YYL'));}
    assert.equal(findRoute(d,'YYV','YY02',options).success,true);
  });
  test(`${id}: B1 passengers continue through, intermediate boarding is forbidden`,()=>{
    const full=load(id),d={...full,edges:full.edges.filter(e=>e.lineId==='B1')};
    const through=findRoute(d,'BX_SP','NSV',options);assert.equal(through.success,true);assert.ok(through.steps.some(e=>e.lineId==='B1'));assert.ok(through.steps.some(e=>e.lineId==='L7'));assert.equal(through.transfers,0);
    for(const station of ['GSC','SGP','DP','BC','ZC','FW','IB','PI','DB'])assert.equal(findRoute(d,station,'NSV',options).success,false,station);
    assert.equal(findRoute(d,'GSC','NV',options).success,false);
    for(const e of full.edges.filter(e=>e.lineId==='B1'&&e.displayLineId==='L7'&&e.from!=='NV'&&e.to!=='NV')){
      assert.equal(e.boardingAllowed,false);
      const local=expandEdges(full,options).find(v=>v.lineId==='L7'&&v.from===e.from&&v.to===e.to);
      assert.equal(e.metrics.timeSec,local.timeSec);assert.ok(e.variants.every(v=>v.timeSec===local.timeSec));
    }
    assert.ok(findRoute(full,'GSC','NSV',options).steps.filter(e=>e.kind==='ride').every(e=>e.lineId==='L7'));
  });
  test(`${id}: Beno positions, Nether relocation and octilinear layout`,()=>{
    const d=load(id),gate=d.stations.GH.position;
    for(const station of ['NX01','NX01U'])assert.ok(Math.hypot(d.stations[station].position.x-gate.x,d.stations[station].position.y-gate.y)<150);
    assert.deepEqual(d.stations.NX02.position,{x:-500,y:0});assert.ok(d.sources.beno.matchedStations>=280);assert.ok(d.sources.beno.tracedEdges>400);
    for(const e of d.edges.filter(e=>e.kind!=='transfer')){const points=[d.stations[e.from].position,...e.points,d.stations[e.to].position];
      for(let i=1;i<points.length;i++){const dx=Math.abs(points[i].x-points[i-1].x),dy=Math.abs(points[i].y-points[i-1].y);assert.ok(dx===0||dy===0||dx===dy,`${e.id} has a non-45° segment`);}}
  });
  test(`${id}: circular extensions share main-line traces and retain through-running routes`,()=>{
    const d=load(id),families={ACL5:'ACL',ACL0:'ACL',SAL2:'SAL',SAL0:'SAL',RHL6:'RHL'};
    let shared=0;
    for(const edge of d.edges.filter(e=>families[e.lineId])){
      const main=families[edge.lineId],counterpart=d.edges.find(e=>e.lineId===main&&((e.from===edge.from&&e.to===edge.to)||(e.from===edge.to&&e.to===edge.from)));
      if(!counterpart){assert.equal(edge.displayLineId,undefined);continue;}
      shared++;assert.equal(edge.displayLineId,main);
      assert.deepEqual(edge.points,counterpart.from===edge.from?counterpart.points:counterpart.points.toReversed(),edge.id);
      const paths=mapPaths(d,[edge,counterpart]);
      const canonical={...edge,from:counterpart.from,to:counterpart.to,points:counterpart.points};
      assert.equal(mapPaths(d,[canonical,counterpart]).get(edge.id),paths.get(counterpart.id));
    }
    assert.equal(shared,id==='ftmc'?9:15);
    for(const [prefix,from,to,expected]of [['ACL','SNM','AP',['AC05A','AC05','AP']],['ACL','TR','AC09',['AC10A','AC10','AC09']],['RHL','CO','RB',['RH06A','RH06','ULB','RH04','RH03','MG','RB']],...(id==='ftmc_preview'?[['SAL','RB','PR',['SE02A','SE02','PR']],['SAL','ZY_WS','SE09',['SE14','SE13','SE12','SE11','SE09']]]:[])]){
      const r=findRoute({...d,edges:d.edges.filter(e=>e.lineId?.startsWith(prefix))},from,to,options);
      assert.equal(r.success,true);assert.deepEqual(r.steps.map(e=>e.to),expected);assert.equal(r.transfers,0);
      if(prefix==='RHL')assert.deepEqual(r.steps.map(e=>e.lineId),['RHL6','RHL6','RHL','RHL','RHL','RHL','RHL']);
      else assert.ok(r.steps.every(e=>e.lineId===prefix));
    }
  });
}
test('alighting restriction cannot be bypassed by a station transfer; reverse restrictions work',()=>{
  const full=load('ftmc'),ride=(id,from,to,lineId,extra={})=>({id,from,to,lineId,kind:'ride',direction:'E',reverseDirection:'W',bidirectional:true,metrics:{timeSec:10,distanceKm:0,price:0},...extra});
  const restricted=ride('restricted','GSC','NSV','B1',{boardingAllowed:false,reverseBoardingAllowed:false});
  const transfer={id:'transfer',from:'GSC',to:'GSC',kind:'transfer',fromLine:'L1',toLine:'B1',bidirectional:true,metrics:{timeSec:1,distanceKm:0,price:0}};
  const d={...full,edges:[ride('feeder','NV','GSC','L1'),restricted,transfer]};
  assert.equal(findRoute(d,'NV','NSV',options).success,false);assert.equal(findRoute(d,'NSV','GSC',options).success,false);
  d.edges.push(ride('continuation','NV','GSC','B1'));
  assert.equal(findRoute(d,'NV','NSV',options).success,true);
  assert.ok(validateNetwork({...full,edges:[{...restricted,boardingAllowed:'no'}]}).length);
});
test('parallel paths split partial express/local overlaps and use rounded corners',()=>{
  const d={stations:{A:{position:{x:0,y:0}},B:{position:{x:100,y:0}},C:{position:{x:200,y:0}}},lines:{L1:{},L2:{}}};
  const edges=[{id:'local1',from:'A',to:'B',lineId:'L1'},{id:'local2',from:'B',to:'C',lineId:'L1'},{id:'express',from:'A',to:'C',lineId:'L2'}];
  const paths=mapPaths(d,edges,5);assert.match(paths.get('local1'),/-2\.5/);assert.match(paths.get('express'),/2\.5/);assert.notEqual(paths.get('express'),paths.get('local1'));
  assert.ok(roundedPath(octilinearPoints([{x:0,y:0},{x:100,y:50}])).includes(' Q '));
  const nearby={...d,stations:{...d.stations,D:{position:{x:0,y:1}},E:{position:{x:200,y:1}}}};
  const lanes=mapPaths(nearby,[edges[2],{id:'nearby',from:'D',to:'E',lineId:'L1'}],5);
  assert.match(lanes.get('nearby'),/M 0 -2/);assert.match(lanes.get('express'),/M 0 3/);
});
test('new connections infer existing opaque direction codes, XYZ mileage and transfer syntax',()=>{
  const d=load('ftmc');d.stations.NV.coordinates={x:0,y:0,z:0};d.stations.GSC.coordinates={x:300,y:400,z:0};d.stations.NSV.coordinates={x:600,y:800,z:0};
  d.edges=[{id:'existing',kind:'ride',from:'NV',to:'GSC',lineId:'L1',direction:'CUSTOM_EAST',reverseDirection:'CUSTOM_WEST',bidirectional:true,directionLabel:{zh:'往東'},metrics:{timeSec:10,distanceKm:.5,price:0}}];
  const defaults=edgeDefaults(d,{id:'new',kind:'ride',from:'GSC',to:'NSV',lineId:'L1',metrics:{timeSec:30,distanceKm:0,price:0}});
  assert.equal(defaults.direction,'CUSTOM_EAST');assert.equal(defaults.reverseDirection,'CUSTOM_WEST');assert.equal(defaults.metrics.distanceKm,.5);assert.equal(defaults.metrics.timeSec,30);
  const transfer=edgeDefaults(d,{id:'change',kind:'transfer',from:'NV',to:'NV',fromLine:'L1',toLine:'L7',metrics:{timeSec:5,distanceKm:5,price:0}});
  assert.equal(transfer.fromLine,'L1:CUSTOM_EAST');assert.equal(transfer.metrics.distanceKm,0);
  d.stations.GSC.coordinates=null;assert.equal(stationDistanceKm(d,'GSC','NSV'),0);
});


test('RoFT WS retains asymmetric dwell/travel times in both editions and every option profile',()=>{
  for(const id of ['ftmc','ftmc_preview']){
    const d=load(id);
    for(const horseSpeedClass of d.options.horseSpeeds)for(const enableExpressCarts of d.options.expressLevels)for(const transferCoef of d.options.transferCoefficients){
      const edges=expandEdges(d,{horseSpeedClass,enableExpressCarts,transferCoef}).filter(e=>e.lineId==='WS');
      assert.equal(edges.find(e=>e.from==='HEC'&&e.to==='WS05').timeSec,27.5);
      assert.equal(edges.find(e=>e.from==='WS05'&&e.to==='HEC').timeSec,30);
    }
  }
});
