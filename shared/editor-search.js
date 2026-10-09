import {searchStations} from './network.js';
const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase();
export function editorItems(data,tab,query,lang){
  if(tab==='stations'&&!query.trim())return Object.values(data.stations);
  if(tab==='stations')return searchStations(data,query,lang,Infinity).map(v=>({...v.station,searchDistance:v.distanceMeters}));
  const q=norm(query.trim()),items=tab==='edges'?data.edges:Object.values(data.lines);
  return items.filter(item=>{
    const lineIds=tab==='edges'?(item.kind==='transfer'?[item.fromLine,item.toLine]:[item.lineId,item.direction,item.reverseDirection]):[item.id];
    const lines=lineIds.map(id=>data.lines[id?.split(':')[0]]);
    const stations=tab==='edges'?[data.stations[item.from],data.stations[item.to]]:[];
    return [item.id,...Object.values(item.names||{}),...lineIds,...lines.flatMap(l=>Object.values(l?.names||{})),...stations.flatMap(s=>[s?.id,...Object.values(s?.names||{}),...(s?.codes||[]),...(s?.aliases||[])])].some(v=>norm(v).includes(q));
  });
}
