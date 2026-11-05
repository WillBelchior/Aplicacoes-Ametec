import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync,existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const dir=join(dirname(fileURLToPath(import.meta.url)),"..");
test("A build exclusiva não disponibiliza o legado Projetos",()=>{
  execFileSync(process.execPath,[join(dir,"build-attendance.mjs")],{stdio:"pipe"});
  const out=join(dir,"attendance-dist");
  for(const file of ["index.html","app.js","auth.js","modules.js","attendance-live.js",
    "styles.css","attendance-live.css","manifest.webmanifest","robots.txt"])
      assert.ok(existsSync(join(out,file)),"missing "+file);
  assert.ok(!existsSync(join(out,"projetos")));
  assert.ok(!existsSync(join(out,"sw.js")));
  assert.deepEqual(readdirSync(out).sort(),["app.js","attendance-live.css","attendance-live.js",
    "auth.js","index.html","manifest.webmanifest","modules.js","robots.txt","styles.css"].sort());
});
test("A entrada de Projetos em domínio independente abre somente o endereço oficial",()=>{
  const app=readFileSync(join(dir,"app.js"),"utf8");
  const auth=readFileSync(join(dir,"auth.js"),"utf8");
  assert.match(app,/const isolatedPreview=projects&&!officialHost/);
  assert.match(app,/main\.hidden=projects&&!isolatedPreview;embed\.hidden=!projects\|\|isolatedPreview/);
  assert.match(app,/https:\/\/obra-facil-acompanhamento\.vercel\.app\//);
  assert.match(auth,/location\.hostname==="obra-facil-acompanhamento\.vercel\.app"/);
});
test("Fila real atualiza periodicamente apenas quando aberta e visível",()=>{
  const app=readFileSync(join(dir,"app.js"),"utf8");
  const live=readFileSync(join(dir,"attendance-live.js"),"utf8");
  assert.match(app,/document\.visibilityState==="hidden"/);
  assert.match(app,/AttendanceLive\?\.syncQuietly\(\)/);
  assert.match(live,/function syncQuietly\(\)/);
});
