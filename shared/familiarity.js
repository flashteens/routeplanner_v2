// V1's shared heuristic, now applied to a base time rather than stored slopes.
export function transferCoefFunc(time,coefficient){return time*(coefficient*.2+.8)+(5/3)*(coefficient-1);}
export function delaysWhenUnfamiliar(edge){
  if(typeof edge.delayWhenUnfamiliar==='boolean')return edge.delayWhenUnfamiliar;
  const timings=[edge,...(edge.variants||[])];
  if(timings.some(v=>v.transferSlope!=null||v.reverseTransferSlope!=null))return timings.some(v=>(v.transferSlope||0)>0||(v.reverseTransferSlope||0)>0);
  return edge.kind==='transfer';
}
export function withFamiliarity(edge,enabled=delaysWhenUnfamiliar(edge)){
  const next={...edge,delayWhenUnfamiliar:enabled};delete next.transferSlope;delete next.reverseTransferSlope;
  if(next.variants)next.variants=next.variants.map(v=>{const n={...v};delete n.transferSlope;delete n.reverseTransferSlope;return n;});
  return next;
}
export function edgeTime(edge,timing,reverse,coefficient){
  const time=reverse?timing.reverseTimeSec:timing.timeSec;
  if(typeof edge.delayWhenUnfamiliar==='boolean')return edge.delayWhenUnfamiliar?transferCoefFunc(time,coefficient):time;
  // Read compatibility for already downloaded schema-v2 files and undo snapshots.
  if(edge.transferSlope!=null||edge.reverseTransferSlope!=null||edge.variants?.some(v=>v.transferSlope!=null||v.reverseTransferSlope!=null))return time+(reverse?timing.reverseTransferSlope:timing.transferSlope)*(coefficient-1);
  return edge.kind==='transfer'?transferCoefFunc(time,coefficient):time;
}
// Convert editable/exported data to the boolean model without changing V1 files.
export function modernizeEdgeTiming(edge,networkId){
  const next={...edge,metrics:{...edge.metrics}};
  if(networkId==='trtc'&&edge.kind==='walk'){
    const fix=(time,slope)=>slope>0&&Math.abs(slope-((time-30)*.2+5/3))<1e-5?time-30:time;
    next.metrics.timeSec=fix(edge.metrics.timeSec,edge.transferSlope);
    if(edge.reverseTimeSec!=null)next.reverseTimeSec=fix(edge.reverseTimeSec,edge.reverseTransferSlope??edge.transferSlope);
  }
  const dr=typeof edge.delayWhenUnfamiliar!=='boolean'&&networkId==='ftmc_preview'&&[edge.lineId,edge.fromLine,edge.toLine].some(id=>['#_DR_DR02','#_DR02_DR'].includes(id));
  return withFamiliarity(next,dr?true:delaysWhenUnfamiliar(edge));
}
