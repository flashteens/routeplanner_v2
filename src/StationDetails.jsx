import React,{useMemo} from 'react';
import {nameOf} from '../shared/network.js';
import {expandEdges} from '../shared/router.js';

export default function StationDetails({data,id,lang,t,options}){
  const station=data.stations[id];
  const lines=useMemo(()=>{
    try{return [...new Set(expandEdges(data,options).filter(edge=>edge.kind==='ride'&&edge.from===id&&edge.boardingAllowed!==false).map(edge=>edge.displayLineId||edge.lineId))].map(key=>data.lines[key]).filter(line=>line&&!line.interior);}
    catch{return [];}
  },[data,id,options]);
  if(!station)return null;
  const wiki=data.sources?.wikiSearchUrl;
  const wikiUrl=wiki&&/^https?:\/\//.test(wiki)?`${wiki}?${new URLSearchParams({query:station.names.en})}`:null;
  return <div className="station-details">
    <span className="eyebrow">{t('details')}</span><h2>{nameOf(station,lang)}</h2>
    <dl className="station-names">{Object.entries(station.names).map(([key,value])=><React.Fragment key={key}><dt>{key==='en'?'English':key==='zh'?'繁體中文':key==='ja'?'日本語':key}</dt><dd>{value}</dd></React.Fragment>)}</dl>
    <p><strong>{t('stationCodes')}:</strong> {(station.codes||[]).join(' · ')||station.id}</p>
    {station.coordinates&&<p className="coordinates">X {station.coordinates.x} · Y {station.coordinates.y} · Z {station.coordinates.z}</p>}
    <h3>{t('availableLines')}</h3><ul className="station-lines">{lines.map(line=><li key={line.id}><span style={{background:line.color}}/>{nameOf(line,lang)}</li>)}</ul>
    {wikiUrl&&<a href={wikiUrl} target="_blank" rel="noreferrer">{t('wikiSearch')} ↗</a>}
    {station.detailsHtml&&<iframe title={t('floorGuide')} sandbox="allow-popups" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px/1.5 system-ui;color:#263d49}table{border-collapse:collapse;width:100%}td{border:1px solid #c6d6da;padding:6px}td:first-child{background:#eef3f5}a{color:#176b76}table[style*="display: none"]{display:table!important}</style></head><body>${station.detailsHtml.replaceAll('{{floorGuide}}',t('floorGuide'))}</body></html>`}/>}
  </div>;
}
