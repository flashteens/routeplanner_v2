import React,{useState,useMemo,useEffect,useRef} from 'react';
import NetworkMap from './NetworkMap.jsx';
import {nameOf,validateNetwork} from '../shared/network.js';
import {edgeDefaults,addEditorItem} from '../shared/editor-defaults.js';
import {insertControlPoint,midpointControlPoint} from '../shared/map-geometry.js';
import {emptyHistory,recordEdit,replayHistory,validateEditorHistory,recoverEditorHistory,withoutHistory,checkHistoryShape} from '../shared/editor-history.js';
import DraftField,{DraftContext} from './DraftField.jsx';
import {stationSymbol,stationDefaultType} from '../shared/station-symbol.js';

function JsonField({label,value,onChange,t}){
  return <label className="field-label">{label}<DraftField as="textarea" aria-label={label} className="json-field" value={JSON.stringify(value,null,2)} onCommit={text=>onChange(JSON.parse(text))} t={t}/></label>;
}
export default function Editor({data,setData,lang,t,onPreview,onDownloaded,onDraftChange}){
  const [tab,setTab]=useState('stations'),[selected,setSelected]=useState(null),[notice,setNotice]=useState(''),[filter,setFilter]=useState('');
  const [opening,setOpening]=useState(false),[automatic,setAutomatic]=useState({});
  const [draftCount,setDraftCount]=useState(0);
  const fileInput=useRef(null),drafts=useRef(new Map()),current=useRef(data),activeGroup=useRef(null),historyNeedsRepair=useRef(false);current.current=data;
  const draftContext=useMemo(()=>({register:(id,value)=>{if(value)drafts.current.set(id,value);else drafts.current.delete(id);setDraftCount(drafts.current.size);}}),[]);
  const errors=useMemo(()=>validateNetwork(withoutHistory(data)),[data]);
  useEffect(()=>{onDraftChange?.(draftCount>0);},[draftCount,onDraftChange]);
  let history;try{history=checkHistoryShape(data.editorHistory??emptyHistory());}catch{history=emptyHistory();}
  function flushDrafts(){let okay=true;for(const draft of [...drafts.current.values()])if(!draft.commit())okay=false;if(!okay)setNotice(t('invalidDraft'));return okay;}
  function discardDrafts(){for(const draft of [...drafts.current.values()])draft.discard();setNotice('');}
  function commitNetwork(change,action={kind:'edit',target:selected?`${selected.tab}:${selected.id}`:'settings'}){
    const before=current.current,next=typeof change==='function'?change(before):change;
    const key=action.kind==='move'?action.target:null;
    const recorded=recordEdit(before,next,action,validateNetwork,key!==null&&activeGroup.current===key,historyNeedsRepair.current);
    if(recorded!==before&&historyNeedsRepair.current){historyNeedsRepair.current=false;setNotice(t('historyEditRecovered'));}
    activeGroup.current=key;current.current=recorded;setData(recorded);return recorded;
  }
  function editNetwork(change,action){if(!flushDrafts())return false;try{commitNetwork(change,action);return true;}catch(error){setNotice(t('historyError')+'\n'+error.message);return false;}}
  function perform(change){if(!flushDrafts())return;try{change();}catch(error){setNotice(t('historyError')+'\n'+error.message);}}
  function replay(redo){if(!flushDrafts())return;activeGroup.current=null;try{const next=replayHistory(current.current,redo,validateNetwork);current.current=next;setData(next);setNotice('');}catch(error){historyNeedsRepair.current=true;const message=t('historyError')+'\n'+error.message;setNotice(message);alert(message);}}
  function clearHistory(){if(!confirm(t('clearHistoryConfirm')))return;const next={...current.current,editorHistory:emptyHistory()};activeGroup.current=null;historyNeedsRepair.current=false;current.current=next;setData(next);setNotice(t('historyCleared'));}
  useEffect(()=>{const handler=e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;const key=e.key.toLowerCase();if(key==='z'||key==='y'){e.preventDefault();replay(key==='y'||e.shiftKey);}};document.addEventListener('keydown',handler);return()=>document.removeEventListener('keydown',handler);});
  const item=selected?.tab==='edges'?data.edges.find(e=>e.id===selected.id):data[selected?.tab]?.[selected?.id];
  const select=(nextTab,id)=>{if(selected?.tab===nextTab&&selected.id===id){setTab(nextTab);return true;}if(!flushDrafts())return false;setTab(nextTab);setSelected({tab:nextTab,id});return true;};
  const update=(change,action)=>commitNetwork(d=>selected.tab==='edges'?{...d,edges:d.edges.map(e=>e.id===selected.id?{...e,...change}:e)}:{...d,[selected.tab]:{...d[selected.tab],[selected.id]:{...d[selected.tab][selected.id],...change}}},action);
  function changeEdge(change){const next={...item,...change};update({...change,...(automatic[item.id]?edgeDefaults(data,next):{})});}
  function manualEdge(change){setAutomatic(v=>({...v,[item.id]:false}));update(change);}
  const checked=next=>commitNetwork(next);
  const checkedEdge=change=>checked({...data,edges:data.edges.map(e=>e.id===selected.id?{...e,...change}:e)});
  const input=(key,value,change,type='text')=><label className="field-label">{t(key)}<DraftField key={key} aria-label={t(key)} type={type} value={value??''} step={type==='number'?'any':undefined} onCommit={change} t={t}/></label>;
  const toggle=(key,checked,change)=><label className="checkbox-label"><input type="checkbox" checked={Boolean(checked)} onChange={e=>{if(!flushDrafts())return;try{change(e.target.checked);}catch(error){setNotice(t('invalidNetwork')+'\n'+error.message);}}}/>{t(key)}</label>;
  function names(){return <>{input('nameEn',item.names.en,value=>update({names:{...item.names,en:value}}))}{input('nameZh',item.names.zh,value=>update({names:{...item.names,zh:value}}))}</>;}
  function changeSymbol(change){const style=stationSymbol(current.current.stations[selected.id],stationDefaultType(current.current,selected.id));update({symbol:`${change.type??style.type}-${change.direction??style.direction}`,labelOffset:undefined,labelAnchor:undefined});}
  function add(){
    if(!flushDrafts())return;
    const id=prompt(t('newId'))?.trim();if(!id)return;
    let next;try{next=addEditorItem(current.current,tab,id);}catch(error){setNotice(t(error.message));return;}
    const added=editNetwork(next,{kind:'add',target:`${tab}:${id}`});
    if(added&&tab==='edges')setAutomatic(v=>({...v,[id]:true}));
    if(added){select(tab,id);setNotice('');}
  }
  function remove(){
    if(!selected||!flushDrafts()||!confirm(t('deleteConfirm')))return;
    editNetwork(d=>{
      const next={...d};
      if(selected.tab==='edges')next.edges=d.edges.filter(e=>e.id!==selected.id);
      else {next[selected.tab]={...d[selected.tab]};delete next[selected.tab][selected.id];
        next.edges=d.edges.filter(e=>selected.tab==='stations'?e.from!==selected.id&&e.to!==selected.id:e.lineId!==selected.id&&e.displayLineId!==selected.id&&e.fromLine?.split(':')[0]!==selected.id&&e.toLine?.split(':')[0]!==selected.id);
        if(selected.tab==='stations'){
          next.aliases=Object.fromEntries(Object.entries(d.aliases||{}).filter(([,id])=>id!==selected.id));
          if(d.fares.matrix){const matrix=Object.fromEntries(Object.entries(d.fares.matrix).filter(([id])=>id!==selected.id).map(([id,row])=>[id,Object.fromEntries(Object.entries(row).filter(([to])=>to!==selected.id))]));next.fares={...d.fares,matrix};}
          if(d.fares.externalTransfers)next.fares={...next.fares,externalTransfers:d.fares.externalTransfers.filter(t=>t.from!==selected.id&&t.to!==selected.id)};
        }
      }
      return next;
    },{kind:'delete',target:`${selected.tab}:${selected.id}`});setSelected(null);
  }
  function load(value){try{
    let parsed=JSON.parse(value);const problems=validateNetwork(parsed);
    if(problems.length){setNotice(t('invalidNetwork')+'\n'+problems.join('\n'));return;}
    const historyProblems=validateEditorHistory(parsed,validateNetwork);
    let loadedNotice=t('loaded');
    if(historyProblems.length){
      const recovery=recoverEditorHistory(parsed,validateNetwork),counts={discarded:recovery.discarded,retained:recovery.history.entries.length};
      if(!confirm(t('historyLoadWarning',counts)+'\n\n'+historyProblems.join('\n'))){setNotice(t('historyLoadRejected'));return;}
      parsed={...parsed,editorHistory:recovery.history};loadedNotice=t('historyLoadRecovered',counts);
    }
    discardDrafts();activeGroup.current=null;historyNeedsRepair.current=false;current.current=parsed;setData(parsed);setSelected(null);setNotice(loadedNotice);
  }catch(error){setNotice(error instanceof SyntaxError?t('invalidJson'):t('invalidNetwork')+'\n'+error.message);}}
  function serialize(){if(!flushDrafts())return null;const d=current.current,problems=[...validateNetwork(withoutHistory(d)),...validateEditorHistory(d,validateNetwork)];if(problems.length){setNotice(t('invalidNetwork')+'\n'+problems.join('\n'));return null;}const value=JSON.stringify({...d,editorHistory:d.editorHistory??emptyHistory()},null,2)+'\n';setNotice(t('saved'));return value;}
  function download(){const value=serialize();if(!value)return;const url=URL.createObjectURL(new Blob([value],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=data.id+'.json';onDownloaded?.(current.current);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const stationSelect=(key,value,onChange)=><label className="field-label">{t(key)}<DraftField key={key} as="select" immediate aria-label={t(key)} value={value} onCommit={onChange} t={t}>{Object.values(data.stations).map(s=><option key={s.id} value={s.id}>{nameOf(s,lang)} · {s.id}</option>)}</DraftField></label>;
  const lineSelect=(key,value,onChange)=><label className="field-label">{t(key)}<DraftField key={key} aria-label={t(key)} list="editor-lines" value={value || ''} onCommit={onChange} t={t}/></label>;
  return <DraftContext.Provider value={draftContext}><main><div className="page-intro editor-intro"><div><span className="eyebrow">{t('editor')}</span><h1>{t('editorTitle')}</h1><p>{t('editorSubtitle')}</p></div><button className="primary" onClick={()=>{if(!flushDrafts())return;errors.length?setNotice(t('invalidNetwork')):onPreview();}}>{t('viewPlanner')} →</button></div>
    <section className="history-toolbar card" aria-label={t('editHistory')}><button onClick={()=>replay(false)} disabled={!history.cursor}>{t('undo')}</button><button onClick={()=>replay(true)} disabled={history.cursor>=history.entries.length}>{t('redo')}</button><span>{t('historyCount',{count:history.entries.length})}</span><button className="danger" onClick={clearHistory} disabled={!history.entries.length}>{t('clearHistory')}</button>{draftCount>0&&<button onClick={discardDrafts}>{t('discardDrafts')}</button>}</section>
    <section className="json-workbench card" aria-busy={opening}>
      <div className="json-actions"><button disabled={opening} onClick={()=>fileInput.current.click()}>{t('loadFile')}</button><input ref={fileInput} className="sr-only" tabIndex={-1} aria-label={t('loadFile')} type="file" accept="application/json,.json" onChange={async e=>{const input=e.target,file=input.files[0];if(!file)return;setOpening(true);try{load(await file.text());}catch{setNotice(t('fileReadError'));}finally{input.value='';setOpening(false);}}}/><button className="primary" disabled={opening} onClick={download}>{t('download')}</button></div><p className="muted">{t('editorLocal')}</p>{notice&&<pre className="notice" role="status">{notice}</pre>}
    </section>
    <div className="editor-grid"><section className="editor-panel card"><nav className="editor-tabs">{['stations','lines','edges','settings'].map(name=><button className={tab===name?'selected':''} key={name} onClick={()=>{if(!flushDrafts())return;setTab(name);setFilter('');}}>{t(name)}</button>)}</nav>
      {tab!=='settings'&&<><div className="editor-list-tools"><input aria-label={t('searchPlaceholder')} placeholder={t('searchPlaceholder')} value={filter} onChange={e=>setFilter(e.target.value)}/><button onClick={add}>{t('add')} ＋</button></div>
        <div className="editor-list">{(tab==='edges'?data.edges:Object.values(data[tab])).filter(v=>JSON.stringify([v.id,v.names,v.from,v.to,v.lineId,v.fromLine,v.toLine]).toLowerCase().includes(filter.toLowerCase())).map(v=><button key={v.id} className={selected?.tab===tab&&selected.id===v.id?'selected':''} onClick={()=>select(tab,v.id)}>
          <span>{tab==='edges'?`${nameOf(data.stations[v.from],lang)} → ${nameOf(data.stations[v.to],lang)}`:nameOf(v,lang)}</span><small>{v.id}{v.lineId?' · '+v.lineId:v.fromLine?' · '+v.fromLine+' → '+v.toLine:''}</small></button>)}</div></>}
      <datalist id="editor-lines">{Object.keys(data.lines).map(id=><option key={id} value={id}/>)}</datalist>
      {tab==='settings'?<div className="edit-fields">
        {input('nameEn',data.names.en,value=>commitNetwork(d=>({...d,names:{...d.names,en:value}})))}{input('nameZh',data.names.zh,value=>commitNetwork(d=>({...d,names:{...d.names,zh:value}})))}
        {toggle('enableDistance',data.ui.enableDistance,value=>commitNetwork(d=>({...d,ui:{...d.ui,enableDistance:value}})))}{toggle('enableFare',data.ui.enableFare,value=>commitNetwork(d=>({...d,ui:{...d.ui,enableFare:value}})))}{toggle('previewSetting',data.preview,value=>commitNetwork(d=>({...d,preview:value})))}
        <label className="field-label">{t('fareType')}<DraftField as="select" immediate value={data.fares.type} onCommit={value=>commitNetwork(d=>({...d,fares:{...d.fares,type:value}}))} t={t}>{['free','additive','origin-destination'].map(type=><option key={type} value={type}>{t(type)}</option>)}</DraftField></label>
        <JsonField label={t('footerDescription')} value={data.footer?.description||{}} onChange={description=>commitNetwork(d=>({...d,footer:{...d.footer,description}}))} t={t}/>
        {input('currency',data.fares.currency,value=>commitNetwork(d=>({...d,fares:{...d.fares,currency:value || null}})))}
        <JsonField key={data.id+'fares'} label={t('fareMatrix')} value={data.fares} onChange={value=>checked({...data,fares:value})} t={t}/>
        <JsonField key={data.id+'options'} label={t('advanced')} value={data.options} onChange={value=>checked({...data,options:value})} t={t}/>
      </div>:item&&selected.tab===tab?<div className="edit-fields" key={selected.id}><div className="selected-heading"><span className="eyebrow">{t('selected')} · {item.id}</span><button className="danger" onClick={remove}>{t('remove')}</button></div>
        {tab==='stations'&&<>{names()}{['aliases','codes'].map(key=><label className="field-label" key={key}>{t(key)}<DraftField as="textarea" value={(item[key]||[]).join('\n')} onCommit={value=>update({[key]:value.split('\n').filter(Boolean)})} t={t}/></label>)}
          <fieldset><legend>{t('coords')}</legend><div className="axis-inputs">{['x','y','z'].map(axis=><label key={axis}>{axis.toUpperCase()}<DraftField type="number" step="any" allowEmpty value={item.coordinates?.[axis]??''} onCommit={value=>update({coordinates:value===''?null:{...(item.coordinates || {x:0,y:62,z:0}),[axis]:value}})} t={t}/></label>)}</div></fieldset>
          <fieldset><legend>{t('mapPosition')}</legend><div className="axis-inputs">{['x','y'].map(axis=><label key={axis}>{axis.toUpperCase()}<DraftField type="number" value={item.position[axis]} onCommit={value=>update({position:{...item.position,[axis]:value}},{kind:'move',target:`station:${item.id}:position`})} t={t}/></label>)}</div></fieldset>
          <label className="field-label">{t('stationType')}<DraftField as="select" immediate aria-label={t('stationType')} value={stationSymbol(item,stationDefaultType(data,item.id)).type} onCommit={type=>changeSymbol({type})} t={t}>{['L','I','M'].map(type=><option key={type} value={type}>{t(`stationType${type}`)}</option>)}</DraftField></label>
          <label className="field-label">{t('labelDirection')}<DraftField as="select" immediate aria-label={t('labelDirection')} value={stationSymbol(item,stationDefaultType(data,item.id)).direction} onCommit={direction=>changeSymbol({direction})} t={t}>{Array.from({length:8},(_,i)=><option key={i+1} value={i+1}>{t(`labelDirection${i+1}`)}</option>)}</DraftField></label>
          <label className="field-label">{t('detailsHtml')}<DraftField as="textarea" value={item.detailsHtml || ''} onCommit={value=>update({detailsHtml:value})} t={t}/></label>
        </>}
        {tab==='lines'&&<>{names()}{input('color',item.color,value=>update({color:value}),'color')}{toggle('interior',item.interior,value=>update({interior:value}))}</>}
        {tab==='edges'&&<><label className="field-label">{t('kind')}<DraftField as="select" immediate aria-label={t('kind')} value={item.kind} onCommit={value=>changeEdge({kind:value,...(value==='transfer'?{to:item.from,fromLine:item.lineId||Object.keys(data.lines)[0],toLine:data.edges.find(v=>v.kind==='ride'&&v.lineId!==item.lineId&&(v.from===item.from||v.to===item.from))?.lineId||Object.keys(data.lines).find(k=>k!==item.lineId&&!data.lines[k].interior)||item.lineId}:item.kind==='transfer'?{lineId:item.fromLine.split(':')[0],to:Object.keys(data.stations).find(k=>k!==item.from),direction:''}:{})})} t={t}>{['ride','walk','transfer'].map(kind=><option key={kind} value={kind}>{t(kind)}</option>)}</DraftField></label>
          {stationSelect('from',item.from,value=>changeEdge({from:value,...(item.kind==='transfer'?{to:value}:{})}))}{item.kind!=='transfer'&&stationSelect('to',item.to,value=>changeEdge({to:value}))}
          {item.kind==='transfer'?<>{toggle('countTransfer',item.countsAsTransfer,value=>update({countsAsTransfer:value}))}{lineSelect('fromLine',item.fromLine,value=>(value.includes(':')?manualEdge:changeEdge)({fromLine:value}))}{lineSelect('toLine',item.toLine,value=>(value.includes(':')?manualEdge:changeEdge)({toLine:value}))}</>:<>{lineSelect('line',item.lineId,value=>changeEdge({lineId:value}))}{input('direction',item.direction,value=>manualEdge({direction:value}))}{input('reverseDirection',item.reverseDirection,value=>manualEdge({reverseDirection:value}))}</>}
          {toggle('autoDefaults',automatic[item.id],value=>{setAutomatic(v=>({...v,[item.id]:value}));if(value)update(edgeDefaults(data,item));})}<button onClick={()=>perform(()=>update(edgeDefaults(current.current,item)))}>{t('suggestDefaults')}</button><p className="muted">{t('defaultsHint')}</p>
          {item.kind==='ride'&&<>{toggle('alightingOnly',item.boardingAllowed===false,value=>update({boardingAllowed:!value}))}{item.bidirectional&&toggle('reverseAlightingOnly',(item.reverseBoardingAllowed??item.boardingAllowed)===false,value=>update({reverseBoardingAllowed:!value}))}{input('arrivalDirection',item.arrivalDirection,value=>update({arrivalDirection:value||undefined}))}{item.bidirectional&&input('reverseArrivalDirection',item.reverseArrivalDirection,value=>update({reverseArrivalDirection:value||undefined}))}{lineSelect('displayLine',item.displayLineId,value=>update({displayLineId:value||undefined}))}</>}
          {toggle('bidirectional',item.bidirectional,value=>update({bidirectional:value}))}{['timeSec','distanceKm','price'].map(key=><React.Fragment key={key}>{input(key,item.metrics[key],value=>(key==='distanceKm'?manualEdge:update)({metrics:{...item.metrics,[key]:value}}),'number')}</React.Fragment>)}
          {item.bidirectional&&input('reverseTimeSec',item.reverseTimeSec??item.metrics.timeSec,value=>update({reverseTimeSec:value}),'number')}{input('transferSlope',item.transferSlope || 0,value=>update({transferSlope:value}),'number')}
          <p className="muted">{t('conditionsHint')}</p><JsonField label={t('conditions')} value={item.variants||[]} onChange={value=>{if(!Array.isArray(value))throw new Error(t('invalidNetwork'));checkedEdge({variants:value.length?value:undefined});}} t={t}/>
          {item.kind!=='transfer'&&<fieldset><legend>{t('points')}</legend><p className="muted">{t('pointsHint')}</p>{(item.points||[]).map((point,i)=><div className="point-row" key={i}><span>{i+1}</span>{['x','y'].map(axis=><label key={axis}>{axis.toUpperCase()}<DraftField aria-label={`${t('points')} ${i+1} ${axis.toUpperCase()}`} type="number" value={point[axis]} onCommit={value=>update({points:item.points.map((p,j)=>i===j?{...p,[axis]:value}:p)},{kind:'move',target:`edge:${item.id}:point:${i}`})} t={t}/></label>)}<button aria-label={`${t('removePoint')} ${i+1}`} onClick={()=>perform(()=>update({points:item.points.filter((p,j)=>i!==j)}))}>×</button></div>)}<button onClick={()=>perform(()=>update({points:insertControlPoint(current.current,item,midpointControlPoint(current.current,item))}))}>{t('addPoint')}</button></fieldset>}
        </>}
      </div>:<p className="empty-editor">{t('nothingSelected')}</p>}
    </section><NetworkMap data={data} editable setData={editNetwork} selected={selected} lang={lang} t={t} options={data.options.defaults} onSelect={id=>{const okay=select('stations',id);if(okay)setFilter('');return okay;}} onSelectEdge={id=>select('edges',id)}/></div>
    {errors.length>0&&<section className="validation card"><h3>{t('validation')}</h3><ul>{errors.slice(0,50).map((error,i)=><li key={i}>{error}</li>)}</ul></section>}
  </main></DraftContext.Provider>;
}
