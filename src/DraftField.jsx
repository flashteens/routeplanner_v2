import React,{createContext,useContext,useEffect,useId,useRef,useState} from 'react';

export const DraftContext=createContext(null);
export default function DraftField({value,onCommit,t,as='input',type='text',allowEmpty=false,immediate=false,validationError='',...props}){
  const context=useContext(DraftContext),id=useId(),dirty=useRef(false),commitRef=useRef(onCommit);
  const initial=value==null?'':String(value),current=useRef(initial);
  const [text,setText]=useState(initial),[error,setError]=useState('');commitRef.current=onCommit;
  function discard(){dirty.current=false;current.current=value==null?'':String(value);setText(current.current);setError('');context?.register(id,null);}
  function commit(){
    if(!dirty.current)return true;
    try{
      const raw=current.current;
      if(type==='number'&&(!allowEmpty&&!raw.trim()||raw.trim()&&!Number.isFinite(Number(raw))))throw new Error(t('invalidNetwork'));
      // Unregister first so a commit never recursively submits itself.
      context?.register(id,null);
      commitRef.current(type==='number'?(allowEmpty&&raw===''?'':Number(raw)):raw);
      dirty.current=false;setError('');return true;
    }catch(e){setError(e instanceof SyntaxError?t('invalidJson'):e.message);context?.register(id,{commit,discard});return false;}
  }
  useEffect(()=>{if(!dirty.current){current.current=value==null?'':String(value);setText(current.current);}},[value]);
  useEffect(()=>()=>context?.register(id,null),[id,context]);
  const Tag=as;
  return <><Tag {...props} {...(as==='input'?{type}: {})} value={text} aria-invalid={Boolean(error||validationError)}
    onChange={e=>{current.current=e.target.value;setText(current.current);dirty.current=true;context?.register(id,{commit,discard});setError('');if(immediate)commit();}}
    onBlur={commit} onKeyDown={e=>{if(e.key==='Escape'&&dirty.current){e.preventDefault();discard();}else if(e.key==='Enter'&&as==='input'){e.preventDefault();commit();}}}/>{(error||validationError)&&<span className="error" role="alert">{error||validationError}</span>}</>;
}
