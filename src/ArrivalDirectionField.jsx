import React,{useId} from 'react';
import FieldHelp from './FieldHelp.jsx';
import DraftField from './DraftField.jsx';

function ArrivalDiagram({t,id}){
  return <figure className="arrival-help-figure"><svg viewBox="0 0 320 215" role="img" aria-label={t('arrivalHelpDiagram')}>
    <defs>{['in','loop'].map((part,i)=><marker key={part} id={`${id}-${part}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={i?'#b8751d':'#176b76'}/></marker>)}</defs>
    <path d="M 210 190 V 75 C 210 43 185 25 155 25 C 112 25 88 50 88 82 C 88 118 111 137 145 137 C 183 137 210 118 210 82" fill="none" stroke="#c9d9df" strokeWidth="7" strokeLinecap="round"/>
    <path d="M 210 190 V 82" fill="none" stroke="#176b76" strokeWidth="5"/>
    <path d="M 210 165 V 130" fill="none" stroke="#176b76" strokeWidth="5" markerEnd={`url(#${id}-in)`}/>
    <path d="M 210 82 V 75 C 210 43 185 25 155 25" fill="none" stroke="#b8751d" strokeWidth="5" markerEnd={`url(#${id}-loop)`}/>
    {[[210,190,'A',228,195],[210,82,'J',228,87],[155,25,'B',145,13]].map(([x,y,name,tx,ty])=><g key={name}><circle cx={x} cy={y} r="5" fill="white" stroke="#304858" strokeWidth="2"/><text x={tx} y={ty} fontSize="15" fontWeight="700" fill="#263d49">{name}</text></g>)}
    <text x="164" y="160" textAnchor="end" fontSize="14" fontWeight="700" fill="#176b76">IN</text><text x="250" y="40" textAnchor="middle" fontSize="14" fontWeight="700" fill="#b8751d">LOOP</text>
  </svg><figcaption>{t('arrivalHelpExample')}</figcaption></figure>;
}
export default function ArrivalDirectionField({reverse=false,value,onCommit,t}){
  const field=reverse?'reverseArrivalDirection':'arrivalDirection',id=useId();
  return <div className="field-label arrival-code-field"><div className="arrival-label-heading"><label htmlFor={id}>{t(field)}</label>
    <FieldHelp label={t(field)} t={t}><p>{t(reverse?'arrivalHelpReverse':'arrivalHelpForward')}</p><ArrivalDiagram t={t} id={`arrival-${id.replace(/[^\w-]/g,'')}`}/></FieldHelp>
  </div><DraftField id={id} aria-label={t(field)} value={value??''} onCommit={text=>onCommit(text||undefined)} t={t}/></div>;
}
