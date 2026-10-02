import React,{useState,useMemo,useEffect} from 'react';
import StationPicker from './StationPicker.jsx';
import NetworkMap from './NetworkMap.jsx';
import {nameOf,resolveStation,languageKey} from '../shared/network.js';
import {findRoute} from '../shared/router.js';
import {duration,routeText} from '../shared/format.js';

export default function Planner({data,lang,dict,t,localPreview=false}){
  const initial=new URLSearchParams(location.search);
  const [from,setFrom]=useState(resolveStation(data,initial.get('from')||'')),[to,setTo]=useState(resolveStation(data,initial.get('to')||'')),[active,setActive]=useState('from'),[details,setDetails]=useState(null),[copied,setCopied]=useState('');
  const [options,setOptions]=useState({...data.options.defaults,...Object.fromEntries(['criteria','transferCoef','horseSpeedClass','enableExpressCarts'].filter(k=>initial.has(k)).map(k=>[k,initial.get(k)]))});
  const result=useMemo(()=>{if(!from||!to)return null;try{return findRoute(data,from,to,options);}catch(error){return{success:false,error:error.message};}},[data,from,to,options]);
  useEffect(()=>{const url=new URL(location.href);if(from)url.searchParams.set('from',from);else url.searchParams.delete('from');if(to)url.searchParams.set('to',to);else url.searchParams.delete('to');for(const[k,v]of Object.entries(options))url.searchParams.set(k,String(v));history.replaceState(null,'',url);},[from,to,options]);
  const text=useMemo(()=>routeText(data,result,lang,dict),[data,result,lang,dict]);
  async function copy(value,key){try{await navigator.clipboard.writeText(value);setCopied(key);setTimeout(()=>setCopied(''),1800);}catch{setCopied('failed');}}
  const choose=id=>{if(active==='from'){setFrom(id);setActive('to');}else setTo(id);};
  function choice(key,values,labelKey){return <label className="field-label">{t(key)}<select value={options[key]} onChange={e=>setOptions(o=>({...o,[key]:e.target.value}))}>{values.map((value,index)=><option key={value} value={value}>{t(labelKey(value,index))}</option>)}</select></label>;}
  return <main><div className="page-intro"><span className="eyebrow">{data.preview?t('preview'):t('planner')}</span><h1>{t('tagline')}</h1><p>{t('subtitle')}</p></div>
    <div className="planner-grid"><div className="journey-column"><section className="query-card card"><div className="query-top"><h2>{t('planner')}</h2><button className="swap" aria-label={t('swap')} onClick={()=>{setFrom(to);setTo(from);}}>⇅</button></div>
      <div className={'field-wrapper '+(active==='from'?'focused':'')}><StationPicker data={data} lang={lang} t={t} value={from} onChange={setFrom} onFocus={()=>setActive('from')} label={t('from')}/></div>
      <div className={'field-wrapper destination '+(active==='to'?'focused':'')}><StationPicker data={data} lang={lang} t={t} value={to} onChange={setTo} onFocus={()=>setActive('to')} label={t('to')}/></div>
      {choice('criteria',data.options.criteria,value=>value)}
      <details className="options"><summary>{t('advanced')}</summary>{choice('transferCoef',data.options.transferCoefficients,(value,index)=>['transfer1','transfer4','transfer7'][index] || 'transfer1')}
        {data.options.horseSpeeds&&choice('horseSpeedClass',data.options.horseSpeeds,value=>'horse'+value)}{data.options.expressLevels&&choice('enableExpressCarts',data.options.expressLevels,value=>'express'+value)}</details>
      <button className="primary full" onClick={()=>{if(!from||!to)setCopied('invalid');else setCopied('');}}>{t('plan')} <span>→</span></button>
      {copied==='invalid'&&<p className="error" role="alert">{t('UNKNOWN_STATION')}</p>}<p className="search-hint">{t('searchHint')}</p>
    </section>
    <section className="result-card card" aria-live="polite">
      {!result?<div className="empty-state"><div className="route-glyph">● ┈ ●</div><h3>{t('readyTitle')}</h3><p>{t('readyBody')}</p></div>:!result.success?<div className="empty-state"><h3>{t(result.error==='NO_ROUTE'?'noRoute':result.error)}</h3></div>:<>
        <span className="eyebrow">{t('itinerary')}</span><div className="journey-title"><button onClick={()=>setDetails(from)}>{nameOf(data.stations[from],lang)}</button><span>↓</span><button onClick={()=>setDetails(to)}>{nameOf(data.stations[to],lang)}</button></div>
        <div className="metrics"><div className="duration-metric"><strong>{duration(result.metrics.timeSec,t)}</strong><span>{t('duration')}</span></div><div><strong>{result.transfers}</strong><span>{t('transferCount')}</span></div><div><strong>{result.stops}</strong><span>{t('stopCount')}</span></div>
          {data.ui.enableDistance&&<div><strong>{result.metrics.distanceKm.toFixed(3)} <small>km</small></strong><span>{t('distance')}</span></div>}{data.ui.enableFare&&<div><strong>{result.metrics.price==null?t('unknownFare'):`${result.currency || ''} ${result.metrics.price}`}</strong><span>{t('fare')}</span></div>}</div>
        {result.from===result.to?<p>{t('sameStation')}</p>:<ol className="itinerary">{result.segments.map((segment,i)=><li key={i} className={segment.kind} style={{'--line-color':data.lines[segment.lineId]?.color || '#829599'}}>
          <span className="timeline-dot"/><div className="segment-heading"><span className="line-badge">{t(segment.kind)} {nameOf(data.lines[segment.lineId],lang)}</span><span className="segment-duration">{duration(segment.timeSec,t)}</span></div>
          {segment.directionLabel?.[languageKey(lang)]&&<p className="direction-text">{segment.directionLabel[languageKey(lang)]}</p>}
          <div className="segment-stations"><button onClick={()=>setDetails(segment.from)}>{nameOf(data.stations[segment.from],lang)}</button>{segment.to!==segment.from&&<><span>→</span><button onClick={()=>setDetails(segment.to)}>{nameOf(data.stations[segment.to],lang)}</button></>}</div>
          {segment.kind==='ride'&&segment.stations.length>2&&<details className="passed-stations"><summary>{segment.stations.length-1} {t('stopCount')}</summary>{segment.stations.slice(1,-1).map(id=><button key={id} onClick={()=>setDetails(id)}>{nameOf(data.stations[id],lang)}</button>)}</details>}
        </li>)}</ol>}
        <div className="result-actions"><button className="primary" onClick={()=>copy(text,'directions')}>{t(copied==='directions'?'copied':'copy')}</button>{!localPreview&&<button onClick={()=>copy(location.href,'link')}>{t(copied==='link'?'copied':'share')}</button>}</div>
        {copied==='failed'&&<p role="status">{t('copyFailed')}</p>}<details className="text-result"><summary>{t('textResult')}</summary><pre>{text}</pre></details>
        {!localPreview&&<a className="seo-link" href={'/route?'+new URLSearchParams({conf:data.id,from,to,lang,...options})}>{t('seoResult')} ↗</a>}
        {data.ui.enableFare&&data.fares.source&&<p className="fare-note">{t(result.fareBreaks.length?'fareBreakNote':'fareNote')} <a href={data.fares.source} target="_blank" rel="noreferrer">{t('fareSource')} ↗</a></p>}
      </>}
    </section></div><NetworkMap data={data} result={result} lang={lang} t={t} from={from} to={to} activeField={active} onSelect={choose} options={options}/></div>
    {details&&<div className="modal-backdrop" onClick={()=>setDetails(null)}><section className="station-modal card" role="dialog" aria-modal="true" aria-label={t('details')} onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setDetails(null)} aria-label={t('close')}>×</button>
      <span className="eyebrow">{t('details')}</span><h2>{nameOf(data.stations[details],lang)}</h2><p>{(data.stations[details].codes || []).join(' · ')}</p>{data.stations[details].coordinates&&<p className="coordinates">X {data.stations[details].coordinates.x} · Y {data.stations[details].coordinates.y} · Z {data.stations[details].coordinates.z}</p>}
      {data.stations[details].detailsHtml&&<iframe title={t('floorGuide')} sandbox="allow-popups" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px/1.5 system-ui;color:#263d49}table{border-collapse:collapse;width:100%}td{border:1px solid #c6d6da;padding:6px}td:first-child{background:#eef3f5}a{color:#176b76}table[style*="display: none"]{display:table!important}</style></head><body>${data.stations[details].detailsHtml.replaceAll('{{floorGuide}}',t('floorGuide'))}</body></html>`}/>}
    </section></div>}
  </main>;
}
