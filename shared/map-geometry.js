const epsilon=1e-6;
const same=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<epsilon;
export function simplifyPoints(points) {
  const out=[];
  for(const p of points){
    if(out.length&&same(out.at(-1),p))continue;
    while(out.length>1){const a=out.at(-2),b=out.at(-1),u={x:b.x-a.x,y:b.y-a.y},v={x:p.x-b.x,y:p.y-b.y};
      if(Math.abs(u.x*v.y-u.y*v.x)>epsilon||u.x*v.x+u.y*v.y<0)break;out.pop();}
    out.push({...p});
  }
  return out;
}
// Preserve anchors while restricting straight portions to horizontal, vertical or 45°.
export function octilinearPoints(anchors) {
  const out=[];
  for(const b of anchors){const a=out.at(-1);if(a){const dx=b.x-a.x,dy=b.y-a.y,ax=Math.abs(dx),ay=Math.abs(dy);
    if(ax>epsilon&&ay>epsilon&&Math.abs(ax-ay)>epsilon){
      const diagonal=Math.min(ax,ay);
      out.push(ax>ay?{x:b.x-Math.sign(dx)*diagonal,y:a.y}:{x:a.x,y:b.y-Math.sign(dy)*diagonal});
    }}out.push(b);
  }
  return simplifyPoints(out);
}
export function edgeAnchors(data,edge){return [data.stations[edge.from].position,...(edge.points||[]),data.stations[edge.to].position];}
export function roundedPath(points,radius=12,{startCorner=false,endCorner=false}={}) {
  if(!points.length)return '';
  let d=`M ${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(radius,ab/2,bc/2);
    if(!ab||!bc)continue;
    const p={x:b.x+(a.x-b.x)*r/ab,y:b.y+(a.y-b.y)*r/ab},q={x:b.x+(c.x-b.x)*r/bc,y:b.y+(c.y-b.y)*r/bc};
    const midpoint={x:(p.x+2*b.x+q.x)/4,y:(p.y+2*b.y+q.y)/4};
    if(startCorner&&i===1)d=`M ${midpoint.x} ${midpoint.y} Q ${(b.x+q.x)/2} ${(b.y+q.y)/2} ${q.x} ${q.y}`;
    else if(endCorner&&i===points.length-2)return d+` L ${p.x} ${p.y} Q ${(p.x+b.x)/2} ${(p.y+b.y)/2} ${midpoint.x} ${midpoint.y}`;
    else d+=` L ${p.x} ${p.y} Q ${b.x} ${b.y} ${q.x} ${q.y}`;
  }
  if(points.length>1)d+=` L ${points.at(-1).x} ${points.at(-1).y}`;
  return d;
}
export function nearestSegment(points,p) {
  let best={index:0,distance:Infinity,point:p};
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
    const q={x:a.x+t*dx,y:a.y+t*dy},distance=Math.hypot(p.x-q.x,p.y-q.y);
    if(distance<best.distance)best={index:i,distance,point:q};
  }
  return best;
}
// Simplify only the drawing copy where short traced joins cannot fit a curve.
function renderPoints(anchors,gap,radius) {
  const points=octilinearPoints(anchors),spurLimit=Math.max(gap,radius/4);
  // A sub-gap station attachment cannot accommodate a parallel bundle's turn.
  // End on the through track beneath the station symbol instead of drawing a hook.
  if(points.length>2&&Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y)<=spurLimit)points.shift();
  if(points.length>2&&Math.hypot(points.at(-1).x-points.at(-2).x,points.at(-1).y-points.at(-2).y)<=spurLimit)points.pop();
  // Traced maps contain one-unit doglegs between long sections. Once tracks
  // are separated these become reversed inner joins; merge only such tiny,
  // doglegs or short corner bevels in the rendering copy, leaving anchors intact.
  for(let i=1;i<points.length-2;i++){
    const a=points[i-1],b=points[i],c=points[i+1],d=points[i+2];
    const u={x:b.x-a.x,y:b.y-a.y},v={x:c.x-b.x,y:c.y-b.y},w={x:d.x-c.x,y:d.y-c.y};
    const cross=u.x*w.y-u.y*w.x;
    const turnProduct=(u.x*v.y-u.y*v.x)*(v.x*w.y-v.y*w.x),limit=turnProduct>0?radius:gap*.65;
    if(Math.abs(cross)<epsilon||Math.hypot(c.x-b.x,c.y-b.y)>limit*2)continue;
    const t=((c.x-a.x)*w.y-(c.y-a.y)*w.x)/cross,q={x:a.x+t*u.x,y:a.y+t*u.y};
    if(Math.max(Math.hypot(q.x-b.x,q.y-b.y),Math.hypot(q.x-c.x,q.y-c.y))>limit)continue;
    points.splice(i,2,q);i=Math.max(0,i-2);
  }
  return simplifyPoints(points);
}

// Carry corridor direction through bends; canonical normals alone flip at vertical.
function corridorDirections(segments) {
  const all=[...segments.values()].flat().sort((a,b)=>a.ux-b.ux||a.uy-b.uy||a.c-b.c||a.min-b.min||a.max-b.max||a.line.localeCompare(b.line));
  const rank=new Map(all.map((s,i)=>[s,i])),parent=new Map(all.map(s=>[s,s])),sign=new Map(all.map(s=>[s,1]));
  const find=s=>{
    const p=parent.get(s);
    if(p!==s){const root=find(p);sign.set(s,sign.get(s)*sign.get(p));parent.set(s,root);}
    return parent.get(s);
  };
  const join=(a,b,relation)=>{
    const ra=find(a),rb=find(b);
    if(ra!==rb){
      const child=rank.get(ra)<rank.get(rb)?rb:ra,root=child===rb?ra:rb;
      parent.set(child,root);sign.set(child,relation*sign.get(a)*sign.get(b));
    }
    // At a real fork a global direction may be impossible; keep the established
    // shared corridor rather than reversing its lanes to satisfy that branch.
  };
  for(const s of all)for(const v of s.group){
    if(Math.min(s.max,v.max)-Math.max(s.min,v.min)>epsilon)join(s,v,1);
  }
  const bends=[];
  for(const list of segments.values())for(let i=1;i<list.length;i++){
    const a=list[i-1],b=list[i];
    bends.push({a,b,relation:Math.sign(a.tb-a.ta)*Math.sign(b.tb-b.ta),weight:Math.min(a.max-a.min,b.max-b.min)});
  }
  // Long through sections take precedence over tiny station attachment spurs.
  for(const {a,b,relation} of bends.toSorted((a,b)=>b.weight-a.weight))join(a,b,relation);
  const endpoints=new Map();
  for(const s of all)for(const [p,out] of [[s.a,Math.sign(s.tb-s.ta)],[s.b,Math.sign(s.ta-s.tb)]]){
    const key=`${s.line}:${p.x},${p.y}`;
    if(!endpoints.has(key))endpoints.set(key,[]);
    endpoints.get(key).push({s,out});
  }
  for(const entries of endpoints.values()){
    const rays=new Map();
    for(const v of entries)rays.set(`${(v.s.ux*v.out).toFixed(5)},${(v.s.uy*v.out).toFixed(5)}`,v);
    if(rays.size===2){const [a,b]=rays.values();join(a.s,b.s,-a.out*b.out);}
  }
  for(const s of all){find(s);s.side=sign.get(s);}
}

// Join the offset straight lines at their intersection. Inserting another
// octilinear elbow between shifted endpoints creates hooks and lane crossings.
function joinedPoints(pieces) {
  if(!pieces.length)return [];
  const points=[pieces[0].a];
  for(let i=1;i<pieces.length;i++){
    const prev=pieces[i-1],next=pieces[i],u={x:prev.b.x-prev.a.x,y:prev.b.y-prev.a.y},v={x:next.b.x-next.a.x,y:next.b.y-next.a.y};
    const cross=u.x*v.y-u.y*v.x;
    if(same(prev.end,next.start)&&Math.abs(cross)>epsilon){
      const dx=next.a.x-prev.a.x,dy=next.a.y-prev.a.y,t=(dx*v.y-dy*v.x)/cross;
      points.push({x:prev.a.x+t*u.x,y:prev.a.y+t*u.y});
    }else points.push(...octilinearPoints([prev.b,next.a]));
  }
  points.push(pieces.at(-1).b);
  return simplifyPoints(points);
}

// Share a stable lane roster across connected collinear overlaps, including
// express edges that pass intermediate local stations.
export function mapPaths(data,edges,gap=5,radius=12) {
  // Overview zoom must not expand lane spacing beyond the available corner
  // radius: oversized offsets can fold an inner track back across its neighbours.
  if(radius>0)gap=Math.min(gap,radius);
  const orientations=new Map(),segments=new Map();
  for(const e of edges){const points=renderPoints(edgeAnchors(data,e),gap,radius),list=[];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
      if(!len)continue;
      let ux=dx/len,uy=dy/len;if(ux<-epsilon||Math.abs(ux)<epsilon&&uy<0){ux=-ux;uy=-uy;}
      const nx=-uy,ny=ux,c=a.x*nx+a.y*ny,key=[ux,uy].map(v=>v.toFixed(5)).join(','),ta=a.x*ux+a.y*uy,tb=b.x*ux+b.y*uy;
      const s={a,b,ux,uy,nx,ny,c,ta,tb,min:Math.min(ta,tb),max:Math.max(ta,tb),line:e.displayLineId||e.lineId};
      if(!orientations.has(key))orientations.set(key,[]);orientations.get(key).push(s);list.push(s);
    }segments.set(e.id,list);
  }
  // Beno often already separates tracks by a few map units. At a wide zoom
  // those gaps can be smaller than the stroke; treat these as one corridor too.
  for(const values of orientations.values()){
    const corridors=[];
    for(const s of values.toSorted((a,b)=>a.c-b.c)){
      const matches=corridors.filter(g=>s.c-g.c<=gap*.65+epsilon&&g.items.some(v=>Math.min(s.max,v.max)-Math.max(s.min,v.min)>=-epsilon));
      let corridor=matches[0];
      if(!corridor){corridor={c:s.c,items:[]};corridors.push(corridor);}
      for(const other of matches.slice(1)){corridor.items.push(...other.items);corridors.splice(corridors.indexOf(other),1);}
      corridor.items.push(s);
      for(const item of corridor.items)item.group=corridor.items;
    }
  }
  corridorDirections(segments);
  const routes=new Map(),ends=new Map();
  const key=(line,p)=>`${line}:${p.x},${p.y}`;
  const remember=(line,p,piece)=>{
    const k=key(line,p);if(!ends.has(k))ends.set(k,[]);ends.get(k).push(piece);
  };
  const reverse=p=>({a:p.b,b:p.a,start:p.end,end:p.start});
  for(const e of edges){const route=[];
    for(const s of segments.get(e.id)){
      // Reserve slots throughout a contiguous straight corridor. Changing the
      // roster at each express/local endpoint otherwise makes the bundle weave.
      const lines=[...new Set(s.group.map(v=>v.line))].sort(),offset=(lines.indexOf(s.line)-(lines.length-1)/2)*gap*s.side;
      const center=lines.length>1?(Math.min(...s.group.map(v=>v.c))+Math.max(...s.group.map(v=>v.c)))/2:s.c;
      const at=t=>({x:t*s.ux+(center+offset)*s.nx,y:t*s.uy+(center+offset)*s.ny});
      const piece={a:at(s.ta),b:at(s.tb),start:s.a,end:s.b};route.push(piece);
      remember(s.line,piece.start,piece);remember(s.line,piece.end,reverse(piece));
    }
    routes.set(e.id,route);
  }
  const context=(line,piece)=>{
    const rays=new Map();
    for(const p of ends.get(key(line,piece.start))||[]){const dx=p.end.x-p.start.x,dy=p.end.y-p.start.y,len=Math.hypot(dx,dy);rays.set(`${(dx/len).toFixed(5)},${(dy/len).toFixed(5)}`,p);}
    if(rays.size!==2)return null;
    const u={x:piece.end.x-piece.start.x,y:piece.end.y-piece.start.y};
    return [...rays.values()].find(p=>Math.abs(u.x*(p.end.y-p.start.y)-u.y*(p.end.x-p.start.x))>epsilon)||null;
  };
  const paths=new Map();
  for(const e of edges){
    const route=routes.get(e.id),line=e.displayLineId||e.lineId;
    if(!route.length){paths.set(e.id,'');continue;}
    const before=context(line,route[0]),after=context(line,reverse(route.at(-1)));
    const extended=[...(before?[reverse(before)]:[]),...route,...(after?[after]:[])];
    paths.set(e.id,roundedPath(joinedPoints(extended),radius,{startCorner:!!before,endCorner:!!after}));
  }
  return paths;
}

// Add one user anchor; automatic 45° elbows are rendering details, not editable nodes.
export function insertControlPoint(data,edge,position) {
  const anchors=edgeAnchors(data,edge);
  let best={index:0,distance:Infinity};
  for(let i=0;i<anchors.length-1;i++){
    const candidate=nearestSegment(octilinearPoints([anchors[i],anchors[i+1]]),position);
    if(candidate.distance<best.distance)best={index:i,distance:candidate.distance};
  }
  const points=[...(edge.points||[])];
  points.splice(best.index,0,{x:Math.round(position.x),y:Math.round(position.y)});
  return points;
}
export function midpointControlPoint(data,edge) {
  const path=octilinearPoints(edgeAnchors(data,edge));
  const segments=path.slice(1).map((b,i)=>({a:path[i],b,length:Math.hypot(b.x-path[i].x,b.y-path[i].y)}));
  let remaining=segments.reduce((sum,s)=>sum+s.length,0)/2;
  for(const s of segments){if(remaining<=s.length){const ratio=s.length?remaining/s.length:0;return {x:s.a.x+(s.b.x-s.a.x)*ratio,y:s.a.y+(s.b.y-s.a.y)*ratio};}remaining-=s.length;}
  return {...path[0]};
}
