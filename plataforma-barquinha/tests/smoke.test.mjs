import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const read=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const app=read("app.js"),auth=read("auth.js"),modules=read("modules.js"),styles=read("styles.css"),html=read("index.html");
const context={window:{}};
vm.runInNewContext(modules,context,{filename:"modules.js"});
const catalog=context.window.BarquinhaRegistry;

test("registry contains canonical modules with unique ids and paths",()=>{
  assert.deepEqual(Array.from(catalog.modules,m=>m.id),["inicio","projetos","atendimentos","igreja"]);
  const ids=catalog.modules.map(m=>m.id),routes=catalog.modules.map(m=>m.route);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(new Set(routes).size,routes.length);
  assert.equal(catalog.byId("projetos").status,"active");
  assert.equal(catalog.byId("atendimentos").status,"demo");
  assert.equal(catalog.byId("igreja").status,"planned");
});
test("existing Projects tabs are preserved by the registry",()=>{
  assert.deepEqual(Array.from(catalog.byId("projetos").sections,s=>s.title),
    ["Minhas Obras","Financeiro","Estoque","Cadastro","Histórico","Acessos"]);
  assert.equal(catalog.byId("projetos").sections[1].legacyTab,"financeiroGeral");
  assert.equal(catalog.byId("projetos").sections[3].legacyTab,"cadastros");
});
test("future Church Finance and official-member registry are marked planned",()=>{
  const planned=catalog.byId("igreja").sections;
  assert.deepEqual(Array.from(planned,s=>s.title),["Financeiro da Igreja","Irmãos Oficiais"]);
  assert.ok(planned.every(s=>s.status==="planned"));
  assert.match(app,/Ainda não é permitido armazenar dados pessoais/);
  assert.match(app,/Cadastro, movimentações financeiras e relatórios ficarão indisponíveis/);
});
test("module manager powers all major entry points",()=>{
  assert.match(app,/window\.BarquinhaRegistry\.modules\.map\(module=>sideButton/);
  assert.match(app,/window\.BarquinhaRegistry\.modules\.map\(module=>bottomButton/);
  assert.match(app,/const registry=window\.BarquinhaRegistry\.modules/);
  assert.match(app,/churchPage\(route\)/);
  assert.match(html,/src="\.\/modules\.js"/);
  assert.match(styles,/\.mobile-bottom\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
test("SSO continues requiring an active member",()=>{
  assert.match(auth,/barquinha_members/);
  assert.match(auth,/data\?\.status!=="active"/);
  assert.match(auth,/barquinha-auth-v1/);
  assert.match(auth,/\/projetos\/index\.html/);
  assert.doesNotMatch(auth,/https:\/\/obra-facil-acompanhamento\.vercel\.app/);
});
test("old root password-recovery callbacks survive migration",()=>{
  assert.match(html,/get\("recovery"\)==="1"/);
  assert.match(html,/location\.replace\("\/projetos\/index\.html"\+location\.search\+location\.hash\)/);
});
test("attendance remains clearly demo-only",()=>{
  assert.doesNotMatch(app,/\bfetch\s*\(|XMLHttpRequest|indexedDB|\.from\(["'](?:patients|pacientes|atendimentos)["']\)/);
  assert.match(app,/name="cpf"/);
  assert.match(app,/id="patient-photo"/);
  assert.match(styles,/queue-board-scroll\s*\{[^}]*overflow-x:auto/);
});
