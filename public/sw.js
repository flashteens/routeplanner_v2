const VERSION='ftmc-v2-12';
const SHELL=VERSION+'-shell',NETWORK=VERSION+'-network';
let activeConf=null;
let mutations=Promise.resolve();
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  const assets=await fetch('/offline-assets.json').then(r=>r.json());
  await cache.addAll(['/', '/icon.svg','/data/systems.json','/i18n/en.json','/i18n/zh.json','/i18n/ja.json',...assets]);
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('ftmc-v2-')&&![SHELL,NETWORK].includes(key))await caches.delete(key);
  await self.clients.claim();
})()));
async function selectNetwork(conf){
  activeConf=conf;
  const cache=await caches.open(NETWORK);
  for(const req of await cache.keys())if(new URL(req.url).pathname!==`/data/${conf}.json`)await cache.delete(req);
}
self.addEventListener('message',event=>{
  if(event.data?.type!=='SELECT_NETWORK'||!/^[a-z0-9_-]+$/i.test(event.data.conf))return;
  activeConf=event.data.conf;
  mutations=mutations.then(async()=>{
    if(activeConf!==event.data.conf)return;
    await selectNetwork(event.data.conf);
    if(event.data.conf==='_blank'){event.source?.postMessage({type:'CACHE_STATUS',conf:'_blank',ready:true});return;}
    const response=await fetch(`/data/${event.data.conf}.json`,{cache:'no-cache'}).catch(()=>null);
    if(response?.ok && activeConf===event.data.conf)await(await caches.open(NETWORK)).put(`/data/${event.data.conf}.json`,response);
    const ready=Boolean(await(await caches.open(NETWORK)).match(`/data/${event.data.conf}.json`));
    event.source?.postMessage({type:'CACHE_STATUS',conf:event.data.conf,ready});
  });event.waitUntil(mutations);
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(req.mode==='navigate' && ['/', '/editor'].includes(url.pathname)){
    event.respondWith(fetch(req).catch(()=>caches.open(SHELL).then(cache=>cache.match('/'))));return;
  }
  if(url.pathname.startsWith('/data/')&&url.pathname!=='/data/systems.json'){
    const match=url.pathname.match(/^\/data\/([a-z0-9_-]+)\.json$/i);if(!match)return;
    event.respondWith((async()=>{
      const cache=await caches.open(NETWORK);
      try {
        const response=await fetch(req);
        if(response.ok){
          mutations=mutations.then(async()=>{if(activeConf!=null&&activeConf!==match[1])return;await selectNetwork(match[1]);await cache.put(req,response.clone());});await mutations;
        }
        return response;
      }catch(error){const stored=await cache.match(req);if(stored)return stored;throw error;}
    })());return;
  }
  if(url.pathname.startsWith('/assets/')||url.pathname.startsWith('/i18n/')||['/icon.svg','/data/systems.json'].includes(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(SHELL),stored=await cache.match(req);
      if(stored)return stored;
      const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response;
    })());
  }
});
