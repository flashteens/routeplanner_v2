import {octilinearPoints,simplifyPoints,nearestSegment} from '../shared/map-geometry.js';

// Read only literal assignments. Beno save files are never evaluated as code.
export function readBeno(source) {
  const values={};
  for(const match of source.matchAll(/(line\w+)\s*=\s*("(?:[^"\\]|\\.)*"|[-\d.]+)/g))values[match[1]]=JSON.parse(match[2]);
  const routes=[],stations=[];
  for(let n=1;n<=59;n++){
    const prefix=`line${n}`,segments=[];
    for(const type of ['ver','hor','topleft','topright'])for(let i=1;i<=(values[prefix+type]||0);i++){
      const p=prefix+type+i;
      const pair=type==='ver'?[{x:values[p+'x'],y:values[p+'y1']},{x:values[p+'x'],y:values[p+'y2']}]:type==='hor'?[{x:values[p+'x1'],y:values[p+'y']},{x:values[p+'x2'],y:values[p+'y']}]:type==='topleft'?[{x:values[p+'x'],y:values[p+'y']},{x:values[p+'x']+values[p+'width'],y:values[p+'y']+values[p+'width']}]:[{x:values[p+'x'],y:values[p+'y']},{x:values[p+'x']-values[p+'width'],y:values[p+'y']+values[p+'width']}];
      if(pair.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))&&!pair.every(p=>p.x===pair[0].x&&p.y===pair[0].y))segments.push(pair);
    }
    routes.push({number:n,color:values[prefix+'col'],segments});
    for(let i=1;i<=(values[prefix+'stations']||0);i++){
      const p=prefix+'station'+i,text=values[p+'text']||'';
      stations.push({position:{x:values[p+'x'],y:values[p+'y']},names:text.split('%'),dir:values[p+'dir']});
    }
  }
  return {routes,stations};
}
const normalized=s=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
function routeBetween(segments,from,to) {
  const project=p=>segments.map((s,i)=>({...nearestSegment(s,p),segment:i})).sort((a,b)=>a.distance-b.distance)[0];
  const a=project(from),b=project(to);
  if(!a||!b||a.distance>110||b.distance>110)return null;
  const nodes=[],adj=[];
  const node=p=>{let i=nodes.findIndex(q=>Math.hypot(p.x-q.x,p.y-q.y)<.05);if(i<0){i=nodes.length;nodes.push(p);adj.push([]);}return i;};
  const connect=(u,v)=>{const cost=Math.hypot(nodes[u].x-nodes[v].x,nodes[u].y-nodes[v].y);adj[u].push([v,cost]);adj[v].push([u,cost]);};
  // Include projections and intersections, including shared endpoints/branches.
  const splits=segments.map(s=>[...s]);
  splits[a.segment].push(a.point);splits[b.segment].push(b.point);
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const [p,q]=segments[i],[r,s]=segments[j],dx=q.x-p.x,dy=q.y-p.y,ex=s.x-r.x,ey=s.y-r.y,det=dx*ey-dy*ex;
    if(Math.abs(det)<1e-6){for(const v of [p,q])if(nearestSegment([r,s],v).distance<.05)splits[j].push(v);for(const v of [r,s])if(nearestSegment([p,q],v).distance<.05)splits[i].push(v);continue;}
    const t=((r.x-p.x)*ey-(r.y-p.y)*ex)/det,u=((r.x-p.x)*dy-(r.y-p.y)*dx)/det;
    if(t>=0&&t<=1&&u>=0&&u<=1){const v={x:p.x+t*dx,y:p.y+t*dy};splits[i].push(v);splits[j].push(v);}
  }
  for(const list of splits){const origin=list[0];list.sort((p,q)=>Math.hypot(p.x-origin.x,p.y-origin.y)-Math.hypot(q.x-origin.x,q.y-origin.y));for(let i=1;i<list.length;i++)connect(node(list[i-1]),node(list[i]));}
  const start=node(a.point),end=node(b.point),distance=nodes.map(()=>Infinity),previous=[],visited=new Set();distance[start]=0;
  while(visited.size<nodes.length){let u=-1;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(u<0||distance[i]<distance[u]))u=i;
    if(u<0||!Number.isFinite(distance[u]))break;if(u===end)break;visited.add(u);
    for(const [v,cost]of adj[u])if(distance[u]+cost<distance[v]){distance[v]=distance[u]+cost;previous[v]=u;}
  }
  if(!Number.isFinite(distance[end]))return null;
  const path=[];for(let u=end;u!=null;u=previous[u])path.unshift(nodes[u]);
  // Avoid an inappropriate detour around an entire circular line.
  if(distance[end]>Math.hypot(from.x-to.x,from.y-to.y)*3+400)return null;
  return simplifyPoints([from,...path,to]);
}
export function applyBenoLayout(data,source) {
  const beno=readBeno(source),matches=new Map(),raw=new Map();
  for(const s of beno.stations)for(const name of s.names)if(name.trim()&&!matches.has(normalized(name)))matches.set(normalized(name),s);
  const gate=matches.get(normalized('地獄之門')).position,transform=p=>({x:Math.round((p.x-gate.x)*.5+175),y:Math.round((p.y-gate.y)*.5-22)});
  let matched=0,traced=0;
  for(const s of Object.values(data.stations)){
    const match=[...Object.values(s.names),...(s.aliases||[])].map(v=>matches.get(normalized(v))).find(Boolean);
    if(match){raw.set(s.id,match.position);s.position=transform(match.position);matched++;s.labelOffset={x:match.dir<=4?-12:12,y:match.dir===3||match.dir===7?14:-12};}
  }
  // Preview-only stations inherit the displacement of the nearest matched XYZ.
  const anchors=Object.values(data.stations).filter(s=>raw.has(s.id)&&s.coordinates);
  for(const s of Object.values(data.stations).filter(s=>!raw.has(s.id)&&s.coordinates)){
    const near=anchors.toSorted((a,b)=>Math.hypot(a.coordinates.x-s.coordinates.x,a.coordinates.z-s.coordinates.z)-Math.hypot(b.coordinates.x-s.coordinates.x,b.coordinates.z-s.coordinates.z))[0];
    if(near)s.position={x:Math.round(near.position.x+(s.coordinates.x-near.coordinates.x)*.35),y:Math.round(near.position.y+(s.coordinates.z-near.coordinates.z)*.35)};
  }
  data.stations.NX01.position={x:120,y:30};data.stations.NX01U.position={x:160,y:70};data.stations.NX02.position={x:-500,y:0};
  for(const e of data.edges.filter(e=>e.kind!=='transfer')){
    const a=data.stations[e.from].position,b=data.stations[e.to].position;
    const route=beno.routes.find(r=>r.number>4&&r.color===data.lines[e.lineId].color)||(/^(X2|X3|WS)/.test(e.lineId)?beno.routes.find(r=>r.color===data.lines[e.lineId.replace(/^(X2).*$/,'$1').replace(/^(X3).*$/,'$1C')]?.color):null);
    const path=route&&raw.has(e.from)&&raw.has(e.to)?routeBetween(route.segments,raw.get(e.from),raw.get(e.to)):null;
    if(path)traced++;
    e.points=octilinearPoints(path?path.map(transform):[a,b]).slice(1,-1);
  }
  for(const e of data.edges.filter(e=>e.displayLineId)){
    const local=data.edges.find(v=>v.lineId===e.displayLineId&&((v.from===e.from&&v.to===e.to)||(v.from===e.to&&v.to===e.from)));
    if(local)e.points=(local.from===e.from?local.points:local.points.toReversed()).map(p=>({...p}));
  }
  data.map={style:'octilinear',cornerRadius:12,parallelGap:5};
  data.sources.beno={source:'Complete Map 20260920.txt',image:'Complete Map 20260920.png',editor:'https://beno.uk/metromapcreator/',matchedStations:matched,tracedEdges:traced};
  return data;
}
