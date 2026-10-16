import React,{useEffect,useId,useRef,useState} from 'react';
import {batchColumns,exportBatch,prepareBatch} from '../shared/editor-batch.js';
import {sameJSON} from '../shared/editor-history.js';
import {nameOf} from '../shared/network.js';

const fieldLabels={id:'batchNumber',nameEn:'nameEn',nameZh:'nameZh',coords:'coords',from:'from',to:'to',kind:'kind',fromLine:'fromLine',toLine:'toLine',bidirectional:'bidirectional',timeSec:'timeSec',distanceKm:'distanceKm',price:'price',reverseTimeSec:'reverseTimeSec',direction:'direction',directionLabel:'directionLabel',reverseDirection:'reverseDirection',reverseDirectionLabel:'reverseDirectionLabel',arrivalDirection:'arrivalDirection',reverseArrivalDirection:'reverseArrivalDirection',boardingAllowed:'batchBoarding',reverseBoardingAllowed:'batchReverseBoarding',displayLineId:'displayLine',displayDirectionLabel:'batchDisplayLabel',lineId:'line',aliases:'aliases',codes:'codes',symbol:'stationType',detailsHtml:'detailsHtml',delayWhenUnfamiliar:'delayWhenUnfamiliar',variants:'conditions',countsAsTransfer:'countTransfer'};
const titleFor=(key,t)=>t(fieldLabels[key]||key);
function fields(before,after,path=''){
  if(sameJSON(before,after))return [];
  if((before==null||typeof before==='object'&&!Array.isArray(before))&&(after==null||typeof after==='object'&&!Array.isArray(after))){
    return [...new Set([...Object.keys(before||{}),...Object.keys(after||{})])].flatMap(key=>fields(before?.[key],after?.[key],path?path+'.'+key:key));
  }
  return [{path,before,after}];
}
export default function BatchEditor({data,initialScope,lang,t,fallback,onApply,onClose,onDirty}){
  const dialog=useRef(null),heading=useId(),inputId=useId(),[scope,setScope]=useState(initialScope),[text,setText]=useState(()=>csv(initialScope)),[plan,setPlan]=useState(null),[error,setError]=useState('');
  function headers(s){return batchColumns(s).map(k=>titleFor(k,t));}
  function csv(s){return exportBatch(data,s,headers(s));}
  const original=csv(scope),dirty=text!==original;
  useEffect(()=>{dialog.current.showModal();return()=>dialog.current?.close();},[]);
  useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
  const close=()=>{if(!dirty||confirm(t('batchDiscard')))onClose();};
  function changeScope(s){if(dirty&&!confirm(t('batchDiscard')))return;setScope(s);setText(csv(s));setPlan(null);setError('');}
  const scopes=scope.type==='stations'?[]:scope.type==='transfer'?Object.values(data.stations):Object.values(data.lines);
  const formatError=e=>{
    if(e.code==='batchInvalid')return t(e.code)+'\n'+[...e.details.errors.map(message=>{const match=/^(Edge|Station) ([^:]+): (.*)$/.exec(message);if(!match)return t('batchRecordInvalid');const [,type,id,reason]=match,code=reason.includes('unknown station')?'batchUnknownStation':reason.includes('line/station')?'batchEndpointError':reason.includes('language strings')?'batchLanguageError':reason.includes('variant')?'batchConditionError':'batchRecordInvalid';return `${t(type==='Edge'?'batchConnection':'station')} ${id}: ${t(code)}`;}),...e.details.directions.map(d=>`${t('batchConnection')} ${d.edgeId}: ${t(d.problem)}`)].join('\n');
    return t(e.code||'batchInvalid',{...e.details,field:e.details?.field?titleFor(e.details.field,t):''});
  };
  const display=v=>v===undefined?t('batchEmpty'):typeof v==='object'?JSON.stringify(v):String(v);
  const pathTitle=path=>{const parts=path.split('.');if(parts.length===2&&['directionLabel','reverseDirectionLabel','displayDirectionLabel'].includes(parts[0]))return titleFor(parts[0],t)+' · '+t({zh:'labelLanguageZh',en:'labelLanguageEn',ja:'labelLanguageJa'}[parts[1]]||parts[1]);if(parts[0]==='matrix')return t('fareMatrix')+' · '+parts.slice(1).join(' → ');return ({'names.en':t('nameEn'),'names.zh':t('nameZh'),'position.x':t('batchMapX'),'position.y':t('batchMapY'),'coordinates.x':'X','coordinates.y':'Y','coordinates.z':'Z'}[path]||titleFor(path.replace(/^metrics\./,''),t));};
  const review=()=>{try{setPlan(prepareBatch(data,scope,text,{headers:headers(scope),fallback}));setError('');}catch(e){setError(formatError(e));}};
  return <dialog className="batch-dialog" ref={dialog} aria-labelledby={heading} onCancel={e=>{e.preventDefault();close();}}>
    <div className="batch-heading"><h2 id={heading}>{t(scope.type==='stations'?'batchStations':'batchEdges')}</h2><button aria-label={t('close')} onClick={close}>×</button></div>
    <p className="batch-backup" role="note">{t('batchBackup')}</p>
    {!plan?<>
      {scope.type!=='stations'&&<div className="batch-scope"><label>{t('batchGroup')}<select aria-label={t('batchGroup')} value={scope.type} onChange={e=>changeScope({type:e.target.value,id:e.target.value==='transfer'?Object.keys(data.stations)[0]:Object.keys(data.lines)[0]})}><option value="travel" disabled={!Object.keys(data.lines).length}>{t('batchTravel')}</option><option value="transfer" disabled={!Object.keys(data.stations).length}>{t('batchTransfers')}</option></select></label><label>{t(scope.type==='transfer'?'station':'line')}<select aria-label={t('batchScope')} value={scope.id} onChange={e=>changeScope({...scope,id:e.target.value})}>{scopes.map(s=><option key={s.id} value={s.id}>{s.id} · {nameOf(s,lang)}</option>)}</select></label></div>}
      <p>{t(scope.type==='stations'?'batchStationsHint':'batchEdgesHint')}</p><p>{t('batchDeleteHint')}</p>
      <details><summary>{t('batchFormat')}</summary><p>{t('batchFormatHint')}</p><p>{t('batchPreserve')}</p><ol>{batchColumns(scope).map(key=><li key={key}>{titleFor(key,t)}</li>)}</ol></details>
      <label htmlFor={inputId}>{t('batchCSV')}</label><textarea id={inputId} className="batch-csv" spellCheck={false} value={text} onChange={e=>{setText(e.target.value);setError('');}}/>
      {error&&<pre role="alert" className="batch-error">{error}</pre>}
      <div className="batch-actions"><button onClick={close}>{t('batchCancel')}</button><button className="primary" onClick={review}>{t('batchReview')}</button></div>
    </>:<>
      <h3>{t('batchReviewTitle')}</h3><p>{t('batchReviewHint',{count:plan.changes.length})}</p>
      {!plan.changes.length&&<p>{t('batchNoChanges')}</p>}
      <div className="batch-changes">{plan.changes.map(change=><article className={'batch-change '+change.action} key={change.collection+':'+change.id}>
        <h4>{t('batch'+change.action)} · {t(change.collection==='stations'?'station':change.collection==='edges'?'batchConnection':'settings')} · {change.id}</h4>
        {plan.placements.find(p=>p.id===change.id)&&<p>{t(plan.placements.find(p=>p.id===change.id).estimated?'batchEstimated':'batchFallback')}</p>}
        <dl>{fields(change.before,change.after).map(f=><div key={f.path}><dt>{pathTitle(f.path)}</dt><dd><del>{display(f.before)}</del><span aria-hidden="true"> → </span><ins>{display(f.after)}</ins></dd></div>)}</dl>
      </article>)}</div>
      {error&&<pre role="alert" className="batch-error">{error}</pre>}
      <div className="batch-actions"><button onClick={()=>setPlan(null)}>{t('batchBack')}</button><button className="primary" disabled={!plan.changes.length} onClick={()=>{try{onApply(plan.next);onClose();}catch(e){setError(e.message);}}}>{t('batchApply')}</button><button onClick={close}>{t('batchCancel')}</button></div>
    </>}
  </dialog>;
}
