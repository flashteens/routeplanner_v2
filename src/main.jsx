import React,{useState,useEffect,useMemo,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import Planner from './Planner.jsx';
import Editor from './Editor.jsx';
import {nameOf} from '../shared/network.js';
import {translator} from '../shared/format.js';
import {editorSnapshot} from '../shared/editor-document.js';
import './style.css';

const url=new URL(location.href);
const language=url.searchParams.get('lang') || (navigator.language.startsWith('zh')?'zh':navigator.language.startsWith('ja')?'ja':'en');
const validLang=language==='zh-TW'?'zh':['en','zh','ja'].includes(language)?language:'en';
function App(){
  const [lang,setLang]=useState(validLang),[dicts,setDicts]=useState(null),[systems,setSystems]=useState([]),[conf,setConf]=useState(url.searchParams.get('conf') || 'ftmc'),[data,setData]=useState(null),[error,setError]=useState(false),[online,setOnline]=useState(navigator.onLine),[cached,setCached]=useState(false),[previewing,setPreviewing]=useState(false);
  const isEditor=location.pathname==='/editor',t=useMemo(()=>translator(dicts?.[lang] || {}),[dicts,lang]);
  const [savedSnapshot,setSavedSnapshot]=useState(null),[draftDirty,setDraftDirty]=useState(false);
  const unsaved=isEditor&&Boolean(data)&&(draftDirty||savedSnapshot!==editorSnapshot(data)),unsavedRef=useRef(false);unsavedRef.current=unsaved;
  function downloaded(next){unsavedRef.current=false;setSavedSnapshot(editorSnapshot(next));setDraftDirty(false);}
  useEffect(()=>{if(!isEditor)return;const leaving=e=>{if(unsavedRef.current){e.preventDefault();e.returnValue='';}};addEventListener('beforeunload',leaving);return()=>removeEventListener('beforeunload',leaving);},[isEditor]);
  useEffect(()=>{
    Promise.all(['en','zh','ja'].map(async lang=>{const response=await fetch(`/i18n/${lang}.json`);if(!response.ok)throw new Error('locale');return[lang,await response.json()];})).then(entries=>setDicts(Object.fromEntries(entries))).catch(()=>setError(true));
    fetch('/data/systems.json').then(r=>r.json()).then(setSystems).catch(()=>setError(true));
    const update=()=>setOnline(navigator.onLine);addEventListener('online',update);addEventListener('offline',update);return()=>{removeEventListener('online',update);removeEventListener('offline',update);};
  },[]);
  useEffect(()=>{
    setData(null);setError(false);setCached(false);setPreviewing(false);setDraftDirty(false);
    const abort=new AbortController();
    fetch(`/data/${encodeURIComponent(conf)}.json`,{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('network');return r.json();}).then(next=>{if(abort.signal.aborted)return;setData(next);setSavedSnapshot(editorSnapshot(next));}).catch(e=>{if(e.name!=='AbortError')setError(true);});
    if('serviceWorker' in navigator)navigator.serviceWorker.ready.then(reg=>{if(!abort.signal.aborted)reg.active?.postMessage({type:'SELECT_NETWORK',conf});});
    return()=>abort.abort();
  },[conf]);
  useEffect(()=>{
    if(!('serviceWorker' in navigator)||import.meta.env.DEV)return;
    const listener=e=>{if(e.data?.type==='CACHE_STATUS'&&e.data.conf===conf)setCached(e.data.ready);};navigator.serviceWorker.addEventListener('message',listener);
    navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(reg=>reg.active?.postMessage({type:'SELECT_NETWORK',conf})).catch(()=>setCached(false));
    const changed=()=>navigator.serviceWorker.controller?.postMessage({type:'SELECT_NETWORK',conf});navigator.serviceWorker.addEventListener('controllerchange',changed);
    return()=>{navigator.serviceWorker.removeEventListener('message',listener);navigator.serviceWorker.removeEventListener('controllerchange',changed);};
  },[conf]);
  useEffect(()=>{const next=new URL(location.href);next.searchParams.set('conf',conf);next.searchParams.set('lang',lang);history.replaceState(null,'',next);document.documentElement.lang=lang==='zh'?'zh-Hant':lang;if(data)document.title=`${t('appTitle')} · ${nameOf(data,lang)}${data.preview?' · '+t('preview'):''}`;},[conf,lang,data?.preview,dicts,data?.id]);
  if(!dicts)return <div className="initial-loading">FTMC Route Planner v2 <span>{error?'Unable to load language files.':'…'}</span></div>;
  return <div className={data?.preview?'app preview-theme':'app'}><header className="site-header"><a className="brand" href={`/?conf=${conf}&lang=${lang}`}><img src="/icon.svg" alt=""/><span><strong>FTMC</strong><small>ROUTE PLANNER <b>v2</b></small></span></a>
    <nav><a className={!isEditor?'current':''} href={`/?conf=${conf}&lang=${lang}`}>{t('planner')}</a><a className={isEditor?'current':''} href={`/editor?conf=${conf}&lang=${lang}`}>{t('editor')}</a><a href="/api">{t('api')}</a></nav>
    <div className="header-settings"><label><span className="sr-only">{t('system')}</span><select value={conf} onChange={e=>{if(unsavedRef.current&&!confirm(t('unsavedChanges'))){e.target.value=conf;return;}const next=new URL(location.href);for(const key of ['from','to','criteria','transferCoef','horseSpeedClass','enableExpressCarts'])next.searchParams.delete(key);history.replaceState(null,'',next);setConf(e.target.value);}}>{systems.map(system=><option key={system.id} value={system.id}>{nameOf(system,lang)}</option>)}</select></label>
      <label><span className="sr-only">{t('language')}</span><select value={lang} onChange={e=>setLang(e.target.value)}><option value="en">English</option><option value="zh">繁體中文</option><option value="ja">日本語</option></select></label></div></header>
    <div className="status-bar"><span className={'status-dot '+(online?'':'offline')}/><span>{t(online?'online':'offline')}</span><span className="status-divider">·</span><span>{t(cached?'offlineReady':'offlineNotReady')}</span>{data?.preview&&<strong className="preview-badge">{t('preview')}</strong>}{unsaved&&<strong className="unsaved-status">{t('unsavedStatus')}</strong>}</div>
    {error?<main className="card load-error" role="alert">{t('loadError')}</main>:!data?<main className="card load-error">{t('loading')}</main>:isEditor&&!previewing?<Editor key={data.id} data={data} setData={setData} lang={lang} t={t} onPreview={()=>{setDraftDirty(false);setPreviewing(true);}} onDownloaded={downloaded} onDraftChange={setDraftDirty}/>:<>{isEditor&&<button className="back-editor" onClick={()=>setPreviewing(false)}>← {t('backEditor')}</button>}<Planner key={data.id} data={data} lang={lang} dict={dicts[lang]} t={t} localPreview={isEditor}/></>}
    <footer><p>{t('footer')}</p>{data&&<><p>{t('dataUpdated',{date:data.updated?.[lang==='zh'?'zh':'en'] || ''})}</p><div>{(data.sources?.links?.[lang==='zh'?'zh':'en'] || []).filter(link=>/^https?:/.test(link.url)).map(link=><a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.text} ↗</a>)}</div></>}</footer>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
