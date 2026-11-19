import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const live=readFileSync(new URL("../attendance-live.js",import.meta.url),"utf8");
const portal=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/20261119_historico_e_edicao_guias.sql",import.meta.url),"utf8");
const today=new Intl.DateTimeFormat("sv-SE",{
  timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"
}).format(new Date());
const previous="2026-10-01";
async function createApp(){
  const rows={
    barquinha_attendance_guides:[
      {id:"g1",nome:"Guia Atual",cor:"#224466",ativo:true,created_at:"2026-10-01"},
      {id:"g2",nome:"Guia Dois",cor:"#447799",ativo:true,created_at:"2026-10-01"}
    ],
    barquinha_attendance_patients:[
      {id:"p1",nome:"Eloísa do Vale",nascimento:"1950-02-04",guide_id:"g1"},
      {id:"p2",nome:"José Ribeiro",nascimento:"1990-03-04",guide_id:"g2"}
    ],
    barquinha_attendance_visits:[
      {id:"v1",patient_id:"p1",guide_id:"g1",guia_nome_registro:"Guia Antigo",service_date:previous,
        ordem:1,ficha_tipo:"N",ficha_numero:1,status:"Concluído",prioridade:"Normal",modalidade:"presencial"},
      {id:"v2",patient_id:"p1",guide_id:"g1",guia_nome_registro:"Guia Atual",service_date:today,
        ordem:9,ficha_tipo:"P",ficha_numero:1,status:"Chamado",prioridade:"Idoso",modalidade:"presencial"},
      {id:"v3",patient_id:"p2",guide_id:"g2",guia_nome_registro:"Guia Dois",service_date:today,
        ordem:10,ficha_tipo:"N",ficha_numero:1,status:"Aguardando",prioridade:"Normal",modalidade:"presencial"}
    ],
    barquinha_attendance_events:[],
    barquinha_attendance_closures:[{service_date:previous,closed_at:"2026-10-01T22:00:00Z"}]
  };
  const client={from(table){
    let action="select",mutation=null,id=null;
    const b={
      select(){return b},
      eq(field,value){if(field==="id")id=value;return b},
      order(){return b},
      limit(){return Promise.resolve({data:rows[table]||[],error:null})},
      maybeSingle(){return Promise.resolve({data:{user_id:"worker",access_role:"recepcao",enabled:true},error:null})},
      update(data){action="update";mutation=data;return b},
      single(){
        if(action==="update"){
          const target=(rows[table]||[]).find(v=>v.id===id);
          if(!target)return Promise.resolve({data:null,error:{message:"Not found"}});
          Object.assign(target,mutation);
          return Promise.resolve({data:{...target},error:null});
        }
        return Promise.resolve({data:(rows[table]||[])[0],error:null});
      },
      then(resolve,reject){return Promise.resolve({data:rows[table]||[],error:null}).then(resolve,reject)}
    };
    return b;
  }};
  const window={PlatformAuth:{user:{id:"worker"},client},print(){}};
  const document={getElementById(){return null}};
  const location={hostname:"example.test",hash:"#/atendimentos/fila"};
  const MockFormData=class{constructor(form){this.form=form}get(k){return Object.prototype.hasOwnProperty.call(this.form.values,k)?this.form.values[k]:null}};
  new Function("window","document","location","queueMicrotask","FormData",live)(
    window,document,location,queueMicrotask,MockFormData
  );
  let changes=0;
  window.AttendanceLive.connect(()=>{changes++},route=>{location.hash="#"+route});
  window.AttendanceLive.page("/atendimentos/fila","");
  for(let i=0;i<55;i++)await Promise.resolve();
  return {rows,window,document,location,get changes(){return changes}};
}

function clickAttr(selector,dataset){
  return {
    preventDefault(){},
    target:{closest(q){return q===selector?{dataset}:null}}
  };
}

test("A fila permite pesquisar pacientes pelo nome, sem acentos e sem perder os demais registros",async()=>{
  const {window}=await createApp();
  const before=window.AttendanceLive.page("/atendimentos/fila","");
  assert.match(before,/Eloísa do Vale/);
  assert.match(before,/José Ribeiro/);
  assert.match(before,/live-queue-search/);
  window.AttendanceLive.handleInput({target:{id:"live-queue-search",value:"ELOISA",selectionStart:6}});
  const filtered=window.AttendanceLive.page("/atendimentos/fila","");
  assert.match(filtered,/Eloísa do Vale/);
  assert.doesNotMatch(filtered,/José Ribeiro/);
  assert.match(filtered,/1 atendimento\(s\) encontrado\(s\)/);
  window.AttendanceLive.handleInput({target:{id:"live-queue-search",value:"sem resultado",selectionStart:12}});
  assert.match(window.AttendanceLive.page("/atendimentos/fila",""),/Nenhum paciente encontrado na fila/);
  window.AttendanceLive.handleInput({target:{id:"live-queue-search",value:"",selectionStart:0}});
  assert.match(window.AttendanceLive.page("/atendimentos/fila",""),/José Ribeiro/);
});

test("Os Guias podem ser editados sem alterar o nome registrado no histórico",async()=>{
  const {window,rows}=await createApp();
  assert.match(window.AttendanceLive.page("/atendimentos/guias",""),/data-live-guide-edit="g1"/);
  window.AttendanceLive.handleClick(clickAttr("[data-live-guide-edit]",{liveGuideEdit:"g1"}));
  const edit=window.AttendanceLive.page("/atendimentos/guias","");
  assert.match(edit,/data-guide-id="g1"/);
  assert.match(edit,/value="Guia Atual"/);
  const errors={textContent:"",hidden:true};
  const form={id:"live-guide-form",dataset:{guideId:"g1"},values:{
      nome:"Guia Renomeado",cor:"#113355",ativo:null
    },querySelector(q){return q===".attendance-form-error"?errors:{disabled:false,isConnected:false}}
  };
  window.AttendanceLive.handleSubmit({target:form,preventDefault(){}});
  for(let i=0;i<55;i++)await Promise.resolve();
  assert.equal(errors.textContent,"");
  assert.equal(rows.barquinha_attendance_guides[0].nome,"Guia Renomeado");
  assert.equal(rows.barquinha_attendance_guides[0].ativo,false);
  assert.equal(rows.barquinha_attendance_visits[0].guia_nome_registro,"Guia Antigo");
  assert.match(window.AttendanceLive.page("/atendimentos/historico",""),/Guia Antigo/);
  assert.match(migration,/create policy attendance_guides_edit/);
  assert.match(migration,/guia_nome_registro/);
  assert.match(migration,/pg_catalog|security invoker/);
});

test("Histórico pesquisa por dia, Guia e paciente e emite extrato filtrado",async()=>{
  const {window}=await createApp();
  const all=window.AttendanceLive.page("/atendimentos/historico","");
  assert.match(all,/Histórico de Atendimentos/);
  assert.match(all,/live-history-date/);
  assert.match(all,/live-history-guide/);
  assert.match(all,/live-history-patient/);
  assert.match(all,/3 atendimento\(s\) encontrado\(s\)/);
  window.AttendanceLive.handleChange({target:{id:"live-history-date",value:previous}});
  const byDate=window.AttendanceLive.page("/atendimentos/historico","");
  assert.match(byDate,/Guia Antigo/);
  assert.doesNotMatch(byDate.split('class="attendance-history-results"')[1].split("</div>")[0],/Guia Dois/);
  assert.match(byDate,/1 atendimento\(s\) encontrado\(s\)/);
  window.AttendanceLive.handleClick(clickAttr("[data-live-history-generate]",{}));
  const report=window.AttendanceLive.page("/atendimentos/historico","");
  assert.match(report,/Lista oficial de atendimentos/);
  assert.match(report,/TOTAL GERAL DE ATENDIMENTOS/);
  assert.match(report,/Assinatura do\(a\) Recepcionista/);
  window.AttendanceLive.handleChange({target:{id:"live-history-guide",value:"g2"}});
  assert.match(window.AttendanceLive.page("/atendimentos/historico",""),/0 atendimento\(s\) encontrado\(s\)/);
  window.AttendanceLive.handleClick(clickAttr("[data-live-history-clear]",{}));
  window.AttendanceLive.handleInput({target:{id:"live-history-patient",value:"eloisa",selectionStart:6}});
  const byPatient=window.AttendanceLive.page("/atendimentos/historico","");
  assert.match(byPatient,/2 atendimento\(s\) encontrado\(s\)/);
  assert.doesNotMatch(byPatient,/José Ribeiro/);
  window.AttendanceLive.handleClick(clickAttr("[data-live-history-generate]",{}));
  const extract=window.AttendanceLive.page("/atendimentos/historico","");
  assert.match(extract,/Barquinha — Histórico de Atendimentos/);
  assert.match(extract,/TOTAL GERAL DE ATENDIMENTOS/);
  assert.match(extract,/2 atendimento\(s\) encontrado\(s\)/);
  assert.match(portal,/Histórico de Atendimentos/);
  assert.match(portal,/\/atendimentos\/historico/);
});


test("Histórico pagina mais de mil atendimentos sem ocultar registros antigos",async()=>{
  const count=1001;
  const visits=Array.from({length:count},(_,i)=>({
    id:"v"+i,patient_id:"p1",guide_id:"g1",guia_nome_registro:"Guia Exemplo",
    service_date:"2026-10-01",ordem:i+1,ficha_tipo:"N",ficha_numero:i+1,
    status:"Concluído",prioridade:"Normal",modalidade:"presencial",
    created_at:new Date(Date.UTC(2026,9,1,10,0,i)).toISOString()
  }));
  const rows={
    barquinha_attendance_guides:[{id:"g1",nome:"Guia Exemplo",cor:"#224466",ativo:true}],
    barquinha_attendance_patients:[{id:"p1",nome:"Paciente Fictício",nascimento:"1990-01-01"}],
    barquinha_attendance_visits:visits,
    barquinha_attendance_events:[],
    barquinha_attendance_closures:[{service_date:"2026-10-01",closed_at:"2026-10-01T21:00:00Z"}]
  };
  let pageTwo=0;
  const client={from(table){
    const q={
      select(){return q},order(){return q},eq(){return q},
      limit(n){return Promise.resolve({data:(rows[table]||[]).slice(0,n),error:null})},
      range(start,end){
        if(table==="barquinha_attendance_visits")pageTwo++;
        return Promise.resolve({data:(rows[table]||[]).slice(start,end+1),error:null});
      },
      maybeSingle(){return Promise.resolve({data:{access_role:"recepcao",enabled:true,user_id:"user"},error:null})},
      then(ok,fail){return Promise.resolve({data:rows[table]||[],error:null}).then(ok,fail)}
    };
    return q;
  }};
  const w={PlatformAuth:{user:{id:"user"},client}};
  new Function("window","document","location","queueMicrotask",live)(
    w,{getElementById(){return null}},{hash:"#/atendimentos/historico",hostname:"test.local"},queueMicrotask
  );
  w.AttendanceLive.connect(()=>{});
  w.AttendanceLive.page("/atendimentos/historico","");
  for(let i=0;i<65;i++)await Promise.resolve();
  const html=w.AttendanceLive.page("/atendimentos/historico","");
  assert.equal(pageTwo,1);
  assert.match(html,/1001 atendimento\(s\) encontrado\(s\)/);
  assert.match(html,/Paciente Fictício/);
});
