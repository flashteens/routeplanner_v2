import React,{useState,useEffect,useMemo,useId,useRef} from 'react';
import {searchStations,nameOf} from '../shared/network.js';

function Highlight({text,query}){
  if(!query.trim())return text;
  const index=text.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase());
  if(index<0)return text;
  return <>{text.slice(0,index)}<mark>{text.slice(index,index+query.trim().length)}</mark>{text.slice(index+query.trim().length)}</>;
}
export default function StationPicker({data,lang,t,value,onChange,onFocus,label}){
  const listId=useId(),[query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0);
  const typing=useRef(false);
  useEffect(()=>{if(value)setQuery(nameOf(data.stations[value],lang));else if(!typing.current)setQuery('');typing.current=false;},[value,lang,data.id]);
  const matches=useMemo(()=>searchStations(data,query,lang),[data,query,lang]);
  useEffect(()=>setActive(0),[query]);
  const select=station=>{setQuery(nameOf(station,lang));onChange(station.id);setOpen(false);};
  return <div className="station-picker"><label htmlFor={listId+'-input'}>{label}</label>
    <div className="picker-input"><span className="station-dot"/><input id={listId+'-input'} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
      aria-activedescendant={open&&matches.length?`${listId}-${active}`:undefined} autoComplete="off" placeholder={t('searchPlaceholder')} value={query}
      onChange={e=>{typing.current=true;setQuery(e.target.value);onChange(null);setOpen(true);}} onFocus={()=>{setOpen(true);onFocus?.();}} onBlur={()=>setTimeout(()=>setOpen(false),150)}
      onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(matches.length-1,i+(e.key==='ArrowDown'?1:-1))));}if(e.key==='Enter'&&open&&matches[active]){e.preventDefault();select(matches[active].station);}}}/>
      <button type="button" tabIndex={-1} className="dropdown-toggle" aria-label={label} onMouseDown={e=>e.preventDefault()} onClick={()=>setOpen(v=>!v)}>⌄</button></div>
    {open&&<div className="suggestions" role="listbox" id={listId}>
      {matches.map((m,index)=><div role="option" aria-selected={index===active} id={`${listId}-${index}`} key={m.station.id} className={'suggestion '+(index===active?'active':'')}
        onMouseDown={e=>{e.preventDefault();select(m.station);}} onMouseEnter={()=>setActive(index)}>
        <span className="suggestion-name"><Highlight text={nameOf(m.station,lang)} query={query}/></span>
        <span className="suggestion-sub"><Highlight text={m.station.codes.join(' · ') || m.station.id} query={query}/>
          {m.matched&&m.matched!==nameOf(m.station,lang)&&m.matched!==m.station.id&&<span> · <Highlight text={m.matched} query={query}/></span>}</span>
        {m.distanceMeters!=null&&<strong className="distance-tag">{t('away',{meters:Math.round(m.distanceMeters).toLocaleString()})}</strong>}
      </div>)}{!matches.length&&<div className="no-suggestions">{t('noMatches')}</div>}
    </div>}
  </div>;
}
