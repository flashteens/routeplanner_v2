const directions={1:[-1,-1],2:[0,-1],3:[1,-1],4:[-1,0],5:[1,0],6:[-1,1],7:[0,1],8:[1,1]};
export const validStationSymbol=value=>typeof value==='string'&&/^[ILM]-[1-8]$/.test(value);
export function stationDefaultType(data,id){
  const colors=new Set(data.edges.filter(e=>e.kind!=='transfer'&&(e.from===id||e.to===id)).map(e=>data.lines[e.displayLineId||e.lineId]?.color).filter(Boolean));
  return colors.size>1?'I':'L';
}
export function labelDirection(x,y){
  if(!x&&!y)return 3;
  return [5,8,7,6,4,1,2,3][(Math.round(Math.atan2(y,x)/(Math.PI/4))+8)%8];
}
export function stationSymbol(station,defaultType='L'){
  if(validStationSymbol(station.symbol)){const [type,direction]=station.symbol.split('-');return {type,direction:Number(direction)};}
  // Old documents remain readable; symbol takes precedence once explicitly set.
  const offset=station.labelOffset??{x:12,y:-12};
  return {type:defaultType,direction:labelDirection(offset.x,offset.y)};
}
export function stationAppearance(station,defaultType='L'){
  const {type,direction}=stationSymbol(station,defaultType),radius={L:3,I:4.5,M:7}[type];
  const [dx,dy]=directions[direction],gap=radius+7;
  return {type,direction,radius,x:dx*gap,y:dy*gap,anchor:dx<0?'end':dx>0?'start':'middle',baseline:dy<0?'auto':dy>0?'hanging':'middle'};
}
