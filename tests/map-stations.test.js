import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mapPaths,nearestSegment} from '../shared/map-geometry.js';
import {stationAppearance} from '../shared/station-symbol.js';
import {mapStationLayout,stationContains,sampleMapPath,showStationLabel,stationLabelOffset} from '../shared/map-stations.js';

function fixture(){
  return {stations:{A:{id:'A',position:{x:0,y:0},symbol:'I-3'},B:{id:'B',position:{x:100,y:0},symbol:'L-3'},C:{id:'C',position:{x:100,y:100},symbol:'L-3'}},lines:{L1:{color:'red'},L2:{color:'blue'}},edges:[{id:'a',lineId:'L1',from:'A',to:'B'},{id:'b',lineId:'L1',from:'B',to:'C'}]};
}
function layout(data,units=1){const edges=data.edges.filter(e=>e.kind!=='transfer');return mapStationLayout(data,edges,mapPaths(data,edges,5*units,12),units);}
function assertOutside(path,marker){
  const points=sampleMapPath(path);
  for(let i=1;i<points.length;i++)for(let j=0;j<=30;j++){
    const t=j/30,p={x:points[i-1].x*(1-t)+points[i].x*t,y:points[i-1].y*(1-t)+points[i].y*t};
    if(stationContains(marker,p))assert.fail(`Passing line enters ${JSON.stringify(marker)} at ${JSON.stringify(p)}`);
  }
}

test('unchecked labels progressively reveal mega, interchange, then limited stations',()=>{
  for(const [zoom,expected] of [[1,[]],[2.5,[]],[3,['M']],[5,['M']],[6,['M','I']],[11,['M','I']],[12,['M','I','L']]]){
    assert.deepEqual(['M','I','L'].filter(type=>showStationLabel(type,zoom)),expected);
  }
  for(const flag of ['all','chosen','hovered','selected'])for(const type of ['M','I','L'])assert.ok(showStationLabel(type,1,{[flag]:true}));
});

test('all eight label directions use the same radial gap, including stretched markers',()=>{
  for(const type of ['M','I','L'])for(let direction=1;direction<=8;direction++){
    const style=stationAppearance({symbol:`${type}-${direction}`});
    assert.ok(Math.abs(Math.hypot(style.x,style.y)-style.radius-7)<1e-8);
    const shape={type,radius:style.radius,halfWidth:style.radius,halfHeight:style.radius,corner:style.radius,ux:1,uy:0};
    for(const units of [.25,1,8]){const scaled={...shape,radius:shape.radius*units,halfWidth:shape.halfWidth*units,halfHeight:shape.halfHeight*units,corner:shape.corner*units};const offset=stationLabelOffset(style,scaled,units);assert.ok(Math.abs(Math.hypot(offset.x,offset.y)/units-style.radius-7)<1e-8);}
  }
});

test('corner station follows the rendered half curve without moving editable data',()=>{
  const data=fixture(),before=structuredClone(data),render=layout(data),station=render.markers.get('B');
  assert.ok(Math.hypot(station.x-100,station.y)>1);
  for(const id of ['a','b'])assert.ok(nearestSegment(sampleMapPath(render.paths.get(id)),station).distance<1e-6);
  assert.deepEqual(data,before);
});

test('interchange spans stopping lanes and detours a passing express without including it',()=>{
  const data=fixture();data.edges=[data.edges[0],{...data.edges[0],id:'second',lineId:'L2'}];
  data.stations.P={id:'P',position:{x:-100,y:0},symbol:'L-3'};data.stations.Q={id:'Q',position:{x:200,y:0},symbol:'L-3'};
  data.lines.X={color:'green'};data.edges.push({id:'passing',lineId:'X',from:'P',to:'Q'});
  const rendered=layout(data),marker=rendered.markers.get('A');
  assert.equal(marker.type,'I');assert.ok(marker.halfWidth>marker.halfHeight);
  assert.ok(marker.stops.every(p=>stationContains(marker,p)));
  assertOutside(rendered.paths.get('passing'),marker);
  const filtered=data.edges.filter(e=>e.id==='passing'),raw=mapPaths(data,filtered);
  assert.equal(mapStationLayout(data,filtered,raw).paths.get('passing'),raw.get('passing'),'Filtering to the express must not detour around a hidden station');
});

test('mega stays circular, expands to its stops and sends passing lines around it',()=>{
  const data=fixture();data.stations.A.symbol='M-3';
  data.edges=[data.edges[0],{...data.edges[0],id:'second',lineId:'L2'}];
  data.stations.P={id:'P',position:{x:-100,y:0},symbol:'L-3'};data.stations.Q={id:'Q',position:{x:200,y:0},symbol:'L-3'};
  data.lines.X={color:'green'};data.edges.push({id:'passing',lineId:'X',from:'P',to:'Q'});
  const rendered=layout(data),marker=rendered.markers.get('A');
  assert.equal(marker.halfWidth,marker.halfHeight);
  assert.ok(marker.stops.every(p=>stationContains(marker,p)));
  assertOutside(rendered.paths.get('passing'),marker);
});

for(const conf of ['ftmc','ftmc_preview'])test(`${conf}: screenshot stations cover stopping tracks without attracting the FT spur`,()=>{
  const data=JSON.parse(fs.readFileSync(new URL(`../public/data/${conf}.json`,import.meta.url))),before=JSON.stringify(data);
  for(const units of [.125,1,2,4,16,32]){
    const rendered=layout(data,units);
    for(const id of ['NWM','GH','GB']){
      const marker=rendered.markers.get(id);
      assert.equal(marker.type,id==='GB'?'M':'I');
      assert.ok(marker.stops.every(p=>stationContains(marker,p)));
      for(const e of data.edges.filter(e=>e.kind!=='transfer'&&(e.from===id||e.to===id))){const points=sampleMapPath(rendered.paths.get(e.id));assert.ok(stationContains(marker,e.from===id?points[0]:points.at(-1)),`${id} must cover the actual stopping endpoint of ${e.id}`);}
      for(const e of data.edges.filter(e=>e.kind!=='transfer'&&e.from!==id&&e.to!==id))assertOutside(rendered.paths.get(e.id),marker);
    }
    for(const id of ['WS03','WS04']){
      const marker=rendered.markers.get(id);assert.equal(marker.type,'L');
      assert.ok(Math.hypot(marker.x-data.stations[id].position.x,marker.y-data.stations[id].position.y)>1);
    }
    for(const e of data.edges.filter(e=>e.lineId==='FT'&&e.from==='GB')){
      const points=sampleMapPath(rendered.paths.get(e.id));
      assert.notDeepEqual(points[0],data.stations.GB.position,'FT starts on its track rather than the station attachment spur');
      assert.ok(stationContains(rendered.markers.get('GB'),points[0]));
    }
  }
  assert.equal(JSON.stringify(data),before);
});

test('a curved passing trace that dips into a station detours without cutting away unrelated bends',()=>{
  const data=fixture();data.stations.A.symbol='M-3';
  data.stations.P={id:'P',position:{x:-30,y:30},symbol:'L-3'};data.stations.Q={id:'Q',position:{x:30,y:30},symbol:'L-3'};
  data.edges.push({id:'curve',lineId:'L2',from:'P',to:'Q'});
  const paths=mapPaths(data,data.edges);paths.set('curve','M -30 30 Q 0 -40 30 30');
  const render=mapStationLayout(data,data.edges,paths,1);
  assert.ok(sampleMapPath(paths.get('curve')).some(p=>stationContains(render.markers.get('A'),p)),'Fixture must pass through the original marker');
  assertOutside(render.paths.get('curve'),render.markers.get('A'));
  assert.notEqual(render.paths.get('curve'),paths.get('curve'));
});
