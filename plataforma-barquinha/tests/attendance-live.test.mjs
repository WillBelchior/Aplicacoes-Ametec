import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const live=readFileSync(new URL("../attendance-live.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const schema=readFileSync(new URL("../schema-atendimentos.sql",import.meta.url),"utf8");
const portal=readFileSync(new URL("../app.js",import.meta.url),"utf8");
test("Arquivos do módulo persistente são carregados antes do portal",()=>{
  assert.match(html,/attendance-live\.js/);
  assert.match(html,/attendance-live\.css/);
  assert.ok(html.indexOf("attendance-live.js")<html.indexOf("app.js"));
  assert.match(portal,/AttendanceLive\.page\(route,moduleTabs\(route\)\)/);
  assert.match(portal,/AttendanceLive\?\.handleSubmit\(event\)/);
});
test("Paciente, Guias, chegadas e eventos usam tabelas isoladas e RLS",()=>{
  for(const table of ["barquinha_attendance_patients","barquinha_attendance_visits","barquinha_attendance_guides",
    "barquinha_attendance_events","barquinha_attendance_access"])
    assert.ok(schema.includes("public."+table),table);
  assert.match(schema,/alter table public\.barquinha_attendance_patients enable row level security/);
  assert.match(schema,/barquinha_attendance_permitted/);
  assert.match(schema,/private_photo_bucket|barquinha-attendance-photos/);
  assert.match(schema,/create trigger attendance_status_audit after insert or update of status/);
  assert.doesNotMatch(live,/localStorage\s*\.|sessionStorage\s*\./);
});
test("Módulo inicia sem pacientes fictícios e mostra os controles reais",async()=>{
  const rows={
    barquinha_attendance_guides:[],
    barquinha_attendance_patients:[],
    barquinha_attendance_visits:[],
    barquinha_attendance_events:[]
  };
  const calls=[];
  const client={from(table){
    calls.push(table);
    const builder={
      select(){return builder},
      eq(){return builder},
      order(){return builder},
      limit(){return Promise.resolve({data:rows[table],error:null})},
      maybeSingle(){return Promise.resolve({data:{user_id:"user-test",access_role:"recepcao",enabled:true},error:null})},
      then(done,fail){return Promise.resolve({data:rows[table],error:null}).then(done,fail)}
    };
    return builder;
  }};
  const window={PlatformAuth:{user:{id:"user-test"},client}};
  const location={hash:"#/atendimentos/fila"};
  new Function("window","document","location","queueMicrotask",live)(window,{},location,queueMicrotask);
  let callsRender=0;window.AttendanceLive.connect(()=>{callsRender++;},route=>{location.hash="#"+route;});
  assert.match(window.AttendanceLive.page("/atendimentos/fila","<nav>Abas</nav>"),/Carregando/);
  for(let i=0;i<15;i++)await Promise.resolve();
  const queue=window.AttendanceLive.page("/atendimentos/fila","<nav>Abas</nav>");
  assert.match(queue,/Registrar chegada/);
  assert.match(queue,/Nenhum Guia cadastrado/);
  assert.doesNotMatch(queue,/Maria Silva|Carlos Souza/);
  assert.deepEqual(calls.sort(),["barquinha_attendance_access","barquinha_attendance_guides","barquinha_attendance_patients","barquinha_attendance_visits","barquinha_attendance_events"].sort());
  assert.ok(callsRender>0);
  assert.match(window.AttendanceLive.page("/atendimentos/novo-paciente",""),/live-patient-form/);
  assert.match(window.AttendanceLive.page("/atendimentos/nova-chegada",""),/live-arrival-form/);
  window.AttendanceLive.clear();
  assert.match(window.AttendanceLive.page("/atendimentos/fila",""),/Carregando/);
});
