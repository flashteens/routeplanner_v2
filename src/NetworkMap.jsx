import React,{useState,useMemo,useRef,useEffect} from 'react';
import {nameOf} from '../shared/network.js';
import {expandEdges} from '../shared/router.js';
import {mapPaths,insertControlPoint} from '../shared/map-geometry.js';
import {stationAppearance,labelDirection,stationDefaultType} from '../shared/station-symbol.js';

function bounds(stations,edges=[]){const p=[...Object.values(stations).map(s=>s.position),...edges.flatMap(e=>e.points||[])];if(!p.length)return{x:0,y:0,w:1000,h:800};const xs=p.map(v=>v.x),ys=p.map(v=>v.y),x=Math.min(...xs)-90,y=Math.min(...ys)-90;return{x,y,w:Math.max(400,Math.max(...xs)-x+90),h:Math.max(300,Math.max(...ys)-y+90)};}
export default function NetworkMap({data,result,lang,t,from,to,activeField,onSelect,editable=false,setData,selected,onSelectEdge,options}){
  const [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),[lineFilter,setLineFilter]=useState(''),[labels,setLabels]=useState(false),[hover,setHover]=useState(null);
  const [addingPoint,setAddingPoint]=useState(false);
  const [fitRevision,setFitRevision]=useState(0),[fitRoute,setFitRoute]=useState(false);
  const svgRef=useRef(),gesture=useRef(null),maxZoom=editable?128:32;
  useEffect(()=>{setZoom(1);setPan({x:0,y:0});setLineFilter('');},[data.id]);
  const enabled=useMemo(()=>{try{return new Set(expandEdges(data,options).map(e=>e.sourceEdgeId));}catch{return new Set();}},[data.edges,data.options,options]);
  const edges=useMemo(()=>data.edges.filter(e=>e.kind!=='transfer'&&(editable||enabled.has(e.id))&&(!lineFilter||(e.displayLineId||e.lineId)===lineFilter)),[data.edges,enabled,lineFilter,editable]);
  const stationIds=useMemo(()=>lineFilter?new Set(edges.flatMap(e=>[e.from,e.to])):null,[lineFilter,edges]);
  const stations=useMemo(()=>Object.fromEntries(Object.entries(data.stations).filter(([id])=>!stationIds||stationIds.has(id))),[data.stations,stationIds]);
  const stationCount=Object.keys(stations).length;
  const routeStations=useMemo(()=>result?.success?Object.fromEntries([...new Set([result.from,result.to,...result.steps.flatMap(s=>[s.from,s.to])])].map(id=>[id,data.stations[id]])):null,[result,data.stations]);
  const base=useMemo(()=>bounds(fitRoute&&routeStations?routeStations:stations,fitRoute&&result?.success?edges.filter(e=>result.steps.some(s=>s.edgeId===e.id)):edges),[data.id,lineFilter,stationCount,fitRevision,fitRoute,routeStations]);
  const box={x:base.x+base.w/2-base.w/zoom/2+pan.x,y:base.y+base.h/2-base.h/zoom/2+pan.y,w:base.w/zoom,h:base.h/zoom};
  const [size,setSize]=useState({width:800,height:580});
  useEffect(()=>{const observer=new ResizeObserver(entries=>setSize({width:entries[0].contentRect.width,height:entries[0].contentRect.height}));observer.observe(svgRef.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{const svg=svgRef.current,handler=e=>{e.preventDefault();setZoom(z=>Math.max(.5,Math.min(maxZoom,z*(e.deltaY<0?1.16:.86))));};svg.addEventListener('wheel',handler,{passive:false});return()=>svg.removeEventListener('wheel',handler);},[maxZoom]);
  const units=Math.max(box.w/size.width,box.h/size.height),highlight=new Set(result?.success?result.steps.map(s=>s.edgeId):[]),pathStations=new Set(result?.success?result.steps.flatMap(s=>[s.from,s.to]):[]);
  const paths=useMemo(()=>mapPaths(data,edges,(data.map?.parallelGap??5)*units,data.map?.cornerRadius??12),[data.stations,edges,units,data.map]);
  const selectedEdge=edges.find(e=>e.id===selected?.id&&selected?.tab==='edges');
  const controlPoints=selectedEdge?.points||[];
  const lineList=Object.values(data.lines).filter(l=>!l.interior&&data.edges.some(e=>e.kind==='ride'&&(e.displayLineId||e.lineId)===l.id));
  function point(e){const matrix=svgRef.current.getScreenCTM();return new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());}
  function appearance(station){return stationAppearance(station,stationDefaultType(data,station.id));}
  function start(e,type,id,index){
    if(e.button!==0)return;e.stopPropagation();
    if(editable&&(type==='station'||type==='label')&&onSelect(id)===false)return;
    const p=point(e),label=type==='label'?appearance(data.stations[id]):null;
    gesture.current={type,id,index,start:p,pan:{...pan},moved:false,origin:type==='station'?{...data.stations[id].position}:type==='label'?{x:label.x*units,y:label.y*units}:type==='point'?{...controlPoints[index]}:p,...(type==='label'?{stationType:label.type}: {}),...(type==='point'?{points:controlPoints}: {})};
    svgRef.current.setPointerCapture(e.pointerId);
  }
  function move(e){const g=gesture.current;if(!g)return;const p=point(e);if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>2*units)g.moved=true;
    if(g.type==='pan'){setPan({x:g.pan.x-(e.clientX-g.screenX)*units,y:g.pan.y-(e.clientY-g.screenY)*units});return;}
    if(!editable||!g.moved)return;
    const pos={x:Math.round(g.origin.x+p.x-g.start.x),y:Math.round(g.origin.y+p.y-g.start.y)};
    if(g.type==='station')setData(d=>({...d,stations:{...d.stations,[g.id]:{...d.stations[g.id],position:pos}}}),{kind:'move',target:`station:${g.id}:position`});
    if(g.type==='label')setData(d=>{const s={...d.stations[g.id],symbol:`${g.stationType}-${labelDirection(g.origin.x+p.x-g.start.x,g.origin.y+p.y-g.start.y)}`};delete s.labelOffset;delete s.labelAnchor;return{...d,stations:{...d.stations,[g.id]:s}};},{kind:'move',target:`station:${g.id}:label`});
    if(g.type==='point')setData(d=>({...d,edges:d.edges.map(edge=>edge.id===g.id?{...edge,points:g.points.map((v,i)=>i===g.index?pos:v)}:edge)}),{kind:'move',target:`edge:${g.id}:point:${g.index}`});
  }
  function finish(e){const g=gesture.current;if(!editable&&g?.type==='station'&&!g.moved)onSelect(g.id);gesture.current=null;if(svgRef.current.hasPointerCapture(e.pointerId))svgRef.current.releasePointerCapture(e.pointerId);}
  function addControlPoint(edge,e){
    const points=insertControlPoint(data,edge,point(e));
    setData(d=>({...d,edges:d.edges.map(v=>v.id===edge.id?{...v,points}:v)}),{kind:'edit',target:`edge:${edge.id}:points`});setAddingPoint(false);
  }
  function removeControlPoint(index){setData(d=>({...d,edges:d.edges.map(e=>e.id===selected.id?{...e,points:controlPoints.filter((v,i)=>i!==index)}:e)}),{kind:'edit',target:`edge:${selected.id}:points`});}
  const stationLineColors=id=>[...new Set(edges.filter(e=>e.from===id||e.to===id).map(e=>data.lines[e.displayLineId||e.lineId]?.color))].filter(Boolean);
  return <section className="map-card card"><div className="map-heading"><div><span className="eyebrow">{t('map')}</span><h2>{nameOf(data,lang)}</h2></div>
    <select aria-label={t('line')} value={lineFilter} onChange={e=>{setLineFilter(e.target.value);setFitRoute(false);setZoom(1);setPan({x:0,y:0});}}><option value="">{t('allLines')}</option>{lineList.map(l=><option key={l.id} value={l.id}>{nameOf(l,lang)}</option>)}</select></div>
    <div className="map-canvas"><svg ref={svgRef} role="group" aria-label={t('map')} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      onPointerDown={e=>{if(e.button!==0)return;const p=point(e);gesture.current={type:'pan',start:p,screenX:e.clientX,screenY:e.clientY,pan:{...pan}};svgRef.current.setPointerCapture(e.pointerId);}}
      onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>gesture.current=null}>
      <defs><pattern id="map-grid" width={50*units} height={50*units} patternUnits="userSpaceOnUse"><circle r={0.8*units} cx={1*units} cy={1*units} fill="#c3d4d9"/></pattern><marker id="oneway" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="url(#map-grid)"/>
      {edges.toSorted((a,b)=>Number(highlight.has(a.id))-Number(highlight.has(b.id))).map(edge=><path key={edge.id} data-edge={edge.id} d={paths.get(edge.id)} fill="none" stroke={data.lines[edge.displayLineId||edge.lineId]?.color || '#9aa7ad'}
        strokeWidth={(highlight.has(edge.id)?7:selected?.id===edge.id?6:3)*units} strokeOpacity={!result?.success||highlight.has(edge.id)?0.95:0.16} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={edge.kind==='walk'?`${5*units} ${5*units}`:undefined}
        markerEnd={!edge.bidirectional?'url(#oneway)':undefined}
        onPointerDown={e=>{if(editable&&e.button===0){e.stopPropagation();onSelectEdge?.(edge.id);if(e.shiftKey||addingPoint)addControlPoint(edge,e);}}}>
        <title>{nameOf(data.lines[edge.displayLineId||edge.lineId],lang)}{edge.boardingAllowed===false?` · ${t('alightingOnly')}`:''} · {nameOf(data.stations[edge.from],lang)} → {nameOf(data.stations[edge.to],lang)}</title></path>)}
      {Object.values(stations).map(s=>{const chosen=s.id===from||s.id===to,colors=stationLineColors(s.id),style=appearance(s),r=style.radius*units,show=labels||zoom>=2.5||chosen||hover===s.id||editable&&selected?.id===s.id;
        return <g key={s.id} data-station={s.id} transform={`translate(${s.position.x},${s.position.y})`} role="button" tabIndex={0} aria-label={`${t('station')}: ${nameOf(s,lang)}`}
          onPointerDown={e=>start(e,'station',s.id)} onMouseEnter={()=>setHover(s.id)} onMouseLeave={()=>setHover(null)} onKeyDown={e=>{if(editable&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(onSelect(s.id)===false)return;const step=e.shiftKey?10:1;setData(d=>({...d,stations:{...d.stations,[s.id]:{...d.stations[s.id],position:{x:d.stations[s.id].position.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:d.stations[s.id].position.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)}}}}),{kind:'move',target:`station:${s.id}:position`});}else if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(s.id);}}}>
          {chosen&&<circle r={14*units} fill={s.id===from?'#176b76':'#d28a32'} opacity="0.15"/>}
          <circle r={r} fill={chosen?(s.id===from?'#176b76':'#d28a32'):'#fff'} stroke={colors.length===1?colors[0]:'#304858'} strokeWidth={1.5*units} opacity={result?.success&&!pathStations.has(s.id)&&!chosen?0.4:1}/>
          <circle r={10*units} fill="transparent"/>
          {show&&<text x={style.x*units} y={style.y*units} textAnchor={style.anchor} dominantBaseline={style.baseline} fontSize={12*units} fontWeight={chosen?'700':'500'} fill="#263d49" paintOrder="stroke" stroke="#fff" strokeWidth={3*units} strokeLinejoin="round"
            onPointerDown={e=>editable?start(e,'label',s.id):start(e,'station',s.id)}>{nameOf(s,lang)}</text>}
          <title>{nameOf(s,lang)} · {(s.codes || []).join(' / ')}</title></g>;})}
      {editable&&controlPoints.map((p,i)=><circle key={i} data-point={i} cx={p.x} cy={p.y} r={7*units} fill="#fff" stroke="#176b76" strokeWidth={2*units} role="button" tabIndex={0} aria-label={`${t('points')} ${i+1}`}
        onPointerDown={e=>start(e,'point',selected.id,i)} onContextMenu={e=>{e.preventDefault();removeControlPoint(i);}} onKeyDown={e=>{if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeControlPoint(i);}else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const step=e.shiftKey?10:1;setData(d=>({...d,edges:d.edges.map(edge=>edge.id===selected.id?{...edge,points:controlPoints.map((v,j)=>i===j?{x:v.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:v.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)}:v)}:edge)}),{kind:'move',target:`edge:${selected.id}:point:${i}`});}}}><title>{t('pointsHint')}</title></circle>)}
    </svg>
    {editable&&<div className="map-edit-controls"><button aria-pressed={addingPoint} onClick={()=>setAddingPoint(v=>!v)}>{t(addingPoint?'cancelPoint':'addPoint')}</button>{addingPoint&&<span>{t('clickPoint')}</span>}</div>}
    <div className="map-controls"><button onClick={()=>setZoom(z=>Math.min(maxZoom,z*1.4))} aria-label={t('zoomIn')}>+</button><button onClick={()=>setZoom(z=>Math.max(.5,z/1.4))} aria-label={t('zoomOut')}>−</button>{result?.success&&<button onClick={()=>{setLineFilter('');setFitRoute(true);setZoom(1);setPan({x:0,y:0});setFitRevision(v=>v+1);}}>{t('fitRoute')}</button>}<button onClick={()=>{setFitRoute(false);setZoom(1);setPan({x:0,y:0});setFitRevision(v=>v+1);}}>{t('fit')}</button></div>
    <label className="map-label-toggle"><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/>{t('labels')}</label>
    {!editable&&<span className={'map-field '+activeField}>{t(activeField==='from'?'selectFrom':'selectTo')}</span>}
    </div><p className="map-hint">{t(editable?'mapEditorHint':'mapHint')}</p>
    <div className="legend">{lineList.filter(l=>edges.some(e=>(e.displayLineId||e.lineId)===l.id)).map(l=><button key={l.id} className={lineFilter===l.id?'selected':''} onClick={()=>{setLineFilter(f=>f===l.id?'':l.id);setFitRoute(false);setPan({x:0,y:0});setZoom(1);}}><span style={{background:l.color}}/>{nameOf(l,lang)}</button>)}</div>
  </section>;
}
