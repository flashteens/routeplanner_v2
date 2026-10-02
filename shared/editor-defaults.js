const base=value=>value?.split(':')[0];
const location=s=>s?.coordinates?{x:s.coordinates.x,y:s.coordinates.z}:s?.position;
const vector=(data,from,to)=>{const a=location(data.stations[from]),b=location(data.stations[to]);return a&&b?{x:b.x-a.x,y:b.y-a.y}:null;};
export function stationDistanceKm(data,from,to) {
  const a=data.stations[from]?.coordinates,b=data.stations[to]?.coordinates;
  return a&&b?Math.round(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z))/1000:0;
}
export function inferDirection(data,lineId,from,to,excludeId) {
  const target=vector(data,from,to),length=target&&Math.hypot(target.x,target.y),scores=new Map();
  for(const edge of data.edges.filter(e=>e.kind==='ride'&&e.lineId===lineId&&e.id!==excludeId)){
    const candidates=[{from:edge.from,to:edge.to,direction:edge.direction,label:edge.directionLabel}];
    if(edge.bidirectional)candidates.push({from:edge.to,to:edge.from,direction:edge.reverseDirection,label:edge.reverseDirectionLabel});
    for(const c of candidates){if(c.direction==null)continue;const v=vector(data,c.from,c.to),size=v&&Math.hypot(v.x,v.y);
      const similarity=length&&size?(v.x*target.x+v.y*target.y)/(length*size):1;
      const proximity=c.from===from||c.to===to?4:1,score=Math.max(0,similarity)**4*proximity;
      const previous=scores.get(c.direction)||{score:0,label:c.label};previous.score+=score;scores.set(c.direction,previous);
    }
  }
  const best=[...scores].sort((a,b)=>b[1].score-a[1].score)[0];
  if(best&&best[1].score>0)return {direction:best[0],directionLabel:best[1].label||{}};
  const direction=!length?'':Math.abs(target.x)>=Math.abs(target.y)?target.x>0?'E':'W':target.y>0?'S':'N';
  return {direction,directionLabel:{}};
}
export function stationLineSyntax(data,lineId,station,excludeId) {
  const counts=new Map();
  for(const e of data.edges.filter(e=>e.id!==excludeId&&e.kind==='transfer'&&e.from===station))for(const syntax of [e.fromLine,e.toLine])if(base(syntax)===lineId)counts.set(syntax,(counts.get(syntax)||0)+1);
  if(counts.size)return [...counts].sort((a,b)=>b[1]-a[1])[0][0];
  const directions=[];
  for(const e of data.edges.filter(e=>e.kind==='ride'&&e.lineId===lineId)){
    if(e.from===station)directions.push(e.direction);
    if(e.bidirectional&&e.to===station)directions.push(e.reverseDirection);
  }
  for(const dir of directions)if(dir)counts.set(dir,(counts.get(dir)||0)+1);
  const direction=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];
  return direction?`${lineId}:${direction}`:lineId;
}
export function edgeDefaults(data,edge) {
  if(edge.kind==='transfer')return {fromLine:stationLineSyntax(data,base(edge.fromLine),edge.from,edge.id),toLine:stationLineSyntax(data,base(edge.toLine),edge.from,edge.id),metrics:{...edge.metrics,distanceKm:0}};
  if(edge.kind==='walk')return {direction:'',reverseDirection:'',directionLabel:{},reverseDirectionLabel:{},metrics:{...edge.metrics,distanceKm:0}};
  const forward=inferDirection(data,edge.lineId,edge.from,edge.to,edge.id),reverse=inferDirection(data,edge.lineId,edge.to,edge.from,edge.id);
  return {...forward,reverseDirection:reverse.direction,reverseDirectionLabel:reverse.directionLabel,metrics:{...edge.metrics,distanceKm:stationDistanceKm(data,edge.from,edge.to)}};
}
