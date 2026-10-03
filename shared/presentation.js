import {nameOf} from './network.js';

export function localizedText(values,lang){return values?.[lang==='zh-TW'?'zh':lang] ?? values?.en ?? '';}
export function systemTitle(data,lang,t){return nameOf(data,lang)+(data.ui?.unofficial?` (${t('unofficial')})`:'');}
export function footerDescription(data,lang){return localizedText(data.footer?.description,lang);}
export function sourceLinks(data,lang){return data.sources?.links?.[lang==='zh-TW'?'zh':lang] ?? data.sources?.links?.en ?? [];}
export function segmentInstruction(data,segments,index,lang,t){
  const segment=segments[index],line=nameOf(data.lines[segment.lineId],lang);
  if(segment.kind==='transfer')return t(data.lines[segment.lineId]?.interior?'transferVia':'transferTo',{line});
  if(segment.kind==='ride'&&segments[index-1]?.kind==='ride')return t('continueRide',{line});
  return `${t(segment.kind)} ${line}`;
}
