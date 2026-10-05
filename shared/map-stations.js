import {octilinearPoints,roundedPath,simplifyPoints,nearestSegment} from './map-geometry.js';
import {stationAppearance,stationDefaultType} from './station-symbol.js';

export const stationLabelThresholds={M:3,I:6,L:12};
export function showStationLabel(type,zoom,{all=false,chosen=false,hovered=false,selected=false}={}) {
  return all||chosen||hovered||selected||zoom>=stationLabelThresholds[type];
}

// The renderer emits M/L/Q paths. Sample only curves; project onto straight
// segments exactly. This keeps station placement independent of the DOM.
export function sampleMapPath(path) {
  const tokens=path.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)||[],points=[];
  let i=0;
  const point=()=>({x:Number(tokens[i++]),y:Number(tokens[i++])});
  while(i<tokens.length){
    const command=tokens[i++];
    if(command==='M'||command==='L')points.push(point());
    else if(command==='Q'){
      const a=points.at(-1),b=point(),c=point();
      for(let j=1;j<=24;j++){const t=j/24,u=1-t;points.push({x:u*u*a.x+2*u*t*b.x+t*t*c.x,y:u*u*a.y+2*u*t*b.y+t*t*c.y});}
    }else throw new Error(`Unsupported map path command: ${command}`);
  }
  return points;
}
const local=(shape,p)=>{const dx=p.x-shape.x,dy=p.y-shape.y;return{x:dx*shape.ux+dy*shape.uy,y:-dx*shape.uy+dy*shape.ux};};
export function stationContains(shape,p,padding=0) {
  const q=local(shape,p);
  if(shape.type==='M'||shape.type==='L')return Math.hypot(q.x,q.y)<=shape.radius+padding;
  // Rounded rectangle / capsule, with circular end corners.
  const r=shape.corner+padding,dx=Math.max(0,Math.abs(q.x)-(shape.halfWidth-shape.corner)),dy=Math.max(0,Math.abs(q.y)-(shape.halfHeight-shape.corner));
  return Math.hypot(dx,dy)<=r;
}
function marker(station,style,stops,units) {
  const original=station.position,r=style.radius*units;
  if(!stops.length)return {...original,type:style.type,radius:r,halfWidth:r,halfHeight:r,corner:r,ux:1,uy:0,stops};
  // Rendered endpoints include the shared half-corner endpoint at a station
  // between edges. Unlike the editable anchor, this point lies on the curve.
  const center=stops.reduce((p,q)=>({x:p.x+q.x/stops.length,y:p.y+q.y/stops.length}),{x:0,y:0});
  if(style.type==='L')return {...center,type:'L',radius:r,halfWidth:r,halfHeight:r,corner:r,ux:1,uy:0,stops};
  if(style.type==='M'){
    const radius=Math.max(r,...stops.map(p=>Math.hypot(p.x-center.x,p.y-center.y)+2.5*units));
    return {...center,type:'M',radius,halfWidth:radius,halfHeight:radius,corner:radius,ux:1,uy:0,stops};
  }
  let pair=[stops[0],stops[0]],distance=0;
  for(const a of stops)for(const b of stops){const d=Math.hypot(a.x-b.x,a.y-b.y);if(d>distance){distance=d;pair=[a,b];}}
  const ux=distance?(pair[1].x-pair[0].x)/distance:1,uy=distance?(pair[1].y-pair[0].y)/distance:0;
  const coordinates=stops.map(p=>({x:p.x*ux+p.y*uy,y:-p.x*uy+p.y*ux}));
  const xs=coordinates.map(p=>p.x),ys=coordinates.map(p=>p.y),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  // The extra corner radius places every stop inside the rounded corners too.
  const halfWidth=Math.max(r,(xmax-xmin)/2+r),halfHeight=Math.max(r,(ymax-ymin)/2+r),corner=Math.min(r,halfHeight);
  const x=(xmin+xmax)/2,y=(ymin+ymax)/2;
  return {x:x*ux-y*uy,y:x*uy+y*ux,type:'I',radius:r,halfWidth,halfHeight,corner,ux,uy,stops};
}

// Recover sharp corners from the original quadratic controls. Sampling a curve
// into straight pieces changes its slopes; keep samples only for collision tests.
function pathAnchors(path) {
  const tokens=path.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)||[],points=[];
  let i=0;const point=()=>({x:Number(tokens[i++]),y:Number(tokens[i++])});
  while(i<tokens.length){const command=tokens[i++];if(command==='Q')points.push(point(),point());else points.push(point());}
  return octilinearPoints(simplifyPoints(points));
}
function hitsSegment(a,b,shape,padding=0) {
  const hxWorld=Math.abs(shape.ux)*shape.halfWidth+Math.abs(shape.uy)*shape.halfHeight+padding;
  const hyWorld=Math.abs(shape.uy)*shape.halfWidth+Math.abs(shape.ux)*shape.halfHeight+padding;
  if(Math.min(a.x,b.x)>shape.x+hxWorld||Math.max(a.x,b.x)<shape.x-hxWorld||Math.min(a.y,b.y)>shape.y+hyWorld||Math.max(a.y,b.y)<shape.y-hyWorld)return false;
  const p=local(shape,a),q=local(shape,b);
  if(shape.type==='M')return nearestSegment([p,q],{x:0,y:0}).distance<shape.radius+padding-1e-7;
  // A capsule is the Minkowski sum of its inner rectangle and corner circle.
  const hx=shape.halfWidth-shape.corner,hy=shape.halfHeight-shape.corner,r=shape.corner+padding;
  const corners=[{x:-hx,y:-hy},{x:hx,y:-hy},{x:hx,y:hy},{x:-hx,y:hy}];
  if(stationContains(shape,a,padding)||stationContains(shape,b,padding))return true;
  for(let i=0;i<4;i++){
    const c=corners[i],d=corners[(i+1)%4];
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    if(cross(p,q,c)*cross(p,q,d)<0&&cross(c,d,p)*cross(c,d,q)<0)return true;
    if(Math.min(nearestSegment([p,q],c).distance,nearestSegment([p,q],d).distance,nearestSegment([c,d],p).distance,nearestSegment([c,d],q).distance)<r-1e-7)return true;
  }
  return false;
}
const hitsPath=(points,shape,padding=0)=>points.some((p,i)=>i&&hitsSegment(points[i-1],p,shape,padding));

// A small visibility grid routes around the hub using only the four permitted
// slopes. Clearance includes the configured corner radius, so rounding the
// resulting elbows does not cut through the station marker.
function bypass(a,b,obstacles,radius,clearance,scale=1) {
  const xs=new Set([a.x,b.x]),ys=new Set([a.y,b.y]);
  for(const shape of obstacles){
    const margin=clearance+radius*scale;
    const hx=Math.abs(shape.ux)*shape.halfWidth+Math.abs(shape.uy)*shape.halfHeight+margin;
    const hy=Math.abs(shape.uy)*shape.halfWidth+Math.abs(shape.ux)*shape.halfHeight+margin;
    xs.add(shape.x-hx);xs.add(shape.x+hx);ys.add(shape.y-hy);ys.add(shape.y+hy);
  }
  const nodes=[...xs].flatMap(x=>[...ys].map(y=>({x,y}))).filter(p=>!obstacles.some(shape=>stationContains(shape,p,clearance)));
  const start=nodes.findIndex(p=>Math.hypot(p.x-a.x,p.y-a.y)<1e-7),end=nodes.findIndex(p=>Math.hypot(p.x-b.x,p.y-b.y)<1e-7);
  if(start<0||end<0)return null;
  const distance=nodes.map(()=>Infinity),previous=new Map(),pending=new Set(nodes.map((_,i)=>i));distance[start]=0;
  while(pending.size){
    const current=[...pending].reduce((a,b)=>distance[a]<distance[b]?a:b);pending.delete(current);
    if(!Number.isFinite(distance[current]))break;
    if(current===end){const points=[];for(let n=end;n!==undefined;n=previous.get(n))points.push(nodes[n]);return simplifyPoints(points.toReversed());}
    const p=nodes[current];
    for(const next of pending){
      const q=nodes[next],dx=Math.abs(p.x-q.x),dy=Math.abs(p.y-q.y);
      if(dx>1e-7&&dy>1e-7&&Math.abs(dx-dy)>1e-7)continue;
      if(obstacles.some(shape=>hitsSegment(p,q,shape,clearance)))continue;
      const alignment=Math.abs((q.x-p.x)*(b.y-a.y)-(q.y-p.y)*(b.x-a.x));
      const endpointTurn=(current===start||next===end)&&alignment>1e-7?Math.max(radius,1)*.01:0;
      const cost=distance[current]+Math.hypot(dx,dy)+endpointTurn;
      if(cost<distance[next]){distance[next]=cost;previous.set(next,current);}
    }
  }
  return null;
}
function avoidMarkers(path,obstacles,radius,clearance) {
  let anchors=pathAnchors(path),changed=false;
  // Work on whole runs through obstacles, including nearby corners. Endpoints
  // at another station stay fixed; unrelated parts keep their original anchors.
  for(let attempt=1;attempt<=4;attempt++){
    const output=[anchors[0]];let repaired=false;
    for(let i=1;i<anchors.length;i++){
      const a=output.at(-1),b=anchors[i],active=obstacles.filter(shape=>hitsSegment(a,b,shape,clearance));
      if(!active.length){output.push(b);continue;}
      let end=i;
      while(end<anchors.length-1&&active.some(shape=>stationContains(shape,anchors[end],clearance)))end++;
      const target=anchors[end],relevant=obstacles.filter(shape=>hitsPath(anchors.slice(i-1,end+1),shape,clearance));
      const detour=bypass(a,target,relevant,radius,clearance,attempt);
      if(detour){output.push(...detour.slice(1));i=end;repaired=true;}
      else output.push(b);
    }
    anchors=simplifyPoints(output);changed||=repaired;
    const rendered=roundedPath(anchors,radius);
    if(!obstacles.some(shape=>hitsPath(sampleMapPath(rendered),shape)))return changed?rendered:path;
  }
  return changed?roundedPath(anchors,radius):path;
}

export function mapStationLayout(data,edges,paths,units=1) {
  const traces=new Map(edges.map(e=>[e.id,sampleMapPath(paths.get(e.id)||'')])),markers=new Map();
  const incident=new Map();
  for(const edge of edges)for(const id of new Set([edge.from,edge.to])){
    const points=traces.get(edge.id);if(points.length<2)continue;
    if(!incident.has(id))incident.set(id,[]);
    incident.get(id).push(id===edge.from?points[0]:points.at(-1));
  }
  for(const station of Object.values(data.stations)){
    const style=stationAppearance(station,stationDefaultType(data,station.id));
    // At overview scale a fixed pixel-sized hub can swallow nearby stations.
    // Limit its minimum size by neighbour spacing; the actual stopping tracks
    // still determine the required extension, so the hub never loses a stop.
    const neighbours=Object.values(data.stations).map(s=>Math.hypot(s.position.x-station.position.x,s.position.y-station.position.y)).filter(d=>d>1e-6);
    const markerUnits=style.type==='L'?units:Math.min(units,Math.min(...neighbours)/24);
    markers.set(station.id,marker(station,style,incident.get(station.id)||[],markerUnits));
  }
  const rendered=new Map(paths),radius=data.map?.cornerRadius??12;
  for(const edge of edges){
    const points=traces.get(edge.id);
    if(points.length<2)continue;
    const obstacles=[...markers].filter(([id,shape])=>incident.has(id)&&shape.type!=='L'&&id!==edge.from&&id!==edge.to).map(([,shape])=>shape);
    if(!obstacles.some(shape=>hitsPath(points,shape)))continue;
    // Include nearby hubs for the search; a detour must not enter another hub.
    const nearby=obstacles.filter(shape=>hitsPath(points,shape,radius+3*units));
    rendered.set(edge.id,avoidMarkers(paths.get(edge.id),nearby,radius,Math.min(3*units,...nearby.map(s=>s.radius*.65))));
  }
  return {markers,paths:rendered};
}

export function stationLabelOffset(style,shape,units=1) {
  const length=Math.hypot(style.x,style.y),dx=style.x/length,dy=style.y/length;
  // Use the support of the displayed marker, not its old fixed radius.
  const along=dx*shape.ux+dy*shape.uy,across=-dx*shape.uy+dy*shape.ux;
  const extent=shape.type==='I'?Math.abs(along)*(shape.halfWidth-shape.corner)+Math.abs(across)*(shape.halfHeight-shape.corner)+shape.corner:shape.radius;
  return {x:dx*(extent+7*units),y:dy*(extent+7*units)};
}
