const labelKey=reverse=>reverse?'reverseDirectionLabel':'directionLabel';
const directionKey=reverse=>reverse?'reverseDirection':'direction';
const label=value=>value||{};
const canonical=value=>JSON.stringify(Object.fromEntries(Object.entries(label(value)).sort(([a],[b])=>a.localeCompare(b))));

// UI checks are separate from the portable schema, which accepts legacy data.
export function directionCodeProblem(edge,key,value) {
  if(!String(value??'').trim())return edge.kind==='ride'&&(key==='direction'||edge.bidirectional)?'directionRequired':null;
  const other=key==='direction'?'reverseDirection':'direction';
  if(String(value).trim()===String(edge[other]??'').trim())return 'directionsDistinct';
  return null;
}
export function editorDirectionProblems(data) {
  return data.edges.filter(edge=>edge.kind!=='transfer').flatMap(edge=>['direction','reverseDirection'].map(key=>({edgeId:edge.id,key,problem:directionCodeProblem(edge,key,edge[key])})).filter(issue=>issue.problem));
}
export function directionLabelTargets(data,lineId,direction) {
  if(!lineId||!direction?.trim())return [];
  return data.edges.flatMap(edge=>edge.kind==='transfer'||edge.lineId!==lineId?[]:
    ['direction','reverseDirection'].filter(key=>edge[key]===direction).map(key=>({edgeId:edge.id,key:key==='direction'?'directionLabel':'reverseDirectionLabel',label:label(edge[key==='direction'?'directionLabel':'reverseDirectionLabel'])})));
}
export function directionLabelSummary(targets,lang='en') {
  const groups=[...new Map(targets.map(target=>[canonical(target.label),target.label])).values()];
  const primary=lang==='zh-TW'?'zh':lang;
  return groups.map(value=>{
    const text=value[primary]||'',peers=groups.filter(other=>(other[primary]||'')===text);
    let extra=null;
    if(peers.length>1){
      const languages=[...new Set(['en','ja','zh',...peers.flatMap(v=>Object.keys(v))])].filter(key=>key!==primary);
      const distinct=key=>new Set(peers.map(v=>v[key]||'')).size;
      const unique=languages.find(key=>peers.filter(v=>(v[key]||'')===(value[key]||'')).length===1);
      const key=unique||languages.toSorted((a,b)=>distinct(b)-distinct(a)).find(key=>distinct(key)>1);
      if(key)extra={language:key,text:value[key]||''};
    }
    return {text,extra};
  });
}
export function applyDirectionLabels(data,sourceId,reverse=false) {
  const source=data.edges.find(edge=>edge.id===sourceId);
  if(!source)throw new Error('invalidNetwork');
  const targets=directionLabelTargets(data,source.lineId,source[directionKey(reverse)]);
  if(!targets.length)throw new Error('directionRequired');
  const keys=new Map();for(const target of targets){if(!keys.has(target.edgeId))keys.set(target.edgeId,[]);keys.get(target.edgeId).push(target.key);}
  return {...data,edges:data.edges.map(edge=>keys.has(edge.id)?{...edge,...Object.fromEntries(keys.get(edge.id).map(key=>[key,{...label(source[labelKey(reverse)])}]))}:edge)};
}
