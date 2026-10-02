import { resolveStation } from './network.js';

const baseLine=syntax => syntax?.split(':')[0];
const costOf=(s,comparators) => comparators.map(weights=>Object.entries(weights).reduce((sum,[key,value])=>sum+s[key]*value,0));
const compare=(a,b) => {for(let i=0;i<a.length;i++) if(Math.abs(a[i]-b[i])>1e-8) return a[i]-b[i];return 0;};
class Heap {
  items=[];
  push(item){let i=this.items.push(item)-1;while(i>0){const p=(i-1)>>1;if(compare(this.items[p].cost,item.cost)<=0) break;this.items[i]=this.items[p];i=p;}this.items[i]=item;}
  pop(){const top=this.items[0], last=this.items.pop();if(this.items.length){let i=0;while(2*i+1<this.items.length){let c=2*i+1;if(c+1<this.items.length&&compare(this.items[c+1].cost,this.items[c].cost)<0)c++;if(compare(last.cost,this.items[c].cost)<=0)break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return top;}
}
export function normalizeOptions(data, options={}) {
  const o={...data.options.defaults,...Object.fromEntries(Object.entries(options).filter(([,v]) => v != null && v !== ''))};
  o.criteria ||= 'time';
  if (!data.options.criteria.includes(o.criteria)) throw new Error('INVALID_CRITERIA');
  o.transferCoef=Number(o.transferCoef);
  if (!data.options.transferCoefficients.includes(o.transferCoef)) throw new Error('INVALID_TRANSFER_COEFFICIENT');
  if (data.options.horseSpeeds) {
    if (!data.options.horseSpeeds.includes(o.horseSpeedClass)) throw new Error('INVALID_HORSE_SPEED');
    o.enableExpressCarts=Number(o.enableExpressCarts);
    if (!data.options.expressLevels.includes(o.enableExpressCarts)) throw new Error('INVALID_EXPRESS_LEVEL');
  }
  return o;
}
export function expandEdges(data, options={}) {
  const o=normalizeOptions(data,options), edges=[];
  for (const edge of data.edges) {
    const variant=edge.variants?.find(v => Object.entries(v.when).every(([key,values]) => values.includes(o[key])));
    if (edge.variants && !variant) continue;
    const timing={timeSec:edge.metrics.timeSec, reverseTimeSec:edge.reverseTimeSec ?? edge.metrics.timeSec, transferSlope:edge.transferSlope || 0, reverseTransferSlope:edge.reverseTransferSlope ?? edge.transferSlope ?? 0,...variant};
    edges.push({...edge,sourceEdgeId:edge.id,timeSec:timing.timeSec+timing.transferSlope*(o.transferCoef-1)});
    if (edge.bidirectional) edges.push({...edge,sourceEdgeId:edge.id,from:edge.to,to:edge.from,
      fromLine:edge.toLine,toLine:edge.fromLine,direction:edge.reverseDirection ?? '',directionLabel:edge.reverseDirectionLabel,
      arrivalDirection:edge.reverseArrivalDirection,boardingAllowed:edge.reverseBoardingAllowed ?? edge.boardingAllowed,
      reversed:true,timeSec:timing.reverseTimeSec+timing.reverseTransferSlope*(o.transferCoef-1)});
  }
  return edges;
}
export function findRoute(data, fromValue, toValue, options={}) {
  const from=resolveStation(data,fromValue), to=resolveStation(data,toValue), o=normalizeOptions(data,options);
  if (!from || !to) throw new Error('UNKNOWN_STATION');
  const adjacency=new Map();
  for (const e of expandEdges(data,o)) {if(!adjacency.has(e.from))adjacency.set(e.from,[]);adjacency.get(e.from).push(e);}
  const start={station:from,line:null,onboard:false,hasTravel:false,timeSec:0,distanceKm:0,segmentPrice:0,transfers:0,transferTimeSec:0,stops:0,previous:null,edge:null};
  start.cost=costOf(start,data.options.comparators[o.criteria]);
  const hash=s => `${s.station}\u0000${s.line || ''}\u0000${s.hasTravel ? 1 : 0}\u0000${s.onboard ? 1 : 0}`;
  const best=new Map([[hash(start),start.cost]]), heap=new Heap();heap.push(start);
  let final=null;
  while(heap.items.length){
    const state=heap.pop();
    if(compare(state.cost,best.get(hash(state)))>0) continue;
    if(state.station === to){final=state;break;}
    for(const edge of adjacency.get(state.station) || []){
      let line;
      if(edge.kind === 'transfer'){
        if(!state.line || (edge.fromLine !== state.line && edge.fromLine !== baseLine(state.line)))continue;
        line=edge.toLine;
      } else {
        const [id,dir]=state.line?.split(':') || [];
        if(state.line && (id !== edge.lineId || (dir != null && dir !== (edge.direction || ''))))continue;
        if(edge.boardingAllowed===false && !state.onboard)continue;
        line=`${edge.lineId}:${edge.arrivalDirection ?? edge.direction ?? ''}`;
      }
      const crosses=edge.from !== edge.to;
      const changes=!crosses && (edge.countsAsTransfer===true || baseLine(line) !== baseLine(state.line)) && !baseLine(line).startsWith('#');
      const next={station:edge.to,line,onboard:edge.kind==='ride',hasTravel:crosses ? true : changes ? false : state.hasTravel,
        timeSec:state.timeSec+edge.timeSec,distanceKm:state.distanceKm+edge.metrics.distanceKm,segmentPrice:state.segmentPrice+edge.metrics.price,
        transfers:state.transfers+(changes && state.hasTravel ? 1 : 0),transferTimeSec:state.transferTimeSec+(crosses ? 0 : edge.timeSec),stops:state.stops+(crosses ? 1 : 0),previous:state,edge};
      next.cost=costOf(next,data.options.comparators[o.criteria]);
      const key=hash(next), known=best.get(key);
      if(!known || compare(next.cost,known)<0){best.set(key,next.cost);heap.push(next);}
    }
  }
  if(!final) return {success:false,conf:data.id,from,to,options:o,error:'NO_ROUTE',steps:[],segments:[]};
  const chain=[];for(let s=final;s.edge;s=s.previous)chain.push(s);chain.reverse();
  const steps=chain.map(s => ({edgeId:s.edge.sourceEdgeId,kind:s.edge.kind,from:s.edge.from,to:s.edge.to,
    lineId:s.edge.displayLineId || s.edge.lineId || baseLine(s.edge.toLine),fromLine:s.edge.fromLine,toLine:s.edge.toLine,
    direction:s.edge.direction || '',directionLabel:s.edge.displayDirectionLabel || s.edge.directionLabel || {},reversed:Boolean(s.edge.reversed),
    metrics:{timeSec:s.edge.timeSec,distanceKm:s.edge.metrics.distanceKm,price:s.edge.metrics.price},departureTimeSec:s.previous.timeSec,arrivalTimeSec:s.timeSec}));
  const segments=[];
  for(const step of steps){
    const last=segments.at(-1);
    if(step.kind !== 'transfer' && last?.kind === step.kind && last.lineId === step.lineId){last.to=step.to;last.stations.push(step.to);last.timeSec+=step.metrics.timeSec;}
    else segments.push({kind:step.kind,lineId:step.lineId,direction:step.direction,directionLabel:step.directionLabel,from:step.from,to:step.to,stations:step.kind==='transfer'?[step.from]:[step.from,step.to],timeSec:step.metrics.timeSec});
  }
  let price=data.fares.type === 'free' ? 0 : data.fares.type === 'additive' ? final.segmentPrice : data.fares.matrix?.[from]?.[to] ?? null;
  if(from===to)price=0;
  // If the selected transfer takes longer than the official 20 minute window,
  // the two paid journeys must be charged independently.
  const fareBreaks=[];
  for(let i=0;i<steps.length;i++)if(steps[i].kind==='walk'){
    let a=i,b=i;while(a>0&&steps[a-1].kind==='transfer')a--;while(b+1<steps.length&&steps[b+1].kind==='transfer')b++;
    const transfer=data.fares.externalTransfers?.find(t => (t.from===steps[i].from&&t.to===steps[i].to)||(t.to===steps[i].from&&t.from===steps[i].to));
    const seconds=steps[b].arrivalTimeSec-steps[a].departureTimeSec;
    if(transfer&&seconds>transfer.maxSeconds)fareBreaks.push({from:steps[i].from,to:steps[i].to});
  }
  if(data.fares.type === 'origin-destination' && fareBreaks.length){
    let boarding=from;price=0;
    for(const br of fareBreaks){const fare=data.fares.matrix?.[boarding]?.[br.from];if(fare==null){price=null;break;}price+=fare;boarding=br.to;}
    if(price!=null){const fare=data.fares.matrix?.[boarding]?.[to];price=fare==null?null:price+fare;}
  }
  return {success:true,conf:data.id,from,to,options:o,metrics:{timeSec:final.timeSec,distanceKm:Math.round(final.distanceKm*1000)/1000,price},currency:data.fares.currency,
    transfers:final.transfers,stops:final.stops,transferTimeSec:final.transferTimeSec,fareBreaks,steps,segments};
}
