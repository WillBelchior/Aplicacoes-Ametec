import {mkdir,copyFile,rm,writeFile} from "node:fs/promises";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";

/* Build exclusiva para a aplicação independente de Atendimentos.
   Não incorpora, publica ou copia os arquivos de Projetos Barquinha. */
const root=dirname(fileURLToPath(import.meta.url));
const out=join(root,"attendance-dist");
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const name of [
  "index.html","styles.css","attendance-live.css","modules.js",
  "auth.js","attendance-live.js","app.js"
]){
  await copyFile(join(root,name),join(out,name));
}
await writeFile(join(out,"manifest.webmanifest"),JSON.stringify({
  name:"Atendimentos Barquinha",short_name:"Barquinha",
  description:"Gestão de pacientes e atendimentos autorizados",
  start_url:"/",scope:"/",display:"standalone",
  background_color:"#f5f8fd",theme_color:"#24466B",lang:"pt-BR"
},null,2),"utf8");
await writeFile(join(out,"robots.txt"),"User-agent: *\nDisallow: /\n","utf8");
console.log("Atendimentos Barquinha: build independente sem arquivos do Projetos.");
