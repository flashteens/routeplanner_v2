// A deterministic layout: selection and timing are deliberately not inputs.
export function transferGraph(data,station){
  const edges=data.edges.filter(e=>e.kind==='transfer'&&e.from===station).toSorted((a,b)=>a.id.localeCompare(b.id));
  const ids=[...new Set(edges.flatMap(e=>[e.fromLine,e.toLine]))].sort(),radius=Math.max(170,ids.length*40);
  const nodes=ids.map((id,i)=>{const angle=-Math.PI/2+2*Math.PI*i/Math.max(1,ids.length);return{id,x:radius*Math.cos(angle),y:radius*Math.sin(angle),width:Math.max(120,id.length*8+24),height:44,color:data.lines[id.split(':')[0]]?.color||'#8899aa'};});
  const positions=new Map(nodes.map(n=>[n.id,n])),pairs=new Map();
  for(const e of edges){const key=JSON.stringify([e.fromLine,e.toLine].sort());if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(e.id);}
  const links=edges.map(edge=>{
    const a=positions.get(edge.fromLine),b=positions.get(edge.toLine),pair=pairs.get(JSON.stringify([edge.fromLine,edge.toLine].sort())),offset=(pair.indexOf(edge.id)-(pair.length-1)/2)*42;
    if(a===b)return{edge,path:`M ${a.x-25} ${a.y-22} C ${a.x-110} ${a.y-150} ${a.x+110} ${a.y-150} ${a.x+25} ${a.y-22}`,x:a.x,y:a.y-115};
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
    const bound=n=>Math.min(n.width/2/Math.max(1e-9,Math.abs(ux)),n.height/2/Math.max(1e-9,Math.abs(uy)))+5;
    const aa=bound(a),bb=bound(b),start={x:a.x+ux*aa,y:a.y+uy*aa},end={x:b.x-ux*bb,y:b.y-uy*bb};
    const sign=a.id.localeCompare(b.id)<0?1:-1,cx=(start.x+end.x)/2-uy*offset*sign,cy=(start.y+end.y)/2+ux*offset*sign;
    return{edge,path:`M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`,x:(start.x+2*cx+end.x)/4,y:(start.y+2*cy+end.y)/4};
  });
  const walks=data.edges.filter(e=>e.kind==='walk'&&(e.from===station||e.to===station)&&ids.includes(e.lineId)).toSorted((a,b)=>a.id.localeCompare(b.id));
  return {nodes,links,walks,box:{x:-radius-180,y:-radius-180,w:2*radius+360,h:2*radius+360}};
}
