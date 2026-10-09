import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {transferGraph} from '../shared/transfer-graph.js';
import {nameOf} from '../shared/network.js';

export default function TransferGraph({data,station,selected,lang,t,onSelectEdge}){
  const graph=useMemo(()=>transferGraph(data,station),[data.edges,data.lines,station]);
  const [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),svg=useRef(null),gesture=useRef(null),id=useId().replace(/[^\w-]/g,'');
  useEffect(()=>{setZoom(1);setPan({x:0,y:0});},[station]);
  const box={x:graph.box.x+graph.box.w/2-graph.box.w/zoom/2+pan.x,y:graph.box.y+graph.box.h/2-graph.box.h/zoom/2+pan.y,w:graph.box.w/zoom,h:graph.box.h/zoom};
  const point=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.current.getScreenCTM().inverse());
  useEffect(()=>{const el=svg.current,handler=e=>{e.preventDefault();setZoom(z=>Math.max(.5,Math.min(8,z*(e.deltaY<0?1.15:1/1.15))));};el.addEventListener('wheel',handler,{passive:false});return()=>el.removeEventListener('wheel',handler);},[]);
  const choose=(e,edge)=>{e.stopPropagation();onSelectEdge(edge.id);};
  const seconds=e=>`${e.metrics.timeSec}${e.bidirectional&&(e.reverseTimeSec??e.metrics.timeSec)!==e.metrics.timeSec?` / ${e.reverseTimeSec}`:''} ${t('secondsShort')}`;
  const label=e=>`${e.id} · ${e.fromLine} ${e.bidirectional?'↔':'→'} ${e.toLine} · ${seconds(e)}`;
  return <section className="transfer-graph card" aria-label={t('transferGraph')}>
    <div className="transfer-graph-heading"><div><span className="eyebrow">{t('transferGraph')}</span><h2>{nameOf(data.stations[station],lang)}</h2></div><div className="graph-controls"><button onClick={()=>setZoom(z=>Math.min(8,z*1.4))} aria-label={t('graphZoomIn')}>+</button><button onClick={()=>setZoom(z=>Math.max(.5,z/1.4))} aria-label={t('graphZoomOut')}>−</button><button onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>{t('fit')}</button></div></div>
    <p className="muted">{t('transferGraphHint')}</p>
    <svg ref={svg} className="transfer-graph-canvas" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="group" aria-label={t('transferGraph')}
      onPointerDown={e=>{if(e.button!==0)return;gesture.current={start:point(e),inverse:svg.current.getScreenCTM().inverse(),pan:{...pan},pointer:e.pointerId};svg.current.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{if(gesture.current?.pointer!==e.pointerId)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(gesture.current.inverse);setPan({x:gesture.current.pan.x+gesture.current.start.x-p.x,y:gesture.current.pan.y+gesture.current.start.y-p.y});}}
      onPointerUp={()=>{gesture.current=null;}} onPointerCancel={()=>{gesture.current=null;}}>
      <defs><marker id={`${id}-end`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>
      {graph.links.map(({edge,path,x,y})=><g key={edge.id} data-transfer-edge={edge.id} role="button" tabIndex={0} aria-label={label(edge)} aria-pressed={edge.id===selected} onPointerDown={e=>choose(e,edge)} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();choose(e,edge);}}}>
        <path d={path} fill="none" stroke="transparent" strokeWidth="24"/>
        <path d={path} fill="none" stroke={edge.id===selected?'#176b76':'#718792'} strokeWidth={edge.id===selected?5:2.5} markerEnd={`url(#${id}-end)`} markerStart={edge.bidirectional?`url(#${id}-end)`:undefined}/>
        <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="16" paintOrder="stroke" stroke="white" strokeWidth="5" fill="#263d49">{seconds(edge)}</text><title>{label(edge)}</title>
      </g>)}
      {graph.nodes.map(node=><g key={node.id} data-transfer-node={node.id} transform={`translate(${node.x},${node.y})`}><rect x={-node.width/2} y={-22} width={node.width} height="44" rx="12" fill="white" stroke={node.color} strokeWidth="5"/><text textAnchor="middle" dominantBaseline="middle" fontSize="15" fill="#263d49">{node.id}</text><title>{nameOf(data.lines[node.id.split(':')[0]],lang)}{node.id.includes(':')?'':` · ${t('anyDirection')}`}</title></g>)}
    </svg>
    <p className="muted">{t('anyDirectionHint')}</p>
    {graph.walks.length>0&&<div className="transfer-walks"><strong>{t('externalWalks')}</strong>{graph.walks.map(e=><button key={e.id} onClick={()=>onSelectEdge(e.id)}>{e.lineId}: {nameOf(data.stations[e.from],lang)} → {nameOf(data.stations[e.to],lang)} · {e.metrics.timeSec} {t('secondsShort')}</button>)}</div>}
    <div className="transfer-edge-list" aria-label={t('transferGraphEdges')}>{graph.links.map(({edge})=><button key={edge.id} className={edge.id===selected?'selected':''} onClick={()=>onSelectEdge(edge.id)}>{label(edge)}</button>)}</div>
  </section>;
}
