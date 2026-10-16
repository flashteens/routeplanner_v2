// Editor diagnostics only. Ignore allowed travel options and arrow direction when checking connectivity.
const base=id=>id?.split(':')[0];
export function stationWarnings(data){
  const records=new Map(Object.keys(data.stations).map(id=>[id,{external:[],transfers:[],inbound:false}]));
  for(const edge of data.edges){
    if(edge.kind==='transfer'){records.get(edge.from)?.transfers.push(edge);continue;}
    if(!['ride','walk'].includes(edge.kind))continue;
    const forward=`${edge.lineId}:${edge.direction??''}`,arrival=`${edge.lineId}:${edge.arrivalDirection??edge.direction??''}`;
    const reverse=`${edge.lineId}:${edge.reverseDirection??''}`,reverseArrival=`${edge.lineId}:${edge.reverseArrivalDirection??edge.reverseDirection??''}`;
    records.get(edge.from)?.external.push({id:edge.id,line:edge.lineId,states:[forward,...edge.bidirectional?[reverseArrival]:[]],outgoing:[forward],incoming:edge.bidirectional?[reverseArrival]:[]});
    records.get(edge.to)?.external.push({id:edge.id,line:edge.lineId,states:[arrival,...edge.bidirectional?[reverse]:[]],incoming:[arrival],outgoing:edge.bidirectional?[reverse]:[]});
    if(records.has(edge.to))records.get(edge.to).inbound=true;
    if(edge.bidirectional&&records.has(edge.from))records.get(edge.from).inbound=true;
  }
  return [...records].flatMap(([station,r])=>{
    const reasons=[],nodes=[...new Set(r.transfers.flatMap(e=>[e.fromLine,e.toLine]))],parent=new Map(nodes.map(id=>[id,id]));
    const find=id=>{let p=id;while(parent.get(p)!==p)p=parent.get(p);return p;};
    const join=(a,b)=>{const x=find(a),y=find(b);if(x!==y)parent.set(x,y);};
    for(const edge of r.transfers)join(edge.fromLine,edge.toLine);
    for(const node of nodes)if(node.includes(':')&&parent.has(base(node)))join(node,base(node));
    const groups=new Map();for(const node of nodes){const id=find(node);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(node);}
    if(!r.inbound)reasons.push({code:'warningNoArrival'});
    if(groups.size>1)reasons.push({code:'warningDisconnected',groups:[...groups.values()]});
    if(r.external.length>=2){
      const unmatched=r.external.filter(e=>!e.states.some(state=>nodes.includes(state)||nodes.includes(base(state))));
      // No transfer is needed to continue along the same line in the same direction.
      const differentLines=new Set(r.external.map(v=>v.line)).size>1;
      const missing=unmatched.filter(e=>differentLines||!r.external.some(other=>other.id!==e.id&&(e.incoming.some(s=>other.outgoing.includes(s))||other.incoming.some(s=>e.outgoing.includes(s)))));
      if(missing.length)reasons.push({code:'warningMissingTransfer',edges:[...new Set(missing.map(e=>e.id))],lines:[...new Set(missing.map(e=>e.line))]});
    }
    return reasons.length?[{station,reasons}]:[];
  });
}
