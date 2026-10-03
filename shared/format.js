import {segmentInstruction,footerDescription} from './presentation.js';
import { nameOf, languageKey } from './network.js';
export const translator = dict => (key,args={}) => String(dict[key] ?? key).replace(/\{(\w+)\}/g,(_,k)=>args[k] ?? '');
export function duration(seconds,t){const sec=Math.round(seconds),min=Math.floor(sec/60);return min?`${min} ${t('minutes')}${sec%60 ? ` ${sec%60} ${t('seconds')}`:''}`:`${sec} ${t('seconds')}`;}
export function routeText(data,result,lang,dict){
  const t=translator(dict);
  if(!result?.success)return t(result?.error || 'readyBody');
  const text=[`${nameOf(data.stations[result.from],lang)} → ${nameOf(data.stations[result.to],lang)}`,
    `${t('duration')}: ${duration(result.metrics.timeSec,t)} · ${t('transferCount')}: ${result.transfers} · ${t('stopCount')}: ${result.stops}`];
  if(data.ui.enableDistance)text.push(`${t('distance')}: ${result.metrics.distanceKm.toFixed(3)} km`);
  if(data.ui.enableFare)text.push(`${t('fare')}: ${result.metrics.price == null?t('unknownFare'):`${result.currency || ''} ${result.metrics.price}`}`);
  for(const [i,s] of result.segments.entries())text.push(`${segmentInstruction(data,result.segments,i,lang,t)}${s.directionLabel?.[languageKey(lang)]?` · ${s.directionLabel[languageKey(lang)]}`:''}: ${nameOf(data.stations[s.from],lang)}${s.to!==s.from?` → ${nameOf(data.stations[s.to],lang)}`:''} (${duration(s.timeSec,t)})`);
  text.push(`${t('arrive')}: ${nameOf(data.stations[result.to],lang)}`);
  if(data.ui.enableFare && data.fares.type==='origin-destination')text.push(t(result.fareBreaks.length?'fareBreakNote':'fareNote'));
  if(footerDescription(data,lang))text.push(footerDescription(data,lang));
  return text.join('\n');
}
