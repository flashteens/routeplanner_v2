import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import express from 'express';
import {findRoute} from '../shared/router.js';
import {systemTitle,sourceLinks,footerDescription} from '../shared/presentation.js';
import {nameOf} from '../shared/network.js';
import {translator,routeText} from '../shared/format.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const dev=process.argv.includes('--dev');
export const app=express();
app.disable('x-powered-by');
const registry=JSON.parse(await fs.readFile(root+'public/data/systems.json','utf8'));
const dictionaries=Object.fromEntries(await Promise.all(['en','zh','ja'].map(async lang=>[lang,JSON.parse(await fs.readFile(root+`public/i18n/${lang}.json`,'utf8'))])));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const locale=req=>['zh','zh-TW'].includes(req.query.lang)?'zh':req.query.lang==='ja'?'ja':'en';
async function loadNetwork(conf='ftmc'){
  if(typeof conf!=='string'||!registry.some(s=>s.id===conf))throw Object.assign(new Error('UNKNOWN_SYSTEM'),{status:404});
  return JSON.parse(await fs.readFile(path.join(root,'public/data',`${conf}.json`),'utf8'));
}
const params=req=>Object.fromEntries(['criteria','transferCoef','horseSpeedClass','enableExpressCarts'].filter(k=>req.query[k]!=null).map(k=>{
  if(typeof req.query[k]!=='string')throw new Error('INVALID_PARAMETER');return[k,req.query[k]];
}));
const shell=(title,body,lang='en')=>`<!doctype html><html lang="${lang==='zh'?'zh-Hant':lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><link rel="icon" href="/icon.svg"><style>body{font:16px/1.7 system-ui,sans-serif;max-width:960px;padding:32px;margin:auto;background:#f4f8fa;color:#18313c}a{color:#176b76}pre{white-space:pre-wrap;background:white;border:1px solid #d9e4e8;border-radius:12px;padding:24px}select,button{padding:10px;margin:4px}table{border-collapse:collapse}td,th{border:1px solid #ccd9dc;padding:10px}</style></head><body>${body}</body></html>`;
function routeHtml(data,result,lang){
  const dict=dictionaries[lang],t=translator(dict),title=`${nameOf(data.stations[result.from],lang)} → ${nameOf(data.stations[result.to],lang)} · ${systemTitle(data,lang,t)}${data.preview?' · '+t('preview'):''}`;
  const query=new URLSearchParams({conf:data.id,from:result.from,to:result.to,lang,...Object.fromEntries(Object.entries(result.options).map(([k,v])=>[k,String(v)]))});
  const schema={'@context':'https://schema.org','@type':'WebPage',name:title,description:result.success?routeText(data,result,lang,dict):t('noRoute')};
  return {title,body:`<main><p><a href="/?${escape(query)}">${escape(t('recalculate'))}</a> · <a href="/api">API</a></p><h1>${escape(title)}</h1><pre>${escape(routeText(data,result,lang,dict))}</pre>${data.fares.source?`<p><a href="${escape(data.fares.source)}">${escape(t('fareSource'))}</a></p>`:''}<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script></main>`};
}
app.use('/api',(req,res,next)=>{res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Methods','GET, OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next();});
app.get('/api/systems',(req,res)=>res.json(registry));
app.get('/api/networks/:conf',async(req,res)=>res.json(await loadNetwork(req.params.conf)));
app.get('/api/route',async(req,res)=>{
  const result=findRoute(await loadNetwork(req.query.conf),req.query.from,req.query.to,params(req));
  res.set('Cache-Control','public, max-age=60').status(result.success?200:404).json(result);
});
const apiSpec={openapi:'3.1.0',info:{title:'FTMC Route Planner v2 API',version:'2.0.0',description:'Public read-only API. Same Dijkstra implementation as the browser. Names are official legacy names. Duration includes legacy departure dwell times; excludes live waiting times.'},
  paths:{'/api/systems':{get:{summary:'Available transit systems',responses:{200:{description:'System registry'}}}},'/api/networks/{conf}':{get:{summary:'Complete portable network JSON',parameters:[{name:'conf',in:'path',required:true,schema:{type:'string'}}],responses:{200:{description:'schemaVersion 2 network'}}}},'/api/route':{get:{summary:'Calculate an optimal route',parameters:[
    {name:'conf',in:'query',schema:{type:'string',default:'ftmc'}},{name:'from',in:'query',required:true,schema:{type:'string'}},{name:'to',in:'query',required:true,schema:{type:'string'}},
    {name:'criteria',in:'query',schema:{type:'string',enum:['time','transfers','transferTime','stops','mixed'],default:'time'}},{name:'transferCoef',in:'query',schema:{type:'number'}},
    {name:'horseSpeedClass',in:'query',schema:{type:'string',enum:['_HX','_SX','_LX','_XP','_SH','_NEX']}},{name:'enableExpressCarts',in:'query',schema:{type:'integer',enum:[-1,0,1,2,3]}}],
    responses:{200:{description:'Route, vector metrics, steps and segments'},400:{description:'Invalid station/option parameter'},404:{description:'Unknown system or no route'}}}}}};
app.get('/api/openapi.json',(req,res)=>res.json(apiSpec));
app.get('/api',(req,res)=>res.type('html').send(shell('FTMC Route Planner v2 API',`<h1>FTMC Route Planner v2 API</h1><p>Public, read-only JSON endpoints. CORS enabled. No API key required.</p><p><a href="/api/openapi.json">OpenAPI specification</a> · <a href="/">Planner</a></p><table><tr><th>Endpoint</th><th>Purpose</th></tr><tr><td><a href="/api/systems">GET /api/systems</a></td><td>Available systems</td></tr><tr><td><a href="/api/networks/ftmc">GET /api/networks/:conf</a></td><td>Portable JSON network</td></tr><tr><td><a href="/api/route?conf=ftmc&amp;from=NV&amp;to=FH">GET /api/route?conf=ftmc&amp;from=NV&amp;to=FH</a></td><td>Optimal route and vector totals</td></tr></table><p>Station identifiers, codes, and exact official names are accepted. Read each network's <code>options</code> for supported preferences, transfer coefficients, horse speeds and express levels.</p><p>Response metrics: <code>timeSec</code> (seconds), <code>distanceKm</code> (kilometres), <code>price</code> (currency units; null if unavailable). TRTC totals use the official origin–destination table; segment fares are standalone prices and must not be added. Missing coordinate distances and walking/transfer distances are 0.</p><p><a href="/route?conf=ftmc&amp;from=NV&amp;to=FH">HTML route example for crawlers</a></p><pre>${escape(JSON.stringify(apiSpec,null,2))}</pre>`)));
app.get('/route',async(req,res)=>{
  const data=await loadNetwork(req.query.conf),lang=locale(req),result=findRoute(data,req.query.from,req.query.to,params(req));
  const {title,body}=routeHtml(data,result,lang);res.status(result.success?200:404).type('html').send(shell(title,body,lang));
});
app.get('/robots.txt',(req,res)=>res.type('text').send('User-agent: *\nAllow: /\nDisallow: /editor\nSitemap: /sitemap.xml\n'));
app.get('/sitemap.xml',(req,res)=>{
  const configured=process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
  const origin=new URL(configured).origin;
  res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${registry.flatMap(s=>['en','zh','ja'].map(lang=>`<url><loc>${escape(origin+`/?conf=${s.id}&lang=${lang}`)}</loc></url>`)).join('')}</urlset>`);
});
// Production manifest supplies the exact app asset list to the service worker.
app.get('/offline-assets.json',async(req,res)=>{
  if(dev)return res.json([]);
  const files=await fs.readdir(root+'dist/assets');res.json(files.filter(f=>!f.endsWith('.map')).map(f=>'/assets/'+f));
});
app.use('/data',express.static(root+'public/data',{maxAge:0}));
app.use('/i18n',express.static(root+'public/i18n',{maxAge:0}));
app.get('/sw.js',async(req,res)=>{
  const source=await fs.readFile(root+'public/sw.js','utf8');
  const revision=createHash('sha256').update(source).update(JSON.stringify(registry)).update(JSON.stringify(dictionaries));
  if(!dev)revision.update(await fs.readFile(root+'dist/.vite/manifest.json'));
  res.set('Cache-Control','no-cache').type('application/javascript').send(source.replace("const VERSION='ftmc-v2-1';",`const VERSION='ftmc-v2-${revision.digest('hex').slice(0,12)}';`));
});
let vite;
if(dev){const {createServer}=await import('vite');vite=await createServer({root,server:{middlewareMode:true},appType:'custom'});}
app.get(['/', '/editor'],async(req,res)=>{
  const data=await loadNetwork(req.query.conf),lang=locale(req),t=translator(dictionaries[lang]);
  let content=`<main><h1>${escape(t('appTitle'))} · ${escape(systemTitle(data,lang,t))}${data.preview?' · '+escape(t('preview')):''}</h1><p>${escape(t('subtitle'))}</p>${footerDescription(data,lang)?`<p>${escape(footerDescription(data,lang))}</p>`:''}${sourceLinks(data,lang).slice(0,1).filter(link=>/^https?:\/\//.test(link.url)).map(link=>`<p><a href="${escape(link.url)}">${escape(link.text)}</a></p>`).join('')}<form action="/route"><input type="hidden" name="conf" value="${escape(data.id)}"><input type="hidden" name="lang" value="${lang}">${['from','to'].map(key=>`<label>${escape(t(key))}<select name="${key}">${Object.values(data.stations).map(s=>`<option value="${escape(s.id)}">${escape(nameOf(s,lang))}</option>`).join('')}</select></label>`).join('')}<button>${escape(t('plan'))}</button></form><p><a href="/api">API</a></p></main>`;
  let title=`${t('appTitle')} · ${systemTitle(data,lang,t)}${data.preview?' · '+t('preview'):''}`;
  if(req.query.from && req.query.to && req.path!=='/editor'){
    const rendered=routeHtml(data,findRoute(data,req.query.from,req.query.to,params(req)),lang);content=rendered.body;title=rendered.title;
  }
  let html=await fs.readFile(root+(dev?'index.html':'dist/index.html'),'utf8');
  html=html.replace('__ROUTE_CONTENT__',content).replace('<title>FTMC Route Planner v2</title>',`<title>${escape(title)}</title>`).replace('<html lang="en">',`<html lang="${lang==='zh'?'zh-Hant':lang}">`);
  if(dev)html=await vite.transformIndexHtml(req.originalUrl,html);
  res.type('html').send(html);
});
if(dev)app.use(vite.middlewares);else app.use(express.static(root+'dist',{index:false}));
app.use((req,res)=>res.status(404).json({error:'NOT_FOUND'}));
app.use((err,req,res,next)=>{
  const known=['UNKNOWN_STATION','INVALID_PARAMETER','INVALID_CRITERIA','INVALID_TRANSFER_COEFFICIENT','INVALID_HORSE_SPEED','INVALID_EXPRESS_LEVEL','UNKNOWN_SYSTEM'];
  const status=err.status || (known.includes(err.message)?400:500);
  if(status===500)console.error(err);
  res.status(status).json({success:false,error:status===500?'INTERNAL_ERROR':err.message});
});
if(process.env.NODE_ENV!=='test')app.listen(Number(process.env.PORT || 3000),process.env.HOST || '0.0.0.0',()=>console.log(`FTMC Route Planner v2: http://localhost:${process.env.PORT || 3000}${dev?' (development)':''}`));
