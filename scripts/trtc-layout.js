import {octilinearPoints} from '../shared/map-geometry.js';

// This reference records the station markers in Taipei Metro's official diagram.
// Keep service variants for routing, but draw them on one physical railway.
export function applyTrtcLayout(data,reference) {
  let checked=0;
  for(const station of Object.values(data.stations)){
    const entry=reference.stations[station.id];
    if(!entry||!station.codes.every(code=>entry.officialCodes.includes(code)))throw new Error(`Unmatched official station: ${station.id}`);
    const baseName=station.names.zh.replace(/\s*\([^)]*\)$/,'');
    if(baseName!==entry.name)throw new Error(`Official station name mismatch: ${station.id}: ${baseName} / ${entry.name}`);
    station.position={...entry.position};station.labelOffset={x:12,y:-12};delete station.labelAnchor;
    // On vertical trunks, alternate sides only where two railways run nearby.
    if(station.id.startsWith('BL')&&station.position.x===292||['G11','G12','G13','O02','O03','O04','O13'].includes(station.id)){
      station.labelOffset={x:-12,y:-12};station.labelAnchor='end';
    }
    checked++;
  }
  const traces=new Map();
  for(const [key,bends] of Object.entries(reference.bends)){
    const [from,to]=key.split('/');
    const points=octilinearPoints([data.stations[from].position,...bends,data.stations[to].position]);
    traces.set(`${from}/${to}`,points);traces.set(`${to}/${from}`,points.toReversed());
  }
  for(const edge of data.edges){
    if(edge.kind==='transfer')continue;
    let points=traces.get(`${edge.from}/${edge.to}`);
    if(!points){
      const [from,to]=[edge.from,edge.to].sort();
      const physical=octilinearPoints([data.stations[from].position,data.stations[to].position]);
      points=edge.from===from?physical:physical.toReversed();
      traces.set(`${from}/${to}`,physical);traces.set(`${to}/${from}`,physical.toReversed());
    }
    edge.points=points.slice(1,-1).map(p=>({...p}));
    const display={RS:'R',GS:'G',OA:'O',OB:'O',BLS:'BL'}[edge.lineId];
    if(display)edge.displayLineId=display;
  }
  data.map={...data.map,cornerRadius:12,parallelGap:5};
  data.sources.officialLayout={url:reference.source,image:reference.image,retrieved:reference.retrieved,checkedStations:checked,scope:'Existing routing stations; R01 is recorded in the reference only.'};
  return data;
}
