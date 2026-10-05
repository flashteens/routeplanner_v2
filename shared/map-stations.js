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
const world=(shape,p)=>({x:shape.x+p.x*shape.ux-p.y*shape.uy,y:shape.y+p.x*shape.uy+p.y*shape.ux});
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

// Route a passing trace around an enclosing ellipse. For an interchange this
// ellipse encloses its rounded rectangle, so a pass-through cannot look like a
// stop. Tangent joins avoid introducing a V-shaped excursion toward the station.
function avoidMarker(points,shape,clearance) {
  const circle=shape.type==='M',rx=(shape.halfWidth+clearance)*(circle?1:Math.SQRT2),ry=(shape.halfHeight+clearance)*(circle?1:Math.SQRT2);
  const normalized=p=>{const q=local(shape,p);return{x:q.x/rx,y:q.y/ry};};
  const at=p=>world(shape,{x:p.x*rx,y:p.y*ry});
  const out=[];let changed=false;
  for(let i=1;i<points.length;i++){
    const begin=i,a=points[i-1];let last=i;
    // Consume an entire inside run, including curve samples, as one bypass.
    const initial=normalized(a);
    if(Math.hypot(initial.x,initial.y)>=1){
      while(last<points.length-1){const v=normalized(points[last]);if(Math.hypot(v.x,v.y)>=1)break;last++;}
    }
    const b=points[last],p=normalized(a),q=normalized(b);i=last;
    const dx=q.x-p.x,dy=q.y-p.y,A=dx*dx+dy*dy,B=2*(p.x*dx+p.y*dy),C=p.x*p.x+p.y*p.y-1,disc=B*B-4*A*C;
    if(!out.length)out.push(a);
    const insideRun=last>begin;
    if(!insideRun&&(!A||disc<=0)){out.push(...points.slice(begin,last+1));continue;}
    const lo=insideRun?0:Math.max(0,(-B-Math.sqrt(disc))/(2*A)),hi=insideRun?1:Math.min(1,(-B+Math.sqrt(disc))/(2*A));
    if(hi<=lo||lo>=1||hi<=0){out.push(...points.slice(begin,last+1));continue;}
    // Only detour through edges with endpoints outside the symbol. Stops at
    // another nearby station must retain their real endpoint rather than move.
    if(Math.hypot(p.x,p.y)<1||Math.hypot(q.x,q.y)<1){out.push(...points.slice(begin,last+1));continue;}
    const entry=insideRun?normalized(points[begin]):{x:p.x+lo*dx,y:p.y+lo*dy},exit=insideRun?normalized(points[last-1]):{x:p.x+hi*dx,y:p.y+hi*dy};
    let start=Math.atan2(entry.y,entry.x),end=Math.atan2(exit.y,exit.x),delta=Math.atan2(Math.sin(end-start),Math.cos(end-start));
    // Tangency from the outside endpoints to a slightly larger ellipse yields
    // smooth approach/departure and keeps the approximated arc outside it.
    const direction=delta>=0?1:-1;
    const tangent=(v,near)=>{
      const angle=Math.atan2(v.y,v.x),offset=Math.acos(Math.min(1,1/Math.hypot(v.x,v.y))),candidates=[angle-offset,angle+offset];
      return candidates.toSorted((a,b)=>Math.abs(Math.atan2(Math.sin(a-near),Math.cos(a-near)))-Math.abs(Math.atan2(Math.sin(b-near),Math.cos(b-near))))[0];
    };
    start=tangent(p,start);end=tangent(q,end);delta=end-start;
    while(direction*delta<0)delta+=direction*2*Math.PI;
    while(direction*delta>2*Math.PI)delta-=direction*2*Math.PI;
    const steps=Math.max(2,Math.ceil(Math.abs(delta)/(Math.PI/24))),inflate=1/Math.cos(Math.abs(delta)/steps/2)+.002;
    for(let j=0;j<=steps;j++){const angle=start+delta*j/steps;out.push(at({x:Math.cos(angle)*inflate,y:Math.sin(angle)*inflate}));}
    out.push(b);changed=true;
  }
  return {points:out,changed};
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
  const rendered=new Map(paths);
  for(const edge of edges){
    let points=traces.get(edge.id),changed=false;
    for(const [id,shape] of markers){
      if(!incident.has(id)||shape.type==='L'||id===edge.from||id===edge.to||points.length<2)continue;
      const padding=Math.min(3*units,shape.radius*.65);
      // Cheap bounds rejection keeps overview rendering practical.
      if(!points.some((p,i)=>i&&Math.min(p.x,points[i-1].x)<=shape.x+shape.halfWidth+shape.halfHeight+padding&&Math.max(p.x,points[i-1].x)>=shape.x-shape.halfWidth-shape.halfHeight-padding&&Math.min(p.y,points[i-1].y)<=shape.y+shape.halfWidth+shape.halfHeight+padding&&Math.max(p.y,points[i-1].y)>=shape.y-shape.halfWidth-shape.halfHeight-padding))continue;
      const result=avoidMarker(points,shape,padding);points=result.points;changed||=result.changed;
    }
    if(changed)rendered.set(edge.id,points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '));
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
