import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mapPaths} from '../shared/map-geometry.js';

// Sample the SVG curves as geometry, so a lane reversal fails even if the
// generated string still contains rounded corners and distinct line offsets.
function sample(path) {
  const tokens=path.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)||[],points=[];
  const point=()=>({x:Number(tokens.shift()),y:Number(tokens.shift())});
  while(tokens.length){
    const command=tokens.shift();
    if(command==='M'||command==='L')points.push(point());
    else {
      assert.equal(command,'Q');const a=points.at(-1),b=point(),c=point();
      for(let i=1;i<=24;i++){const t=i/24,u=1-t;points.push({x:u*u*a.x+2*u*t*b.x+t*t*c.x,y:u*u*a.y+2*u*t*b.y+t*t*c.y});}
    }
  }
  assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  return points;
}
function intersects(a,b,c,d) {
  const cross=(a,b)=>a.x*b.y-a.y*b.x,u={x:b.x-a.x,y:b.y-a.y},v={x:d.x-c.x,y:d.y-c.y},w={x:c.x-a.x,y:c.y-a.y},den=cross(u,v);
  if(Math.abs(den)<1e-8){
    const length=u.x*u.x+u.y*u.y;
    if(length<1e-8||Math.abs(cross(w,u))>1e-8)return false;
    const lo=(w.x*u.x+w.y*u.y)/length,hi=lo+(v.x*u.x+v.y*u.y)/length;
    return Math.min(1,Math.max(lo,hi))-Math.max(0,Math.min(lo,hi))>1e-8;
  }
  const t=cross(w,v)/den,s=cross(w,u)/den;
  return t>=0&&t<=1&&s>=0&&s<=1;
}
function assertSeparate(paths,label) {
  const traces=paths.map(sample);
  for(let i=0;i<traces.length;i++)for(let j=i+1;j<traces.length;j++){
    const a=traces[i],b=traces[j];
    for(let p=1;p<a.length;p++)for(let q=1;q<b.length;q++)assert.ok(!intersects(a[p-1],a[p],b[q-1],b[q]),`${label}: lanes ${i}/${j} cross near ${JSON.stringify(a[p])} / ${JSON.stringify(b[q])}`);
  }
}
function fixture(points) {
  return {stations:{A:{position:points[0]},B:{position:points.at(-1)}},edges:['L1','L2','L3'].map(lineId=>({id:lineId,lineId,from:'A',to:'B',points:points.slice(1,-1)}))};
}

test('shared lanes keep their order through every octant and repeated left/right turns',()=>{
  const points=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100},{x:0,y:200},{x:100,y:300},{x:200,y:200},{x:300,y:300}];
  for(let rotation=0;rotation<8;rotation++)for(const reflection of [1,-1]){
    const angle=rotation*Math.PI/4,c=Math.cos(angle),s=Math.sin(angle);
    const data=fixture(points.map(p=>({x:Math.round((p.x*c-p.y*s)*1e6)/1e6,y:Math.round(reflection*(p.x*s+p.y*c)*1e6)/1e6})));
    const snapshot=structuredClone(data),paths=mapPaths(data,data.edges,5);
    assertSeparate([...paths.values()],`rotation ${rotation}, reflection ${reflection}`);
    assert.ok([...paths.values()].every(p=>p.includes(' Q ')));
    assert.deepEqual(data,snapshot,'Rendering must leave stations and editable points unchanged');
    const reordered=mapPaths(data,data.edges.toReversed(),5);
    for(const [id,path] of paths)assert.equal(reordered.get(id),path,'Lane positions must not depend on edge array order');
    const reversed=mapPaths(data,data.edges.map(e=>({...e,from:e.to,to:e.from,points:e.points.toReversed()})),5);
    for(const [id,path] of paths){const a=sample(path),b=sample(reversed.get(id)).toReversed();assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.hypot(a[i].x-b[i].x,a[i].y-b[i].y)<1e-5,'Reversing operational direction must retain the same visual lane');}
  }
});

test('lane direction continues across station edges and partial express overlaps',()=>{
  const data=fixture([{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100},{x:0,y:200}]);
  data.stations.C={position:{x:100,y:100}};
  const express=data.edges[2],local=data.edges.slice(0,2).flatMap(e=>[
    {...e,id:e.id+'a',to:'C',points:[{x:100,y:0}]},
    {...e,id:e.id+'b',from:'C',points:[{x:0,y:100}]}
  ]);
  const paths=mapPaths(data,[express,...local],5);
  const combine=line=>paths.get(line+'a')+' '+paths.get(line+'b').replace(/^M /,'L ');
  assertSeparate([combine('L1'),combine('L2'),paths.get('L3')],'split local / express');
  for(const line of ['L1','L2'])assert.deepEqual(sample(paths.get(line+'a')).at(-1),sample(paths.get(line+'b'))[0]);
});

test('tiny traced doglegs remain smooth without saving inferred rendering points',()=>{
  const data=fixture([{x:0,y:0},{x:0,y:100},{x:1,y:100},{x:101,y:200}]),before=structuredClone(data);
  const paths=mapPaths(data,data.edges,5);
  assertSeparate([...paths.values()],'tiny dogleg');
  for(const path of paths.values())assert.equal((path.match(/ Q /g)||[]).length,1,'Tiny opposite-turn joins should become one smooth bend');
  assert.deepEqual(data,before);
});

for(const id of ['ftmc','ftmc_preview'])test(`${id}: X3 shared bends do not cross in the full network`,()=>{
  const data=JSON.parse(fs.readFileSync(new URL(`../public/data/${id}.json`,import.meta.url))),before=JSON.stringify(data);
  const edges=data.edges.filter(e=>e.kind!=='transfer');
  for(const gap of [2,5,10,25,50]){
    const paths=mapPaths(data,edges,gap);
    for(const [from,to] of [['GB','FH'],['FH','DG']]){
      const shared=edges.filter(e=>e.lineId?.startsWith('X3')&&e.from===from&&e.to===to);
      assert.ok(shared.length>=3);
      assertSeparate(shared.map(e=>paths.get(e.id)),`${id}, ${from}/${to}, gap ${gap}`);
    }
  }
  assert.equal(JSON.stringify(data),before);
});

test('separate corridors and real forks retain their own geometry',()=>{
  const data=fixture([{x:0,y:0},{x:100,y:0},{x:100,y:100}]);
  data.stations.D={position:{x:300,y:0}};data.stations.E={position:{x:400,y:0}};
  const isolated={id:'isolated',lineId:'L4',from:'D',to:'E'};
  data.edges.push(isolated);
  assert.equal(mapPaths(data,data.edges,5).get('isolated'),'M 300 0 L 400 0','Disconnected collinear tracks must not inherit other corridors’ slots');
  data.stations.F={position:{x:200,y:0}};
  data.edges[2]={...data.edges[2],to:'F',points:[{x:100,y:0}]};
  const paths=mapPaths(data,data.edges,5),fork=sample(paths.get('L3'));
  assert.equal(fork.at(-1).x,200);
  assert.ok(sample(paths.get('L1')).at(-1).y===100);
});
