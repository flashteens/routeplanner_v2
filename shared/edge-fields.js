// Ignore fields that belong to another kind, including in older imported JSON.
export function cleanEdge(edge){
  const next={...edge};
  const remove=keys=>{for(const key of keys)delete next[key];};
  if(edge.kind==='transfer')remove(['lineId','direction','reverseDirection','directionLabel','reverseDirectionLabel','arrivalDirection','reverseArrivalDirection','boardingAllowed','reverseBoardingAllowed','displayLineId','displayDirectionLabel','points']);
  else {
    remove(['fromLine','toLine','countsAsTransfer']);
    if(edge.kind==='walk')remove(['arrivalDirection','reverseArrivalDirection','boardingAllowed','reverseBoardingAllowed','displayLineId','displayDirectionLabel']);
  }
  return next;
}
