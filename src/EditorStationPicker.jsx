import React,{useContext,useEffect,useId,useRef,useState} from 'react';
import StationPicker from './StationPicker.jsx';
import {DraftContext} from './DraftField.jsx';
import {nameOf,resolveStation} from '../shared/network.js';

export default function EditorStationPicker({data,lang,t,value,onCommit,label}){
  const context=useContext(DraftContext),id=useId(),query=useRef(null),commitRef=useRef(onCommit),[error,setError]=useState(''),[revision,setRevision]=useState(0);commitRef.current=onCommit;
  const discard=()=>{query.current=null;context?.register(id,null);setError('');setRevision(n=>n+1);};
  const select=station=>{const draft=query.current;query.current=null;context?.register(id,null);try{commitRef.current(station);setError('');return true;}catch(e){query.current=draft??station;context?.register(id,{commit,discard});setError(e.message);return false;}};
  const commit=()=>{
    if(query.current===null)return true;
    const station=resolveStation(data,query.current);
    if(!station){setError(t('chooseStation'));return false;}
    return select(station);
  };
  useEffect(()=>()=>context?.register(id,null),[context,id]);
  return <div className="editor-station-picker"><StationPicker resetRevision={revision} data={data} lang={lang} t={t} value={value} label={label} allowClear={false} onChange={select}
    onQueryChange={text=>{query.current=text;setError('');context?.register(id,{commit,discard});}} onBlur={commit}/>{error&&<span role="alert" className="error">{error}</span>}<span className="sr-only">{nameOf(data.stations[value],lang)}</span></div>;
}
