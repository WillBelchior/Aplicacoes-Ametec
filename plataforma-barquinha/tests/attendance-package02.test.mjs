import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {TextEncoder,TextDecoder} from "node:util";

const js=readFileSync(new URL("../attendance-live.js",import.meta.url),"utf8");
const excel=readFileSync(new URL("../attendance-xlsx.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const build=readFileSync(new URL("../build.mjs",import.meta.url),"utf8");
const sql=readFileSync(new URL("../migrations/20261122_pacote_02_fluxo_turno_relatorios.sql",import.meta.url),"utf8");
const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

function mockPortal(active){
 const rows={
  barquinha_attendance_guides:[{id:"g1",nome:"Guia Teste",cor:"#467C9C",ativo:true,created_at:"2026-11-22T12:00:00Z"}],
  barquinha_attendance_guide_workers:[{id:"w1",guide_id:"g1",nome:"Auxiliar",funcao:"Recepção",ativo:true}],
  barquinha_attendance_patients:[{id:"p1",nome:"Maria das Dores",cpf:"12345678909",nascimento:"1950-01-01",
    guia_id:"g1",guide_id:"g1",cadastro_modalidade:"presencial",foto_path:"p1/test.jpg"}],
  barquinha_attendance_visits:[{id:"v1",patient_id:"p1",guide_id:"g1",guia_nome_registro:"Guia Teste",
   ficha_tipo:"P",ficha_numero:1,ordem:21,service_date:today,modalidade:"presencial",
   prioridade:"Idoso",status:"Em atendimento",timer_started_at:new Date(Date.now()-120000).toISOString(),
   atendimento_segundos:30,atendimento_iniciado_em:new Date(Date.now()-120000).toISOString()}],
  barquinha_attendance_events:[],barquinha_attendance_visit_audit:[],
  barquinha_attendance_shifts:active?[{service_date:today,started_at:new Date(Date.now()-180000).toISOString(),finished_at:null}]:[],
  barquinha_attendance_closures:[]
 };
 const client={from(table){
   const chain={
    select(){return chain},eq(){return chain},order(){return chain},
    limit(){return Promise.resolve({data:rows[table]||[],error:null})},
    maybeSingle(){return Promise.resolve({data:{user_id:"worker",access_role:"recepcao",enabled:true},error:null})},
    then(resolve,reject){return Promise.resolve({data:rows[table]||[],error:null}).then(resolve,reject)}
   };return chain;
 }};
 const window={PlatformAuth:{user:{id:"worker"},client},BarquinhaAttendanceXlsx:{download(){}}};
 const document={getElementById(){return null}};
 const location={hash:"#/atendimentos/fila",hostname:"test.local"};
 new Function("window","document","location","queueMicrotask",js)(window,document,location,queueMicrotask);
 window.AttendanceLive.connect(()=>{});
 return {window,rows};
}
async function load(active){
 const x=mockPortal(active);
 x.window.AttendanceLive.page("/atendimentos/fila","");
 for(let n=0;n<70;n++)await Promise.resolve();
 return x;
}
test("Sem início do turno, chegada bloqueada e botão Iniciar visível",async()=>{
 const {window}=await load(false);
 const q=window.AttendanceLive.page("/atendimentos/fila","");
 assert.match(q,/data-live-start-day/);
 assert.match(q,/Registrar chegada"<\/?button>|Registrar chegada<\/button>/);
 assert.match(q,/data-go="\/atendimentos\/nova-chegada" disabled/);
 const arrival=window.AttendanceLive.page("/atendimentos/nova-chegada","");
 assert.match(arrival,/Inicie os atendimentos/);
 assert.match(arrival,/À distância/);
 assert.match(arrival,/Trabalhador da casa/);
});
test("Turno ativo mostra Finalizar e cronômetro por ficha",async()=>{
 const {window}=await load(true);
 const q=window.AttendanceLive.page("/atendimentos/fila","");
 assert.match(q,/data-live-close-day/);
 assert.match(q,/data-live-shift-timer/);
 assert.match(q,/data-live-visit-timer="v1"/);
 assert.match(q,/data-go="\/atendimentos\/nova-chegada">/);
 const edit=window.AttendanceLive.page("/atendimentos/editar-atendimento/v1","");
 assert.match(edit,/live-visit-edit-form/);
 assert.match(edit,/data-live-exclude-visit="v1"/);
 assert.match(edit,/Tempo de atendimento/);
});
test("Último atendimento e remoção de foto aparecem na ficha",async()=>{
 const {window}=await load(true);
 const p=window.AttendanceLive.page("/atendimentos/paciente/p1","");
 assert.match(p,/Último atendimento/);
 const form=window.AttendanceLive.page("/atendimentos/editar-paciente/p1","");
 assert.match(form,/data-live-remove-photo="p1"/);
 assert.match(form,/Último atendimento registrado/);
 assert.match(form,/live-patient-age/);
});
test("Trabalhador auxiliar é vinculado ao Guia sem poluir resumo por contagens",async()=>{
 const {window}=await load(true);
 const page=window.AttendanceLive.page("/atendimentos/guias","");
 assert.match(page,/Auxiliar/);
 assert.match(page,/Vincular trabalhador/);
 assert.match(page,/live-worker-form/);
 assert.match(page,/data-live-worker-edit="w1"/);
 assert.doesNotMatch(page,/\d+ atendimento\(s\) ·/);
});
test("Pesquisa inteligente não mostra CPF nas sugestões e guarda ID separado",async()=>{
 const {window}=await load(true);
 const arrival=window.AttendanceLive.page("/atendimentos/nova-chegada","");
 assert.match(arrival,/id="live-arrival-selected-id"/);
 assert.match(arrival,/id="live-arrival-suggestions"/);
 assert.match(arrival,/Digite nome ou CPF/);
 assert.match(js,/searchArrivalPatients\(query\)/);
 assert.match(js,/data-live-patient-pick/);
 assert.match(js,/cpf\.startsWith\(digits\)/);
 assert.match(js,/esc\(p\.nome\)/);
});
test("Histórico contém duração, apresentação da Fila Geral e opção Excel",async()=>{
 const {window}=await load(true);
 const page=window.AttendanceLive.page("/atendimentos/historico","");
 assert.match(page,/Exportar Excel \(\.xlsx\)/);
 assert.match(page,/attendance-history-card-row/);
 assert.match(page,/attendance-history-status/);
 assert.match(page,/attendance-history-ticket is-priority/);
 assert.match(page,/Tempo/);
 assert.match(page,/Mostrar registros excluídos/);
 assert.match(html,/attendance-xlsx.js/);
 assert.match(build,/attendance-xlsx.js/);
});
test("Migração futura preserva auditoria, autorização após 17h e remove requisito remoto",()=>{
 assert.match(sql,/barquinha_attendance_shifts/);
 assert.match(sql,/barquinha_attendance_start_shift/);
 assert.match(sql,/barquinha_attendance_finish_shift/);
 assert.match(sql,/barquinha_attendance_edit_visit/);
 assert.match(sql,/barquinha_attendance_exclude_visit/);
 assert.match(sql,/barquinha_attendance_visit_audit/);
 assert.match(sql,/barquinha_attendance_guide_workers/);
 assert.match(sql,/attendance_track_timer/);
 assert.match(sql,/attendance_photos_delete/);
 assert.match(sql,/17:00/);
 assert.match(sql,/new\.modalidade not in \('presencial','distancia','trabalhador'\)/);
 assert.doesNotMatch(sql,/new\.modalidade <> 'presencial'/);
});
test("Exportador produz ZIP XLSX com worksheet XML seguro",async()=>{
 const window={};
 runInNewContext(excel,{window,TextEncoder,Blob,Uint8Array,Array,Math,URL,setTimeout});
 const blob=window.BarquinhaAttendanceXlsx.create(
   ["Paciente","Tempo","Número"],[["Maria & José","00:02:15",1],["=1+2","00:00:30",2]]);
 assert.equal(blob.type,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
 const data=new Uint8Array(await blob.arrayBuffer()),view=new DataView(data.buffer);
 assert.equal(view.getUint32(0,true),0x04034b50);
 const decode=new TextDecoder();
 const parts=new Map();let i=0;
 while(i+30<data.length&&view.getUint32(i,true)===0x04034b50){
   const size=view.getUint32(i+18,true);
   const nameSize=view.getUint16(i+26,true),extraSize=view.getUint16(i+28,true);
   const begin=i+30,filename=decode.decode(data.slice(begin,begin+nameSize));
   const from=begin+nameSize+extraSize;
   parts.set(filename,decode.decode(data.slice(from,from+size)));
   i=from+size;
 }
 assert.ok(parts.has("[Content_Types].xml"));
 assert.ok(parts.has("xl/workbook.xml"));
 assert.ok(parts.has("xl/worksheets/sheet1.xml"));
 const sheet=parts.get("xl/worksheets/sheet1.xml");
 assert.match(sheet,/Maria &amp; José/);
 assert.match(sheet,/=1\+2/);
 assert.match(sheet,/autoFilter ref="A1:C3"/);
 assert.match(sheet,/<c r="C2"><v>1<\/v><\/c>/);
 assert.ok(data.length>700);
});
