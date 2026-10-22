import {readFile,writeFile,mkdir,copyFile,rm} from "node:fs/promises";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const dist=join(here,"dist");
const legacySource=resolve(here,"../obra-facil/index.html");
const html=await readFile(legacySource,"utf8");
const replaceOnce=(source,before,after,name)=>{
  if(source.split(before).length!==2)throw Error("Unexpected legacy structure: "+name);
  return source.replace(before,after);
};
let legacy=html;
legacy=replaceOnce(legacy,
  "let cloudPersistenceEnabled=false;\nfunction deviceTrusted(){",
  \`function platformEmbedded(){
 try {return window.parent!==window&&window.parent.location.origin===location.origin&&window.parent.__barquinhaPlatformAuthKind==="session"||window.parent!==window&&window.parent.location.origin===location.origin&&window.parent.__barquinhaPlatformAuthKind==="local"} catch(e){return false}
}
let cloudPersistenceEnabled=false;
function deviceTrusted(){\`,
  "platform auth context");
legacy=replaceOnce(legacy,
  "function createCloudAuthClient(trusted){\n cloudPersistenceEnabled=!!trusted;\n return window.supabase.createClient(CLOUD_URL,CLOUD_KEY,{auth:{\n  persistSession:!!trusted,autoRefreshToken:true,detectSessionInUrl:false,storageKey:TRUSTED_AUTH_STORAGE_KEY\n }});\n}",
  \`function createCloudAuthClient(trusted){
 const embedded=platformEmbedded();
 cloudPersistenceEnabled=embedded||!!trusted;
 const auth={persistSession:embedded||!!trusted,autoRefreshToken:true,detectSessionInUrl:false,storageKey:TRUSTED_AUTH_STORAGE_KEY};
 if(embedded)auth.storage=window.parent.__barquinhaPlatformAuthKind==="local"?localStorage:sessionStorage;
 return window.supabase.createClient(CLOUD_URL,CLOUD_KEY,{auth});
}\`,
  "same-origin shared auth storage");
legacy=replaceOnce(legacy,
  "  const trusted=deviceTrusted();\n  cloudClient=createCloudAuthClient(trusted);",
  "  const trusted=deviceTrusted()||platformEmbedded();\n  cloudClient=createCloudAuthClient(trusted);",
  "restore embedded session");
legacy=replaceOnce(legacy,
  "async function signOutApp(){\n if(!confirm("Deseja sair da sua conta neste aparelho?"))return;",
  \`async function signOutApp(){
 if(platformEmbedded()){window.parent.postMessage({type:"barquinha:logout"},location.origin);return}
 if(!confirm("Deseja sair da sua conta neste aparelho?"))return;\`,
  "centralized sign out");
legacy=replaceOnce(legacy,
  "function allowInterface(){accessReady=true;",
  \`function allowInterface(){if(platformEmbedded())window.parent.postMessage({type:"barquinha:project-ready"},location.origin);accessReady=true;\`,
  "embed ready notification");
legacy=replaceOnce(legacy,
  "function render(){\n if(tab===\"projetos\")",
  \`function render(){
 if(platformEmbedded())window.parent.postMessage({type:"barquinha:project-tab",tab},location.origin);
 if(tab==="projetos")\`,
  "tab synchronization");
legacy=replaceOnce(legacy,
  "persistLocal();render();initOfflineSupport();initCloud();\n</script>",
  \`persistLocal();render();initOfflineSupport();initCloud();
window.addEventListener("message",event=>{
 if(!platformEmbedded()||event.source!==window.parent||event.origin!==location.origin)return;
 if(event.data?.type!=="barquinha:navigate-project")return;
 const allowed=["obras","financeiroGeral","estoque","cadastros","historico","acessos"];
 if(!allowed.includes(event.data.tab)||!accessReady)return;
 tab=event.data.tab;render();
});
</script>\`,
  "safe project subtab navigation");
// Hide duplicate navigation and sidebar only when integrated inside platform.
// The original standalone source remains unchanged.
legacy=legacy.replace("</style>",
\`<style>
html,body{background:#f5f8fd!important}
body:has(.app:not([inert])) .app{display:block!important}
body:has(.app:not([inert])) .app>aside{display:none!important}
body:has(.app:not([inert])) .app>main{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:12px 18px!important}
body:has(.app:not([inert])) .topbar{display:none!important}
body:has(.app:not([inert])) .app>main>header{display:none!important}
body:has(.app:not([inert])) #technicalNotice{display:none!important}
body:has(.app:not([inert])) .app>main>footer{display:none!important}
body:has(.app:not([inert])) .app{grid-template-columns:1fr!important}
@media(max-width:650px){body:has(.app:not([inert])) .app>main{padding:8px!important}}
</style></style>\`);
await rm(dist,{recursive:true,force:true});
await mkdir(join(dist,"projetos"),{recursive:true});
for(const file of ["index.html","styles.css","auth.js","app.js"])await copyFile(join(here,file),join(dist,file));
await writeFile(join(dist,"projetos/index.html"),legacy,"utf8");
console.log("Plataforma Barquinha: built with a same-origin copy of Projects (source untouched).");
