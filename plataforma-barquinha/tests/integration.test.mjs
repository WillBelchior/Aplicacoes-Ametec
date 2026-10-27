import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const root=join(here,"..");
const app=readFileSync(join(root,"app.js"),"utf8");
const auth=readFileSync(join(root,"auth.js"),"utf8");
const catalog=readFileSync(join(root,"modules.js"),"utf8");
const build=readFileSync(join(root,"build.mjs"),"utf8");

test("Platform requires user session and uses institutional Supabase",()=>{
  assert.match(app,/if\(!window\.PlatformAuth\?\.user\)/);
  assert.match(auth,/barquinha_members/);
  assert.match(auth,/data\.status|data\?\.status/);
  assert.match(auth,/status!=="active"/);
  assert.match(auth,/barquinha-auth-v1/);
  assert.match(auth,/persistSession:true/);
  assert.match(auth,/sessionStorage/);
  assert.doesNotMatch(auth,/service_role|sb_secret_/);
});
test("Only project tabs are shared; no real attendance storage introduced",()=>{
  for(const label of ["Minhas Obras","Financeiro","Estoque","Cadastro","Histórico","Acessos"])
    assert.ok(catalog.includes(label),"Missing Projects subtab: "+label);
  assert.match(app,/barquinha:navigate-project/);
  assert.match(app,/barquinha:project-ready/);
  assert.doesNotMatch(app,/\.from\(["'](?:patients|pacientes|atendimentos)["']\)/);
});
test("Compile static site and embedded legacy app without modifying original",()=>{
  const original=readFileSync(join(root,"..","obra-facil","index.html"),"utf8");
  execFileSync(process.execPath,[join(root,"build.mjs")],{stdio:"pipe"});
  const out=join(root,"dist");
  for(const file of ["index.html","auth.js","modules.js","app.js","styles.css","sw.js","manifest.webmanifest","projetos/index.html","projetos/sw.js","projetos/manifest.webmanifest"])
    assert.ok(existsSync(join(out,file)),file+" missing");
  const embedded=readFileSync(join(out,"projetos","index.html"),"utf8");
  assert.match(embedded,/function platformEmbedded\(\)/);
  assert.match(embedded,/barquinha:navigate-project/);
  assert.match(embedded,/auth\.storage=window\.parent/);
  assert.match(embedded,/function financeTotals\(/);
  assert.match(embedded,/html\.platform-embedded/);
  assert.match(embedded,/classList\.add\(\x27platform-embedded\x27\)/);
  const sw=readFileSync(join(out,"sw.js"),"utf8");
  assert.match(sw,/registration\.unregister\(\)/);
  assert.ok(!original.includes("platformEmbedded()"));
  assert.ok(embedded.length>original.length);
  assert.equal(readFileSync(join(root,"..","obra-facil","index.html"),"utf8"),original);
});
