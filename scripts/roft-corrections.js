// These services already have through-running operational edges in legacy data.
// Draw their shared sections as the main circular line, just like B1/L7.
export function correctCircularDisplay(data){
  const families={ACL5:'ACL',ACL0:'ACL',SAL2:'SAL',SAL0:'SAL',RHL6:'RHL'};
  for(const edge of data.edges){
    const main=families[edge.lineId];if(!main||edge.kind!=='ride')continue;
    const counterpart=data.edges.find(e=>e.kind==='ride'&&e.lineId===main&&((e.from===edge.from&&e.to===edge.to)||(e.from===edge.to&&e.to===edge.from)));
    if(counterpart)edge.displayLineId=main;
  }
  return data;
}
// Keep post-migration operational corrections reproducible for both RoFT editions.
export function correctRoft(data) {
  if (!data.id.startsWith('ftmc') || !data.lines.L6N) return data;
  const get=(line,from,to)=>data.edges.find(e=>e.lineId===line&&e.from===from&&e.to===to);
  const camel=get('L6N','CMI','CH'),north=get('L6','CMI','NSV'),switchCart=data.edges.find(e=>e.from==='CH'&&e.fromLine==='L6'&&e.toLine==='L6N'),emerald=get('YYL','EP','YY02'),branch=get('YYL2','YY02','YY03'),switchLrt=data.edges.find(e=>e.fromLine==='YYL'&&e.toLine==='YYL2');
  const removed=new Set(data.edges.filter(e=>e.lineId==='L6N'&&!(e.from==='CMI'&&e.to==='CH')||e.lineId==='YYL2'&&!(e.from==='YY02'&&e.to==='YY03')).map(e=>e.id));
  const syntax=value=>value?.replace(/^L6N(?=:|$)/,'L6').replace(/^YYL2(?=:|$)/,'YYL');
  for(const e of data.edges) {
    if(e.lineId==='L6N')e.lineId='L6';
    if(e.lineId==='YYL2')e.lineId='YYL';
    e.fromLine &&= syntax(e.fromLine);e.toLine &&= syntax(e.toLine);
    if(e.kind==='transfer'&&e.from==='CMI')for(const key of ['fromLine','toLine'])e[key]=e[key].replace('L6:L6N_S','L6:L6_N').replace('L6:L6_S','L6:L6_CAMEL');
    if(e.kind==='transfer')for(const key of ['fromLine','toLine'])e[key]=e[key].replace(/:L6N_S$/,':L6_S').replace(/:L6N_N$/,':L6_N');
    if(e.lineId==='YYL'){
      if(e.direction==='YYL2_W')e.direction='YYL_W';
      if(e.reverseDirection==='YYL2_E')e.reverseDirection='YYL_BRANCH_E';
    }
  }
  // Clockwise default loop: CH → NSV → CMI → CH → south.
  Object.assign(north,{direction:'L6_CAMEL',arrivalDirection:'L6_S',reverseDirection:'L6_N'});
  Object.assign(camel,{direction:'L6_N',arrivalDirection:'L6_S',reverseDirection:'L6_CAMEL',reverseArrivalDirection:'L6_CAMEL'});
  Object.assign(switchCart,{fromLine:'L6:L6_N',toLine:'L6:L6_CAMEL',countsAsTransfer:true});
  camel.directionLabel={en:'Shan Hai Village via Cheesedog Hotel',zh:'經起司狗旅館往山海新村'};
  north.directionLabel={en:'Shan Hai Village via North Sugarcane',zh:'經甘蔗北鎮往山海新村'};
  north.reverseDirectionLabel={en:'Shan Hai Village via Camel Island',zh:'經駱駝島往山海新村'};
  Object.assign(emerald,{arrivalDirection:'YYL_W'});
  Object.assign(branch,{reverseArrivalDirection:'YYL_W'});
  Object.assign(switchLrt,{fromLine:'YYL:YYL_E',toLine:'YYL:YYL_BRANCH_E',countsAsTransfer:true});
  const dropStations=new Set(['GSC','SGP','DP','BC','ZC','FW','IB','PI','DB','NSV']);
  for(const e of data.edges.filter(e=>e.lineId==='B1')){
    if(dropStations.has(e.from))e.boardingAllowed=false;
    if(e.bidirectional&&dropStations.has(e.to))e.reverseBoardingAllowed=false;
    const local=data.edges.find(v=>v.lineId==='L7'&&((v.from===e.from&&v.to===e.to)||(v.to===e.from&&v.from===e.to)));
    if(local){
      const reversed=local.from!==e.from;
      e.displayLineId='L7';
      e.displayDirectionLabel=reversed?local.reverseDirectionLabel:local.directionLabel;
      if(dropStations.has(e.from)&&dropStations.has(e.to)){
        e.metrics.timeSec=reversed?local.reverseTimeSec:local.metrics.timeSec;
        for(const v of e.variants||[])v.timeSec=e.metrics.timeSec;
      }
    } else if(dropStations.has(e.from)&&dropStations.has(e.to))throw new Error(`Missing L7 counterpart ${e.id}`);
  }
  // Collapse redundant station access records after unifying route IDs.
  const seen=new Set();
  data.edges=data.edges.filter(e=>{
    if(removed.has(e.id))return false;
    if(e.kind!=='transfer')return true;
    const sig=JSON.stringify([e.from,e.fromLine,e.toLine,e.bidirectional,e.metrics,e.reverseTimeSec,e.transferSlope,e.reverseTransferSlope]);
    if(seen.has(sig))return false;seen.add(sig);return true;
  });
  delete data.lines.L6N;delete data.lines.YYL2;
  return correctCircularDisplay(data);
}
