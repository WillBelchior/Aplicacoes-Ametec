import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const js=readFileSync(new URL("../attendance-live.js",import.meta.url),"utf8");
const sql=readFileSync(new URL("../migrations/20261119_fila_guias_pacientes_relatorios.sql",import.meta.url),"utf8");
const css=readFileSync(new URL("../attendance-live.css",import.meta.url),"utf8");

test("migração preserva histórico e garante fichas por dia, Guia e prioridade",()=>{
  assert.match(sql,/row_number\(\) over \(PARTITION BY service_date,guide_id,\(prioridade<>'Normal'\)/);
  assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS attendance_ticket_guide_day_unique/);
  assert.match(sql,/ON CONFLICT\(service_date,guide_id,prioritaria\)/);
  assert.match(sql,/chamada_prioritaria=\(new.prioridade<>'Normal'\)/);
  assert.match(sql,/interval '60 years'/);
  assert.match(sql,/attendance_sessions_close/);
  assert.match(sql,/ALTER COLUMN nascimento DROP NOT NULL/);
  assert.match(sql,/CREATE POLICY attendance_patients_edit/);
  assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
});
test("o cadastro e a fila têm controles de edição, idade, pesquisa e webcam",()=>{
  for(const code of ['preferred_guide_id','modalidade_cadastro','endereco',
    'live-patient-age','live-arrival-search','data-camera-capture','editar-paciente',
    'data-live-finish','chamada_numero','chamada_prioritaria','is-priority',
    'queue-select-wrap','Desistente'])
    assert.ok(js.includes(code),code);
  assert.match(css,/\.queue-priority-label\{color:#b52020/);
  assert.match(css,/#attendance-print-report \.subtotal/);
  assert.match(css,/#attendance-print-report \.signature-line/);
});
test("fila preserva situações finalizadas e mostra P01 e 01 com selects",async()=>{
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Fortaleza",
    year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const patients=[
    {id:"p1",nome:"Paciente Prioritário",nascimento:"1950-01-01",modalidade_cadastro:"presencial",preferred_guide_id:"g1",foto_path:null},
    {id:"p2",nome:"Paciente Normal",nascimento:"1990-01-01",modalidade_cadastro:"presencial",preferred_guide_id:"g1",foto_path:null},
    {id:"p3",nome:"Pessoa à Distância",nascimento:null,modalidade_cadastro:"distancia",endereco:"Rua da Serra 123",foto_path:null}
  ];
  const rows={
    barquinha_attendance_guides:[{id:"g1",nome:"Guia A",ativo:true,cor:"#2458E8"}],
    barquinha_attendance_patients:patients,
    barquinha_attendance_visits:[
      {id:"v1",patient_id:"p1",guide_id:"g1",service_date:today,status:"Concluído",
       prioridade:"Idoso",chamada_prioritaria:true,chamada_numero:1,ordem:31,modalidade:"presencial"},
      {id:"v2",patient_id:"p2",guide_id:"g1",service_date:today,status:"Aguardando",
       prioridade:"Normal",chamada_prioritaria:false,chamada_numero:1,ordem:32,modalidade:"presencial"}
    ],
    barquinha_attendance_events:[],
    barquinha_attendance_sessions:[]
  };
  const client={from(table){
    const b={select(){return b},eq(){return b},order(){return b},
      limit(){return Promise.resolve({data:rows[table],error:null})},
      maybeSingle(){return Promise.resolve({data:{user_id:"u",access_role:"recepcao",enabled:true},error:null})},
      then(resolve,reject){return Promise.resolve({data:rows[table],error:null}).then(resolve,reject)}};
    return b;
  }};
  const w={PlatformAuth:{user:{id:"u"},client}};
  const loc={hash:"#/atendimentos/fila",hostname:"plataforma-barquinha-preview.vercel.app"};
  new Function("window","document","location","queueMicrotask",js)(w,{},loc,queueMicrotask);
  w.AttendanceLive.connect(()=>{},()=>{});
  w.AttendanceLive.page("/atendimentos/fila","");
  for(let i=0;i<40;i++)await Promise.resolve();
  const html=w.AttendanceLive.page("/atendimentos/fila","");
  assert.match(html,/Paciente Prioritário/);
  assert.match(html,/Paciente Normal/);
  assert.match(html,/>P01</);
  assert.match(html,/>01</);
  assert.match(html,/PRIORIDADE/);
  assert.match(html,/data-live-status="v1"/);
  assert.match(html,/data-live-status="v2"/);
  assert.match(html,/Desistente/);
  assert.match(html,/2 no dia/);
  assert.match(w.AttendanceLive.page("/atendimentos/editar-paciente/p3",""),/Salvar alterações/);
  assert.match(w.AttendanceLive.page("/atendimentos/editar-paciente/p3",""),/Rua da Serra 123/);
  assert.match(w.AttendanceLive.page("/atendimentos/novo-paciente",""),/Abrir câmera/);
  assert.match(w.AttendanceLive.page("/atendimentos/nova-chegada",""),/live-arrival-search/);
  assert.match(w.AttendanceLive.page("/atendimentos/expediente",""),/Finalizar Atendimentos/);
});
