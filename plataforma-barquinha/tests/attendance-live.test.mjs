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
    barquinha_attendance_events:[],
    barquinha_attendance_closures:[]
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
  assert.deepEqual(calls.sort(),["barquinha_attendance_access","barquinha_attendance_guides","barquinha_attendance_guide_workers","barquinha_attendance_patients","barquinha_attendance_visits","barquinha_attendance_events","barquinha_attendance_visit_audit","barquinha_attendance_shifts","barquinha_attendance_closures"].sort());
  assert.ok(callsRender>0);
  assert.match(window.AttendanceLive.page("/atendimentos/novo-paciente",""),/live-patient-form/);
  assert.match(window.AttendanceLive.page("/atendimentos/nova-chegada",""),/live-arrival-form/);
  window.AttendanceLive.clear();
  assert.match(window.AttendanceLive.page("/atendimentos/fila",""),/Carregando/);
});


test("A fila usa toda a largura com até cinco Guias e ativa a rolagem com seis",async()=>{
  async function renderGuides(count){
    const rows={
      barquinha_attendance_guides:Array.from({length:count},(_,i)=>({
        id:"guide-"+i,nome:"Guia de Teste "+i,cor:"#467C9C",ativo:true,created_at:"2026-11-19T13:00:00Z"
      })),
      barquinha_attendance_patients:[],
      barquinha_attendance_visits:[],
      barquinha_attendance_events:[],
    barquinha_attendance_closures:[]
    };
    const client={from(table){
      const builder={
        select(){return builder},eq(){return builder},order(){return builder},
        limit(){return Promise.resolve({data:rows[table],error:null})},
        maybeSingle(){return Promise.resolve({data:{user_id:"test-layout",access_role:"recepcao",enabled:true},error:null})},
        then(resolve,reject){return Promise.resolve({data:rows[table],error:null}).then(resolve,reject)}
      };
      return builder;
    }};
    const w={PlatformAuth:{user:{id:"test-layout"},client}};
    const location={hash:"#/atendimentos/fila",hostname:"plataforma-barquinha-preview.vercel.app"};
    new Function("window","document","location","queueMicrotask",live)(w,{},location,queueMicrotask);
    w.AttendanceLive.connect(()=>{},()=>{});
    w.AttendanceLive.page("/atendimentos/fila","");
    for(let n=0;n<35;n++)await Promise.resolve();
    return w.AttendanceLive.page("/atendimentos/fila","");
  }
  // A Triagem conta como uma coluna; até seis colunas cabem lado a lado.
  for(const count of [1,3,4,5]){
    const output=await renderGuides(count),total=count+1;
    assert.match(output,new RegExp('data-guide-count="'+total+'"'));
    assert.match(output,/queue-triage-column/);
    assert.doesNotMatch(output,/class="queue-board[^"]*is-scroll/);
    assert.equal((output.match(/class="queue-guide-column/g)||[]).length,total);
  }
  const six=await renderGuides(6);
  assert.match(six,/class="queue-board is-scroll" data-guide-count="7"/);
  assert.match(six,/Use a rolagem horizontal/);
  assert.equal((six.match(/class="queue-guide-column/g)||[]).length,7);
  const styles=readFileSync(new URL("../attendance-live.css",import.meta.url),"utf8");
  assert.match(styles,/#main-content \.queue-board\.is-scroll/);
  assert.match(styles,/#main-content:has\(\.queue-board-scroll\) \.metrics/);
  assert.match(styles,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test("Fila não oculta os concluídos e usa fichas P01 e 01 por Guia",async()=>{
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const rows={
    barquinha_attendance_guides:[{id:"guide-one",nome:"Guia Piloto",cor:"#336699",ativo:true}],
    barquinha_attendance_patients:[{id:"patient-one",nome:"Paciente Prioritário",nascimento:"1950-01-01"},
      {id:"patient-two",nome:"Paciente Normal",nascimento:"1990-01-01"}],
    barquinha_attendance_visits:[
      {id:"visit-p",patient_id:"patient-one",guide_id:"guide-one",service_date:today,ordem:30,
        ficha_tipo:"P",ficha_numero:1,prioridade:"Idoso",modalidade:"presencial",status:"Concluído"},
      {id:"visit-n",patient_id:"patient-two",guide_id:"guide-one",service_date:today,ordem:31,
        ficha_tipo:"N",ficha_numero:1,prioridade:"Normal",modalidade:"presencial",status:"Aguardando"}],
    barquinha_attendance_events:[],barquinha_attendance_closures:[]
  };
  const client={from(table){const b={select(){return b},eq(){return b},order(){return b},
    limit(){return Promise.resolve({data:rows[table],error:null})},
    maybeSingle(){return Promise.resolve({data:{access_role:"recepcao",enabled:true,user_id:"test"},error:null})},
    then(ok,fail){return Promise.resolve({data:rows[table],error:null}).then(ok,fail)}};return b;}};
  const w={PlatformAuth:{user:{id:"test"},client}};
  const loc={hash:"#/atendimentos/fila"};
  new Function("window","document","location","queueMicrotask",live)(w,{},loc,queueMicrotask);
  w.AttendanceLive.connect(()=>{});
  w.AttendanceLive.page("/atendimentos/fila","");
  for(let i=0;i<35;i++)await Promise.resolve();
  const queue=w.AttendanceLive.page("/atendimentos/fila","");
  assert.match(queue,/Paciente Prioritário/);
  assert.match(queue,/Paciente Normal/);
  assert.match(queue,/P01/);
  assert.match(queue,/data-live-status="visit-p"/);
  assert.match(queue,/data-live-status="visit-n"/);
  assert.match(queue,/PRIORITÁRIO/);
  assert.match(queue,/Total do Guia/);
  assert.match(queue,/Total de atendimentos hoje/);
  const report=w.AttendanceLive.page("/atendimentos/expediente","");
  assert.match(report,/Iniciar Atendimentos/);
  assert.doesNotMatch(report,/attendance-print-report/);
});

test("Cadastro remoto dispensa nascimento, mas exige endereço; edição e webcam constam na interface",()=>{
  assert.match(live,/mode==="distancia"&&endereco\.length<5/);
  assert.match(live,/mode!=="distancia"&&!nascimento/);
  assert.match(live,/getUserMedia/);
  assert.match(live,/data-live-camera-capture/);
  assert.match(live,/data-edit-id/);
  assert.match(live,/live-arrival-patient-search/);
  assert.match(live,/agePriority\(patient\.nascimento\)/);
  assert.match(live,/canChangeStatus\(\)/);
  assert.match(live,/attendance-print-report/);
  const migration=readFileSync(new URL("../migrations/20261119_fichas_e_cadastros.sql",import.meta.url),"utf8");
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/attendance_ticket_unique_per_guide_day/);
  assert.match(migration,/attendance_patient_remote_address_check/);
  assert.match(migration,/attendance_closed_status_guard/);
});
