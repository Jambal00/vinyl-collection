// Vinyl Collection service worker: keeps the app and its covers available with weak or no signal.
const SHELL='vc-shell-v2', MEDIA='vc-media-v1';
const SHELL_FILES=['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-180.png','./icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>![SHELL,MEDIA].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{if(e.data==='skipWaiting')self.skipWaiting()});
const API=/vcheck=|supabase\.co|musicbrainz\.org\/ws|api\.discogs\.com/;
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(API.test(url.href))return; // always live
  if(req.mode==='navigate'){ // app page: network first, fall back to cache
    e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(SHELL).then(x=>x.put('./index.html',c));return r}).catch(()=>caches.match('./index.html')));return;
  }
  if(req.destination==='image'||/fonts\.(googleapis|gstatic)\.com|unpkg\.com|cdn\.jsdelivr\.net/.test(url.host)){
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{const c=r.clone();caches.open(MEDIA).then(x=>x.put(req,c));return r}).catch(()=>hit)));return;
  }
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req)));
});
