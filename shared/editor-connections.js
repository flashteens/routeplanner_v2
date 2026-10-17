import {nextEdgeId} from './editor-defaults.js';
import {cleanEdge} from './edge-fields.js';
export function continueConnection(data,source){
  const edge=cleanEdge(JSON.parse(JSON.stringify(source)));edge.id=nextEdgeId(data);
  if(edge.kind==='transfer')edge.toLine='';
  else {edge.from=source.to;edge.to='';edge.points=[];}
  return edge;
}
export function firstStationTransfer(data,station){
  const lines=[...new Set(data.edges.filter(e=>e.kind!=='transfer'&&(e.from===station||e.to===station)).map(e=>e.lineId))];
  return {id:nextEdgeId(data),kind:'transfer',from:station,to:station,fromLine:lines[0]||'',toLine:lines[1]||'',bidirectional:true,delayWhenUnfamiliar:true,metrics:{timeSec:30,distanceKm:0,price:0}};
}
export function withConnectionDraft(data,draft){
  if(!draft)return data;
  return {...data,edges:draft.isNew?[...data.edges,draft.edge]:data.edges.map(e=>e.id===draft.edge.id?draft.edge:e)};
}
