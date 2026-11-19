import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const live=readFileSync(new URL("../attendance-live.js",import.meta.url),"utf8");
const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../attendance-live.css",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/20261119_triagem_sem_guia.sql",import.meta.url),"utf8");
const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

function fakeClient(rows,routeCalls){
  return {
    from(table){
      const request={
        select(){return request},
        eq(){return request},
        order(){return request},
        limit(){return Promise.resolve({data:rows[table]||[],error:null})},
        maybeSingle(){return Promise.resolve({data:{user_id:"worker",access_role:"recepcao",enabled:true},error:null})},
        then(resolve,reject){return Promise.resolve({data:rows[table]||[],error:null}).then(resolve,reject)}
      };
      return request;
    },
    rpc(name,args){
      routeCalls.push({name,args});
      return {single:async()=>{
        const v=rows.barquinha_attendance_visits.find(v=>v.id===args.p_visit_id);
        if(!v||v.guide_id)return {data:null,error:{message:"Atendimento já encaminhado"}};
        const g=rows.barquinha_attendance_guides.find(g=>g.id===args.p_guide_id&&g.ativo);
        if(!g)return {data:null,error:{message:"Guia não disponível"}};
        const kind=v.prioridade==="Normal"?"N":"P";
        const numero=1+(Math.max(0,...rows.barquinha_attendance_visits.filter(x=>x.guide_id===g.id&&x.ficha_tipo===kind).map(x=>x.ficha_numero||0)));
        Object.assign(v,{guide_id:g.id,ficha_tipo:kind,ficha_numero:numero,guia_nome_registro:g.nome});
        return {data:{...v},error:null};
      }};
    }
  };
}
async function setup(){
  const rows={
    barquinha_attendance_guides:[{id:"g1",nome:"Guia 1",cor:"#467C9C",ativo:true}],
    barquinha_attendance_patients:[{id:"p1",nome:"Primeira Chegada",nascimento:"1950-01-01",guide_id:null}],
    barquinha_attendance_visits:[{id:"v1",patient_id:"p1",guide_id:null,service_date:today,
      ordem:44,ficha_tipo:null,ficha_numero:null,guia_nome_registro:null,modalidade:"presencial",
      prioridade:"Idoso",status:"Aguardando"}],
    barquinha_attendance_events:[],barquinha_attendance_closures:[]
  };
  const routeCalls=[],client=fakeClient(rows,routeCalls);
  const window={PlatformAuth:{user:{id:"worker"},client}};
  const location={hash:"#/atendimentos/fila",hostname:"test.local"};
  const doc={getElementById(){return null}};
  new Function("window","document","location","queueMicrotask",live)(window,doc,location,queueMicrotask);
  window.AttendanceLive.connect(()=>{});
  window.AttendanceLive.page("/atendimentos/fila","");
  for(let i=0;i<40;i++)await Promise.resolve();
  return {window,rows,routeCalls};
}
test("Triagem é coluna separada, sem ficha de Guia antes do encaminhamento",async()=>{
  const {window}=await setup();
  const html=window.AttendanceLive.page("/atendimentos/fila","");
  assert.match(html,/queue-triage-column/);
  assert.match(html,/Primeira Chegada/);
  assert.match(html,/Chegada 44/);
  assert.match(html,/data-live-route-triage="v1"/);
  assert.match(html,/data-guide-count="2"/);
  assert.doesNotMatch(html,/data-live-status="v1"/);
  assert.match(window.AttendanceLive.page("/atendimentos/paciente/p1/v1",""),/Triagem — aguardando Guia/);
  const history=window.AttendanceLive.page("/atendimentos/historico","");
  assert.match(history,/Triagem — sem Guia/);
});
test("Encaminhamento atribui ficha P01 atomicamente e associa Guia ao paciente",async()=>{
  const {window,rows,routeCalls}=await setup();
  const select={
    dataset:{liveRouteTriage:"v1"},value:"g1",disabled:false,isConnected:false,
    matches(q){return q==="[data-live-route-triage]";}
  };
  assert.equal(window.AttendanceLive.handleChange({target:select}),true);
  for(let i=0;i<50;i++)await Promise.resolve();
  assert.equal(routeCalls.length,1);
  assert.equal(routeCalls[0].name,"barquinha_attendance_route_triage");
  assert.equal(rows.barquinha_attendance_visits[0].ficha_numero,1);
  assert.equal(rows.barquinha_attendance_visits[0].ficha_tipo,"P");
  assert.equal(rows.barquinha_attendance_visits[0].guia_nome_registro,"Guia 1");
  const html=window.AttendanceLive.page("/atendimentos/fila","");
  assert.match(html,/P01/);
  assert.match(html,/Guia 1/);
  assert.match(html,/Nenhum paciente na Triagem/);
});
test("Migração garante autorização, primeira chegada e emissão exclusiva da ficha",()=>{
  assert.match(migration,/alter column guide_id drop not null/);
  assert.match(migration,/barquinha_triagem_consistent_fields/);
  assert.match(migration,/Triagem somente para a primeira chegada/);
  assert.match(migration,/private\.barquinha_attendance_permitted\(array\['administrador','recepcao'\]\)/);
  assert.match(migration,/pg_advisory_xact_lock/);
  assert.match(migration,/service_date <>/);
  assert.match(migration,/barquinha_attendance_closures/);
  assert.match(migration,/new\.modalidade <> 'presencial'/);
  assert.match(migration,/17:00/);
  assert.match(migration,/revoke all on function public\.barquinha_attendance_route_triage\(uuid,uuid\) from public,anon/);
  assert.match(live,/\.rpc\("barquinha_attendance_route_triage"/);
});
test("Todas as telas de Atendimentos usam largura otimizada e navegação suave",()=>{
  assert.match(app,/main\.dataset\.section=route\.startsWith\("\/atendimentos"\)/);
  assert.match(css,/#main-content\[data-section="attendance"\]/);
  assert.match(css,/\.shell:has\(#main-content\[data-section="attendance"\]\)/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(app,/route!==lastRenderedRoute/);
  assert.match(app,/prefers-reduced-motion: reduce/);
  assert.match(app,/duration:240/);
  assert.match(css,/@media\(prefers-reduced-motion: reduce\)/);
});
