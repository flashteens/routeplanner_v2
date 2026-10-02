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
export function roundedPath(points,radius=12) {
  if(!points.length)return '';
  let d=`M ${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(radius,ab/2,bc/2);
    if(!ab||!bc)continue;
    const p={x:b.x+(a.x-b.x)*r/ab,y:b.y+(a.y-b.y)*r/ab},q={x:b.x+(c.x-b.x)*r/bc,y:b.y+(c.y-b.y)*r/bc};
    d+=` L ${p.x} ${p.y} Q ${b.x} ${b.y} ${q.x} ${q.y}`;
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
// Split collinear overlaps into shared intervals, so express and local services
// stay visible even when one edge passes several intermediate stations.
export function mapPaths(data,edges,gap=5,radius=12) {
  const orientations=new Map(),segments=new Map();
  for(const e of edges){const points=octilinearPoints(edgeAnchors(data,e)),list=[];
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
      let corridor=corridors.find(g=>s.c-g.c<=gap*.65+epsilon&&(Math.abs(s.c-g.c)<epsilon||g.items.some(v=>Math.min(s.max,v.max)-Math.max(s.min,v.min)>epsilon)));
      if(!corridor){corridor={c:s.c,items:[]};corridors.push(corridor);}
      corridor.items.push(s);s.group=corridor.items;
    }
  }
  const paths=new Map();
  for(const e of edges){const points=[];
    for(const s of segments.get(e.id)){
      const cuts=[...new Set([s.min,s.max,...s.group.flatMap(v=>[v.min,v.max]).filter(t=>t>s.min+epsilon&&t<s.max-epsilon)])].sort((a,b)=>a-b);
      const pieces=[];
      for(let i=1;i<cuts.length;i++){
        const lo=cuts[i-1],hi=cuts[i],mid=(lo+hi)/2,active=s.group.filter(v=>v.min<mid&&v.max>mid),lines=[...new Set(active.map(v=>v.line))].sort();
        const offset=(lines.indexOf(s.line)-(lines.length-1)/2)*gap;
        const center=lines.length>1?(Math.min(...active.map(v=>v.c))+Math.max(...active.map(v=>v.c)))/2:s.c;
        const at=t=>({x:t*s.ux+(center+offset)*s.nx,y:t*s.uy+(center+offset)*s.ny});
        pieces.push([at(lo),at(hi)]);
      }
      if(s.ta>s.tb)pieces.reverse().forEach(pair=>points.push(...pair.reverse()));else pieces.forEach(pair=>points.push(...pair));
    }
    paths.set(e.id,roundedPath(octilinearPoints(points),radius));
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
