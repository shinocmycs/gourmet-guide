const APP_CACHE='gourmet-v2120-photospeed';
const PHOTO_CACHE='gourmet-photo-cache-v1';

const ASSETS=[
  './',
  './index.html',
  './style.css',
  './app.js',
  './supabase-config.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE).then(cache=>cache.addAll(ASSETS))
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys
        .filter(key =>
          key !== APP_CACHE &&
          key !== PHOTO_CACHE &&
          (key.startsWith('gourmet-v') || key.startsWith('gourmet-photo-cache-'))
        )
        .map(key=>caches.delete(key))
    )).then(()=>self.clients.claim())
  );
});

function isSupabasePhoto(request){
  try{
    const url=new URL(request.url);
    return request.method==='GET' &&
      url.hostname.endsWith('.supabase.co') &&
      url.pathname.includes('/storage/v1/object/');
  }catch{
    return false;
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;

  // Supabase images: cache-first. ignoreSearch lets a refreshed signed token
  // reuse the same locally cached image path.
  if(isSupabasePhoto(request)){
    event.respondWith((async()=>{
      const cache=await caches.open(PHOTO_CACHE);
      const cached=await cache.match(request,{ignoreSearch:true});
      if(cached) return cached;

      try{
        const response=await fetch(request);
        if(response && (response.ok || response.type==='opaque')){
          cache.put(request,response.clone()).catch(()=>{});
        }
        return response;
      }catch(err){
        const fallback=await cache.match(request,{ignoreSearch:true});
        if(fallback) return fallback;
        throw err;
      }
    })());
    return;
  }

  // App files: network-first so GitHub updates appear quickly, with offline fallback.
  event.respondWith(
    fetch(request)
      .then(response=>{
        const copy=response.clone();
        caches.open(APP_CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
        return response;
      })
      .catch(()=>caches.match(request))
  );
});
