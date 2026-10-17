/* Projetos Barquinha — cache offline do aplicativo, nunca do banco Supabase */
const CACHE_NAME="barquinha-shell-2026-10-17-v1";
const APP_FILES=["./","./index.html","./manifest.webmanifest"];
const SUPABASE_LIB="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await Promise.all(APP_FILES.map(async path=>{try{await cache.add(path)}catch(e){}}));
  // A biblioteca de autenticação também precisa estar disponível ao ficar sem internet.
  try{const response=await fetch(SUPABASE_LIB,{mode:"no-cors",cache:"no-cache"});await cache.put(SUPABASE_LIB,response)}catch(e){}
  await self.skipWaiting();
 })());
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith("barquinha-shell-")&&k!==CACHE_NAME).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
self.addEventListener("fetch",event=>{
 const req=event.request;
 if(req.method!=="GET")return;
 const url=new URL(req.url);
 if(url.href===SUPABASE_LIB){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE_NAME);
   const saved=await cache.match(SUPABASE_LIB);
   if(saved)return saved;
   const res=await fetch(req);
   if(res.ok||res.type==="opaque")await cache.put(SUPABASE_LIB,res.clone());
   return res;
  })());
  return;
 }
 if(url.origin!==self.location.origin)return;
 if(req.mode==="navigate"){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE_NAME);
   try{
    const res=await fetch(req);
    if(res.ok)await cache.put("./",res.clone());
    return res;
   }catch(e){
    return await cache.match("./")||await cache.match("./index.html")||Response.error();
   }
  })());
  return;
 }
 // Arquivos públicos do aplicativo; APIs e dados privados nunca são armazenados aqui.
 if(/\.(?:webmanifest|css|js|png|svg|ico)$/.test(url.pathname)){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE_NAME);
   try{const res=await fetch(req);if(res.ok)await cache.put(req,res.clone());return res}
   catch(e){return await cache.match(req)||Response.error()}
  })());
 }
});