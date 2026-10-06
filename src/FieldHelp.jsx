import React,{useEffect,useId,useRef,useState} from 'react';

export default function FieldHelp({label,children,t}){
  const id=useId(),container=useRef(null);
  const [hovered,setHovered]=useState(false),[pinned,setPinned]=useState(false),[focused,setFocused]=useState(false),[dismissed,setDismissed]=useState(false);
  const open=!dismissed&&(hovered||pinned||focused),close=()=>{setHovered(false);setPinned(false);setFocused(false);setDismissed(true);};
  useEffect(()=>{if(!open)return;const outside=e=>{if(!container.current?.contains(e.target))close();},escape=e=>{if(e.key==='Escape')close();};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[open]);
  return <span className="arrival-help" ref={container} onPointerLeave={()=>setHovered(false)}>
    <button type="button" className="field-help-button" aria-label={`${t('fieldHelp')}: ${label}`} aria-expanded={open} aria-controls={`${id}-help`}
      onPointerEnter={e=>{if(e.pointerType==='mouse'){setHovered(true);setDismissed(false);}}}
      onFocus={e=>{if(e.currentTarget.matches(':focus-visible')){setFocused(true);setDismissed(false);}}} onBlur={()=>setFocused(false)}
      onClick={()=>{if(pinned)close();else{setPinned(true);setDismissed(false);}}}>?</button>
    <div hidden={!open} id={`${id}-help`} className="arrival-help-panel" role="dialog" aria-label={`${t('fieldHelp')}: ${label}`}>
      <div className="arrival-help-content"><div className="arrival-help-title"><strong>{label}</strong><button type="button" aria-label={t('close')} onClick={close}>×</button></div>{children}</div>
    </div>
  </span>;
}
