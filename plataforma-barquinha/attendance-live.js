"use strict";
/* Atendimentos Barquinha: módulo persistente isolado do Projetos.
   Dados pessoais ficam no Supabase com RLS; sem localStorage nem dados fictícios. */
(() => {
  const STATUSES=["Aguardando","Chamado","Em atendimento","Concluído","Não compareceu","Desistente"];
  const PRIORITIES=["Normal","Idoso","Gestante","Deficiência","Outra"];
  const MODES=[["presencial","Presencial"],["distancia","À distância"],["trabalhador","Trabalhador da casa"]];
  const CLOSED=new Set(["Concluído","Não compareceu","Desistente","Cancelado"]);
  function afterArrivalDeadline(){
    const hour=Number(new Intl.DateTimeFormat("en-GB",{
      timeZone:"America/Fortaleza",hour:"2-digit",hourCycle:"h23"
    }).format(new Date()));
    return hour>=17;
  }
  const PHOTO_BUCKET="barquinha-attendance-photos";
  const state={userId:null,loaded:false,loading:false,error:"",notice:"",access:null,
    guides:[],workers:[],patients:[],visits:[],events:[],audit:[],shifts:[],closures:[],filter:"todos",search:"",queueSearch:"",historyDate:"",historyGuide:"todos",historyPatient:"",historyReportVisible:false,historyIncludeExcluded:false,guideEditingId:null,workerEditingId:null,profileTab:"dados",arrivalSearch:"",arrivalSelectedId:"",arrivalMatches:[],webcamStream:null,webcamBlob:null,editId:null,
    photoUrls:new Map(),photoRequests:new Set(),photoErrors:new Set(),busy:false,currentRoute:null};
  let renderCallback=()=>{},navigateCallback=route=>{location.hash="#"+route;};
  const auth=()=>window.PlatformAuth;
  const client=()=>auth()?.client;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const person=id=>state.patients.find(p=>p.id===id);
  const guide=id=>state.guides.find(g=>g.id===id);
  const currentDay=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const fmtDay=date=>date?new Date(date+"T12:00:00").toLocaleDateString("pt-BR"):"—";
  const fmtTime=date=>date?new Date(date).toLocaleString("pt-BR",{timeZone:"America/Fortaleza",dateStyle:"short",timeStyle:"short"}):"—";
  const pill=status=>'<span class="pill '+(status==="Concluído"?"green":status==="Chamado"?"blue":status==="Cancelado"?"red":"")+'">'+esc(status)+'</span>';
  const alertBox=text=>'<div class="note warn" role="alert">'+esc(text)+'</div>';
  const field=(name,label,type,required,extra)=>'<label>'+esc(label)+(required?" *":"")+
    '<input name="'+name+'" type="'+type+'" '+(required?"required ":"")+(extra||"")+'></label>';
  const nav=(tabs)=>tabs||"";
  const canWrite=()=>["administrador","recepcao"].includes(state.access?.access_role);
  const canChangeStatus=()=>["administrador","recepcao","guia"].includes(state.access?.access_role);
  const isClosed=()=>state.closures.some(c=>c.service_date===currentDay());
  const shiftForDay=(date=currentDay())=>state.shifts.find(s=>s.service_date===date);
  const isShiftStarted=()=>!!shiftForDay()&&!shiftForDay().finished_at&&!isClosed();
  const liveVisits=()=>state.visits.filter(v=>!v.excluded_at);
  const durationSeconds=(v,at=Date.now())=>
    Math.max(0,Number(v.atendimento_segundos||0)+
      (v.timer_started_at?Math.max(0,Math.floor((at-Date.parse(v.timer_started_at))/1000)):0));
  const durationLabel=seconds=>{
    seconds=Math.max(0,Math.floor(seconds||0));
    return String(Math.floor(seconds/3600)).padStart(2,"0")+":"+
      String(Math.floor((seconds%3600)/60)).padStart(2,"0")+":"+
      String(seconds%60).padStart(2,"0");
  };
  const lastAttendanceDate=pId=>liveVisits()
    .filter(v=>v.patient_id===pId)
    .map(v=>v.service_date).sort().at(-1)||null;
  const officialTicket=v=>!v.guide_id?"Triagem":(v.ficha_tipo==="P"?"P":"")+String(v.ficha_numero||v.ordem||0).padStart(2,"0");
  function ageYears(date,at=currentDay()){
    if(!date)return null;
    const birth=String(date).split("-").map(Number),today=String(at).split("-").map(Number);
    if(birth.length!==3||birth.some(x=>!x))return null;
    return today[0]-birth[0]-(today[1]<birth[1]||(today[1]===birth[1]&&today[2]<birth[2])?1:0);
  }
  const agePriority=date=>ageYears(date)!==null&&ageYears(date)>=60;
  function selectGuide(selected="",placeholder="Sem Guia definido"){
    return '<option value="">'+placeholder+'</option>'+state.guides.filter(g=>g.ativo||g.id===selected)
      .map(g=>'<option value="'+esc(g.id)+'"'+(g.id===selected?" selected":"")+'>'+esc(g.nome)+'</option>').join("");
  }
  const priorityOptions=(selected="Normal")=>PRIORITIES.map(p=>'<option value="'+esc(p)+'"'+(p===selected?" selected":"")+'>'+esc(p)+'</option>').join("");

  function connect(render,navigate){renderCallback=render;navigateCallback=navigate;}
  function resetFor(userId){
    state.userId=userId;state.loaded=false;state.loading=false;state.error="";state.access=null;
    stopWebcam();state.guides=[];state.workers=[];state.patients=[];state.visits=[];state.events=[];state.audit=[];state.shifts=[];state.closures=[];state.notice="";state.arrivalSearch="";state.arrivalSelectedId="";state.arrivalMatches=[];state.editId=null;
    state.photoUrls.clear();state.photoRequests.clear();state.photoErrors.clear();state.filter="todos";state.search="";state.queueSearch="";state.historyDate="";state.historyGuide="todos";state.historyPatient="";state.historyReportVisible=false;state.historyIncludeExcluded=false;state.guideEditingId=null;state.workerEditingId=null;
  }
  // Consultas paginadas evitam perder atendimentos antigos por causa do limite
  // de linhas por resposta da API Supabase (geralmente 1.000).
  async function readAllPages(table,fields,orderKey,ascending=true){
    const pageSize=1000,all=[];
    for(let offset=0;offset<100000;offset+=pageSize){
      let q=client().from(table).select(fields).order(orderKey,{ascending});
      if(orderKey!=="id"&&orderKey!=="service_date")q=q.order("id",{ascending:true});
      const response=await (offset===0?q.limit(pageSize):q.range(offset,offset+pageSize-1));
      if(response.error)return response;
      const entries=response.data||[];
      all.push(...entries);
      if(entries.length<pageSize)return {data:all,error:null};
    }
    throw Error("O histórico ultrapassou 100 mil registros. É necessário ampliar a paginação do módulo.");
  }
  async function load(){
    if(state.loading)return;
    const user=auth()?.user;
    if(!user||!client())return;
    const userId=user.id;state.loading=true;state.error="";
    try{
      const {data:permission,error:accessError}=await client().from("barquinha_attendance_access")
        .select("user_id,access_role,enabled").eq("user_id",userId).maybeSingle();
      if(accessError)throw accessError;
      if(auth()?.user?.id!==userId)return;
      state.access=permission?.enabled?permission:null;
      if(!state.access){state.loaded=true;return;}
      const requests=[
        client().from("barquinha_attendance_guides").select("id,nome,cor,ativo,created_at").order("nome"),
        readAllPages("barquinha_attendance_guide_workers","id,guide_id,nome,funcao,ativo,created_at","created_at"),
        readAllPages("barquinha_attendance_patients",
          "id,nome,nascimento,telefone,cpf,encaminhamento,foto_path,created_at,cadastro_modalidade,endereco,guide_id","nome"),
        readAllPages("barquinha_attendance_visits",
          "id,ordem,ficha_tipo,ficha_numero,guia_nome_registro,patient_id,guide_id,service_date,modalidade,prioridade,status,created_at,status_changed_at,atendimento_iniciado_em,atendimento_finalizado_em,timer_started_at,atendimento_segundos,excluded_at,excluded_by,exclusion_reason",
          "created_at",false),
        readAllPages("barquinha_attendance_events",
          "id,visit_id,previous_status,next_status,changed_at","changed_at",false),
        readAllPages("barquinha_attendance_visit_audit",
          "id,visit_id,operation,previous_data,current_data,reason,actor_id,changed_at","changed_at",false),
        readAllPages("barquinha_attendance_shifts",
          "service_date,started_at,started_by,finished_at,finished_by","service_date",false),
        readAllPages("barquinha_attendance_closures",
          "service_date,closed_at,closed_by","service_date",false)
      ];
      const results=await Promise.all(requests);
      for(const result of results)if(result.error)throw result.error;
      if(auth()?.user?.id!==userId)return;
      [state.guides,state.workers,state.patients,state.visits,state.events,state.audit,state.shifts,state.closures]=results.map(r=>r.data||[]);
      state.loaded=true;
    }catch(error){state.error="Falha ao consultar Atendimentos: "+(error.message||error);state.loaded=true;}
    finally{state.loading=false;if(auth()?.user?.id===userId)renderCallback();}
  }
  function refresh(){
    state.loaded=false;state.error="";state.photoErrors.clear();load();
    renderCallback();
  }
  function info(){
    return '<div class="attendance-info">'+(state.notice?'<div class="note" role="status">'+esc(state.notice)+'</div>':"")+
      (state.error?alertBox(state.error)+'<button type="button" class="button ghost" data-live-refresh>Repetir consulta</button>':"")+'</div>';
  }
  function page(route,tabs){
    const user=auth()?.user;
    if(!user)return "";
    if(state.userId!==user.id)resetFor(user.id);
    if(state.currentRoute!==route){
      if(state.currentRoute?.includes("paciente")){stopWebcam();state.webcamBlob=null;}
      if(route==="/atendimentos/nova-chegada"){state.arrivalSearch="";state.arrivalSelectedId="";}
      state.currentRoute=route;
    }
    if(!state.loaded&&!state.loading)queueMicrotask(load);
    if(!state.loaded)return nav(tabs)+'<div class="panel attendance-placeholder">Carregando dados protegidos de Atendimentos…</div>';
    if(state.error)return nav(tabs)+info();
    if(!state.access)return nav(tabs)+alertBox("Este usuário não possui autorização para acessar os dados de Atendimentos. Solicite liberação à administração.");
    let inner;
    if(route==="/atendimentos/novo-paciente")inner=patientForm();
    else if(route.startsWith("/atendimentos/editar-paciente/"))inner=patientForm(person(route.split("/")[3]));
    else if(route==="/atendimentos/nova-chegada")inner=arrivalForm();
    else if(route.startsWith("/atendimentos/editar-atendimento/"))inner=editVisitForm(route.split("/")[3]);
    else if(route.startsWith("/atendimentos/paciente/"))inner=patientDetail(route);
    else if(route==="/atendimentos/pacientes")inner=patientsPage();
    else if(route==="/atendimentos/guias")inner=guidesPage();
    else if(route==="/atendimentos/autorizacoes")inner=deferred("Autorizações","As regras de autorização e exceções serão ativadas após a conclusão do fluxo básico.");
    else if(route==="/atendimentos/expediente"||route==="/atendimentos/historico")inner=shiftPage();
    else inner=queuePage();
    const previewNotice='<div class="note" role="status"><strong>Atendimentos Barquinha.</strong> Fichas por Guia: 01, 02… e prioritárias P01, P02…. Atendimentos à distância não exigem autorização especial; chegadas após 17h continuam sujeitas à autorização do Presidente.</div>';
    return nav(tabs)+previewNotice+info()+inner;
  }
  function deferred(title,detail){return '<section class="intro"><div class="eyebrow">EM PREPARAÇÃO</div><h1>'+esc(title)+'</h1><p>'+esc(detail)+'</p></section>';}
  function title(t,description){return '<section class="intro"><div class="eyebrow">ATENDIMENTOS BARQUINHA</div><h1>'+esc(t)+'</h1><p>'+esc(description)+'</p></section>';}
  function queuePage(){
    const day=currentDay(),today=liveVisits().filter(v=>v.service_date===day);
    const pending=today.filter(v=>!CLOSED.has(v.status));
    const completed=today.filter(v=>CLOSED.has(v.status));
    const needle=normalize(state.queueSearch);
    const matches=needle?today.filter(v=>normalize(person(v.patient_id)?.nome||"").includes(needle)):today;
    // Guias inativos com atendimentos hoje continuam visíveis.
    const available=state.guides.filter(g=>g.ativo||today.some(v=>v.guide_id===g.id));
    const selected=available.filter(g=>(state.filter==="todos"||g.id===state.filter)&&
      (!needle||matches.some(v=>v.guide_id===g.id)));
    const triageVisits=matches.filter(v=>!v.guide_id).sort((a,b)=>a.ordem-b.ordem);
    const showTriage=(state.filter==="todos"||state.filter==="triagem")&&
      (!needle||triageVisits.length>0);
    const filter='<option value="todos">Todos os Guias e Triagem</option>'+
      '<option value="triagem"'+(state.filter==="triagem"?' selected':'')+'>Triagem — sem Guia</option>'+available.map(g=>
      '<option value="'+esc(g.id)+'"'+(g.id===state.filter?' selected':'')+'>'+esc(g.nome)+'</option>').join("");
    const locked=isClosed()||!isShiftStarted();
    const triageBody=triageVisits.map(v=>{
      const p=person(v.patient_id);if(!p)return "";
      const priority=v.prioridade!=="Normal";
      const guideOptions=state.guides.filter(g=>g.ativo).map(g=>
        '<option value="'+esc(g.id)+'">'+esc(g.nome)+'</option>').join("");
      return '<div class="queue-card queue-triage-card'+(priority?' queue-card-priority':'')+'">'+
        '<button type="button" class="queue-card-open" data-go="/atendimentos/paciente/'+esc(p.id)+'/'+esc(v.id)+
        '"><span class="queue-inner"><strong class="ticket triage-ticket">Chegada '+v.ordem+
        '</strong><span class="queue-details"><strong>'+esc(p.nome)+'</strong><small>'+
        esc(v.prioridade)+' · Aguardando Guia</small></span></span></button>'+
        '<div class="queue-status-line"><span class="queue-priority-flag'+(priority?' is-priority':'')+'">'+
        (priority?'PRIORITÁRIO':'TRIAGEM')+'</span>'+
        '<label class="triage-route-label">Encaminhar para o Guia'+
        '<select class="queue-inline-status" data-live-route-triage="'+esc(v.id)+'"'+
        (!canWrite()||locked?' disabled':'')+'>'+
        '<option value="">Selecionar Guia…</option>'+guideOptions+'</select></label></div></div>';
    }).join("");
    const triageColumn=showTriage?'<section class="queue-guide-column queue-triage-column">'+
      '<div class="queue-guide-header"><div class="queue-guide-info"><span class="guide-dot"></span>'+
      '<h3>Triagem</h3></div><span class="pill amber">'+triageVisits.length+' aguardando Guia</span></div>'+
      '<div class="queue-guide-body">'+(triageBody||'<div class="queue-empty">Nenhum paciente na Triagem.</div>')+
      '</div><div class="queue-guide-total">Em Triagem: <strong>'+triageVisits.length+'</strong></div></section>':"";
    const columns=triageColumn+selected.map(g=>{
      const visits=matches.filter(v=>v.guide_id===g.id).sort((a,b)=>{
        const priority=v=>v.ficha_tipo==="P"?0:1;
        return priority(a)-priority(b)||(a.ficha_numero||a.ordem)-(b.ficha_numero||b.ordem);
      });
      const body=visits.map(v=>{
        const p=person(v.patient_id);if(!p)return "";
        const priority=v.ficha_tipo==="P";
        return '<div class="queue-card'+(priority?' queue-card-priority':'')+(CLOSED.has(v.status)?' queue-card-finished':'')+'">'+
          '<button type="button" class="queue-card-open" data-go="/atendimentos/paciente/'+esc(p.id)+'/'+esc(v.id)+
          '" aria-label="Abrir ficha de '+esc(p.nome)+'"><span class="queue-row"><span class="guide-rail" style="background:'+esc(g.cor)+
          '"></span><span class="queue-inner"><strong class="ticket'+(priority?' priority-ticket':'')+'">'+officialTicket(v)+
          '</strong><span class="queue-details"><strong>'+esc(p.nome)+'</strong><small>'+
          esc(v.prioridade)+' · '+esc(MODES.find(m=>m[0]===v.modalidade)?.[1]||v.modalidade)+
          '</small></span><span class="chevron" aria-hidden="true">›</span></span></span></button>'+
          '<div class="queue-status-line"><span class="queue-priority-flag'+(priority?' is-priority':'')+'">'+
          (priority?'PRIORITÁRIO':'NORMAL')+'</span>'+
          '<select class="queue-inline-status" data-live-status="'+esc(v.id)+'" aria-label="Situação de '+esc(p.nome)+'"'+
          (!canChangeStatus()||locked?' disabled':'')+'>'+
          STATUSES.map(st=>'<option value="'+st+'"'+(v.status===st?' selected':'')+'>'+st+'</option>').join('')+
          (v.status==="Cancelado"?'<option value="Cancelado" selected>Cancelado (histórico)</option>':'')+
          '</select><span class="attendance-live-duration" data-live-visit-timer="'+esc(v.id)+'">'+
          durationLabel(durationSeconds(v))+'</span>'+
          (canWrite()?'<button type="button" class="attendance-visit-edit-inline" data-go="/atendimentos/editar-atendimento/'+
            esc(v.id)+'"'+(locked?' disabled':'')+'>Editar</button>':'')+
          '</div></div>';
      }).join("");
      return '<section class="queue-guide-column"><div class="queue-guide-header" style="border-top-color:'+esc(g.cor)+
        '"><div class="queue-guide-info"><span class="guide-dot" style="background:'+esc(g.cor)+'"></span><h3 title="Guia '+esc(g.nome)+'">Guia '+esc(g.nome)+'</h3></div>'+
        '<span class="pill blue">'+visits.length+' registrado(s)</span></div><div class="queue-guide-body">'+
        (body||'<div class="queue-empty">Nenhum atendimento registrado hoje.</div>')+'</div>'+
        '<div class="queue-guide-total">Total do Guia: <strong>'+visits.length+'</strong></div></section>';
    }).join("");
    const visibleCount=selected.length+(showTriage?1:0);
    const session=shiftForDay(day);
    const startStop=canWrite()?isClosed()?'<span class="pill green">Atendimentos encerrados</span>':
      isShiftStarted()?'<button class="button danger" type="button" data-live-close-day>■ Finalizar Atendimentos</button>':
      '<button class="button" type="button" data-live-start-day>▶ Iniciar Atendimentos</button>':"";
    const sessionTime=session?'<span class="attendance-live-shift-timer" data-live-shift-timer="'+
      esc(session.started_at)+'" data-finished="'+esc(session.finished_at||"")+'">'+
      durationLabel(Math.floor(((session.finished_at?Date.parse(session.finished_at):Date.now())-
        Date.parse(session.started_at))/1000))+'</span>':'<span class="attendance-live-shift-timer">00:00:00</span>';
    const buttons=canWrite()?'<button class="button" type="button" data-go="/atendimentos/nova-chegada"'+
      (locked?' disabled':'')+'>＋ Registrar chegada</button>'+
      '<button class="button secondary" type="button" data-go="/atendimentos/novo-paciente">＋ Cadastrar paciente</button>':"";
    return title("Fila Geral — Atendimento do Dia","Fichas por Guia de "+fmtDay(day)+
      " · Prioritárias P01, P02… e normais 01, 02…, em listas independentes.")+
      (isClosed()?'<div class="note">Expediente encerrado. O relatório está disponível em Histórico de Atendimentos.</div>':
      !isShiftStarted()?'<div class="note warn">A recepção deve iniciar os atendimentos para liberar novas chegadas.</div>':"")+
      '<div class="metrics"><div class="metric"><strong>'+pending.length+'</strong><span>Em andamento</span></div>'+
      '<div class="metric"><strong>'+completed.length+'</strong><span>Finalizados hoje</span></div>'+
      '<div class="metric"><strong>'+today.length+'</strong><span>Total de atendimentos hoje</span></div></div>'+
      '<div class="attendance-shift-main-controls">'+startStop+
        '<div class="attendance-main-clock">Tempo de expediente: <strong>'+sessionTime+'</strong></div></div>'+
      '<div class="filters"><div class="queue-actions"><h3>Fila Geral por Guia e Triagem</h3>'+buttons+
      '<button type="button" class="button ghost" data-live-refresh>↻ Atualizar</button></div>'+
      '<label>Visualizar <select id="live-guide-filter">'+filter+'</select></label>'+
      '<label class="attendance-queue-search">Pesquisar paciente na fila'+
      '<input id="live-queue-search" type="search" value="'+esc(state.queueSearch)+
      '" placeholder="Digite o nome do paciente" autocomplete="off" aria-label="Pesquisar paciente nos atendimentos de hoje">'+
      '</label></div>'+
      (needle?'<p class="queue-search-feedback" role="status">'+
      matches.filter(v=>state.filter==="todos"||state.filter==="triagem"&&!v.guide_id||v.guide_id===state.filter).length+
      ' atendimento(s) encontrado(s) para "'+esc(state.queueSearch)+'".</p>':'')+
      (!state.guides.length?alertBox("Nenhum Guia cadastrado. Abra a aba Guias para começar."):"")+
      (needle&&!visibleCount?'<div class="note">Nenhum paciente encontrado na fila de hoje com esse nome.</div>':"")+
      '<p class="queue-hint">'+(visibleCount>=7?"Use a rolagem horizontal para ver as demais colunas.":"Até seis colunas são exibidas juntas, incluindo a Triagem.")+
      ' Pacientes continuam visíveis independentemente do status; saem somente da fila diária quando muda a data.</p>'+
      '<div class="queue-board-scroll" role="region" tabindex="0" aria-label="Filas de atendimentos por Guia">'+
      '<div class="queue-board'+(visibleCount===1?" single":"")+(visibleCount>=7?" is-scroll":"")+
      '" data-guide-count="'+visibleCount+'" style="--guide-count:'+Math.max(visibleCount,1)+'">'+columns+'</div></div>';
  }
  function patientForm(patient=null){
    if(!canWrite())return alertBox("Sua função não permite cadastrar ou editar pacientes.");
    const p=patient||{},edit=!!patient;
    const optionValue=(name,value)=>' value="'+esc(value||"")+'"';
    return '<button class="breadcrumb" type="button" data-go="'+(edit?'/atendimentos/paciente/'+esc(p.id):'/atendimentos/pacientes')+
      '">← Voltar</button>'+
      title(edit?"Editar paciente":"Cadastrar paciente","Guia sugerido nas próximas chegadas. Cadastro à distância permite nome e endereço sem exigir CPF ou nascimento.")+
      '<form id="live-patient-form" data-edit-id="'+esc(p.id||"")+'" class="panel attendance-form">'+
      '<div class="patient-fields">'+
      '<label>Modalidade de cadastro *<select name="cadastro_modalidade" id="live-patient-mode">'+
      MODES.map(m=>'<option value="'+m[0]+'"'+((p.cadastro_modalidade||"presencial")===m[0]?' selected':'')+'>'+m[1]+'</option>').join("")+'</select></label>'+
      '<label>Nome completo *<input name="nome" type="text" required maxlength="160" autocomplete="name"'+optionValue("nome",p.nome)+'></label>'+
      '<label>Data de nascimento <input name="nascimento" id="live-patient-birth" type="date" max="'+currentDay()+'"'+
      (p.cadastro_modalidade!=="distancia"?' required':'')+optionValue("nascimento",p.nascimento)+'><small>Para pacientes à distância, pode ficar em branco.</small></label>'+
      '<label>Idade calculada automaticamente <output id="live-patient-age" aria-live="polite">'+
      (ageYears(p.nascimento)===null?"Não informada":ageYears(p.nascimento)+" anos"+(agePriority(p.nascimento)?" · Prioridade: IDOSO":""))+
      '</output></label>'+
      (edit?'<div class="attendance-patient-last-date"><span>Último atendimento registrado</span>'+
        '<strong>'+fmtDay(lastAttendanceDate(p.id))+'</strong></div>':"")+
      '<label>Telefone<input name="telefone" type="tel" maxlength="40"'+optionValue("telefone",p.telefone)+'></label>'+
      '<label>CPF<input name="cpf" type="text" maxlength="14" inputmode="numeric" autocomplete="off"'+optionValue("cpf",p.cpf)+'></label>'+
      '<label>Guia <select name="guide_id">'+selectGuide(p.guide_id||"","Selecione o Guia")+'</select></label>'+
      '<label class="patient-address-field">Endereço do paciente'+
      '<textarea name="endereco" id="live-patient-address" maxlength="900" rows="3"'+
      (p.cadastro_modalidade==="distancia"?' required':'')+' placeholder="Rua, número, bairro, cidade, referência…">'+esc(p.endereco||"")+'</textarea>'+
      '<small>Obrigatório para cadastro à distância.</small></label>'+
      '<label>Fotografia<input type="file" name="foto" accept="image/jpeg,image/png,image/webp" capture="environment">'+
      '<small>JPG/PNG/WebP, compactada para armazenamento privado.</small>'+
      (edit&&p.foto_path?'<button type="button" class="button danger attendance-remove-photo" data-live-remove-photo="'+
        esc(p.id)+'">Remover fotografia atual</button>':'')+'</label>'+
      '<div class="webcam-controls"><button type="button" class="button ghost" data-live-camera-start>📷 Abrir webcam</button>'+
      '<button type="button" class="button ghost" data-live-camera-capture hidden>Capturar foto</button>'+
      '<button type="button" class="button ghost" data-live-camera-stop hidden>Fechar câmera</button>'+
      '<video id="live-webcam" autoplay muted playsinline hidden aria-label="Visualização da webcam"></video>'+
      '<div id="live-camera-preview" aria-live="polite"></div></div></div>'+
      '<div class="attendance-form-error" role="alert" hidden></div><div class="patient-form-actions">'+
      '<button type="button" class="button ghost" data-go="'+(edit?'/atendimentos/paciente/'+esc(p.id):'/atendimentos/pacientes')+'">Cancelar</button>'+
      '<button type="submit" class="button">'+(edit?"Salvar alterações":"Salvar paciente")+'</button></div></form>';
  }
  const searchArrivalPatients=query=>{
    const normalized=normalize(query),digits=cpfDigits(query);
    if(!normalized&&!digits)return [];
    return state.patients
      .map(p=>{
        const name=normalize(p.nome),cpf=cpfDigits(p.cpf);
        const score=name===normalized?0:name.startsWith(normalized)?1:
          digits.length>=3&&cpf.startsWith(digits)?2:
          name.includes(normalized)?3:
          digits.length>=3&&cpf.includes(digits)?4:99;
        return {p,score};
      }).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||
        a.p.nome.localeCompare(b.p.nome,"pt-BR"))
      .slice(0,12).map(x=>x.p);
  };
  const arrivalSuggestItem=p=>'<button type="button" role="option" class="attendance-arrival-option" '+
    'data-live-patient-pick="'+esc(p.id)+'">'+esc(p.nome)+'</button>';
  function arrivalForm(){
    if(!canWrite())return alertBox("Sua função não permite registrar chegadas.");
    const options=state.arrivalSearch?searchArrivalPatients(state.arrivalSearch):[];
    const guides=state.guides.filter(g=>g.ativo).map(g=>
      '<option value="'+esc(g.id)+'">'+esc(g.nome)+'</option>').join("");
    const locked=!isShiftStarted()||isClosed();
    return '<button class="breadcrumb" type="button" data-go="/atendimentos/fila">← Voltar à fila</button>'+
      title("Registrar chegada","Pesquise pelo nome ou CPF. As sugestões mostram somente o nome; o Guia e a prioridade são sugeridos ao selecionar.")+
      (!isShiftStarted()?alertBox("Inicie os atendimentos na Fila Geral antes de registrar chegadas."):'')+
      (isClosed()?alertBox("O expediente de hoje foi encerrado. Novas chegadas estão bloqueadas."):'')+
      (!state.patients.length?alertBox("Cadastre ao menos um paciente antes de registrar uma chegada."):"")+
      '<form id="live-arrival-form" class="panel attendance-form"><div class="patient-fields">'+
      '<label class="attendance-arrival-search-label">Paciente *'+
      '<input type="search" name="patient_name" id="live-arrival-patient-search"'+
      ' value="'+esc(state.arrivalSelectedId?person(state.arrivalSelectedId)?.nome||"":state.arrivalSearch)+'"'+
      ' placeholder="Digite nome ou CPF…" autocomplete="off" aria-autocomplete="list"'+
      ' aria-controls="live-arrival-suggestions" aria-expanded="'+(options.length?"true":"false")+'">'+
      '<input type="hidden" name="patient_id" id="live-arrival-selected-id" value="'+esc(state.arrivalSelectedId)+'">'+
      '<div class="attendance-arrival-suggestions" id="live-arrival-suggestions" role="listbox"'+
      (options.length?'':' hidden')+'>'+options.map(arrivalSuggestItem).join("")+'</div>'+
      '<small>Digite parte do nome ou do CPF, depois selecione a sugestão.</small></label>'+
      '<label>Guia / Triagem<select name="guide_id" id="live-arrival-guide">'+
      '<option value="">Triagem — primeiro atendimento sem Guia</option>'+guides+
      '</select><small>É possível alterar o Guia sugerido antes de registrar a chegada.</small></label>'+
      '<label>Modalidade *<select name="modalidade" id="live-arrival-mode">'+
      MODES.map(m=>'<option value="'+m[0]+'">'+m[1]+'</option>').join("")+'</select>'+
      '<small>Presencial, à distância ou trabalhador da casa.</small></label>'+
      '<label>Prioridade *<select name="prioridade" id="live-arrival-priority">'+priorityOptions()+'</select>'+
      '<small id="live-arrival-age-hint">A prioridade Idoso é sugerida a partir de 60 anos completos, mas pode ser alterada.</small></label>'+
      '</div><div class="attendance-form-error" role="alert" hidden></div><div class="patient-form-actions">'+
      '<button class="button ghost" type="button" data-go="/atendimentos/fila">Cancelar</button>'+
      '<button class="button" type="submit"'+(locked||!state.patients.length?' disabled':'')+
      '>Registrar chegada</button></div></form>';
  }
  function editVisitForm(visitId){
    if(!canWrite())return alertBox("Somente a recepção pode corrigir registros de chegada.");
    const v=state.visits.find(x=>x.id===visitId);
    if(!v)return alertBox("Registro de atendimento não encontrado.");
    const editable=v.service_date===currentDay()&&!isClosed()&&isShiftStarted()&&!v.excluded_at;
    const patients=state.patients.map(p=>
      '<option value="'+esc(p.id)+'"'+(p.id===v.patient_id?' selected':'')+'>'+esc(p.nome)+'</option>').join("");
    const guides=state.guides.filter(g=>g.ativo||g.id===v.guide_id).map(g=>
      '<option value="'+esc(g.id)+'"'+(g.id===v.guide_id?' selected':'')+'>'+esc(g.nome)+'</option>').join("");
    const options=MODES.map(m=>
      '<option value="'+m[0]+'"'+(v.modalidade===m[0]?' selected':'')+'>'+m[1]+'</option>').join("");
    return '<button type="button" class="breadcrumb" data-go="/atendimentos/paciente/'+
      esc(v.patient_id)+'/'+esc(v.id)+'">← Voltar à ficha</button>'+
      title("Editar registro de atendimento","Corrija o paciente, Guia, modalidade, prioridade ou situação. A ordem original de chegada é preservada.")+
      (editable?'':'<div class="note warn">Atendimento anterior, encerrado ou excluído: alterações bloqueadas para proteger o histórico.</div>')+
      '<form id="live-visit-edit-form" data-visit-id="'+esc(v.id)+'" class="panel attendance-form">'+
      '<div class="patient-fields">'+
      '<label>Paciente<select name="patient_id" required'+(editable?'':' disabled')+'>'+patients+'</select></label>'+
      '<label>Guia<select name="guide_id"'+(editable?'':' disabled')+'>'+
      '<option value="">Triagem — sem Guia</option>'+guides+'</select></label>'+
      '<label>Modalidade<select name="modalidade" required'+(editable?'':' disabled')+'>'+options+'</select></label>'+
      '<label>Prioridade<select name="prioridade" required'+(editable?'':' disabled')+'>'+
      priorityOptions(v.prioridade)+'</select></label>'+
      '<label>Situação<select name="status" required'+(editable?'':' disabled')+'>'+
      STATUSES.map(x=>'<option value="'+x+'"'+(x===v.status?' selected':'')+'>'+x+'</option>').join("")+
      '</select></label>'+
      '<label>Ficha existente<output>'+officialTicket(v)+'</output></label>'+
      '<label>Ordem original de chegada<output>'+esc(v.ordem)+'</output></label>'+
      '<label>Tempo de atendimento<output>'+durationLabel(durationSeconds(v))+'</output></label>'+
      '</div><div class="attendance-form-error" role="alert" hidden></div>'+
      '<div class="patient-form-actions"><button type="button" class="button ghost" data-go="/atendimentos/paciente/'+
      esc(v.patient_id)+'/'+esc(v.id)+'">Voltar</button>'+
      (editable?'<button type="submit" class="button">Salvar correções</button>'+
        '<button type="button" class="button danger" data-live-exclude-visit="'+esc(v.id)+
        '">Excluir registro de chegada</button>':'')+
      '</div><p class="attendance-audit-notice">Exclusões não apagam a auditoria: ficam registradas com motivo, usuário e horário.</p></form>';
  }
  function patientsPage(){
    const results=state.patients.filter(p=>String(p.nome||"").toLocaleLowerCase("pt-BR").includes(state.search.toLocaleLowerCase("pt-BR")));
    return title("Pacientes","Cadastros únicos, separados dos atendimentos. Pesquise e abra a ficha para consultar o histórico.")+
      '<div class="filters"><label>Buscar paciente <input id="live-patient-search" value="'+esc(state.search)+'" placeholder="Nome do paciente" autocomplete="off"></label>'+
      (canWrite()?'<button class="button" data-go="/atendimentos/novo-paciente">＋ Cadastrar paciente</button>':"")+'</div>'+
      '<div class="list-box">'+(results.map(p=>{
        const count=state.visits.filter(v=>v.patient_id===p.id).length;
        return '<button type="button" class="list-item attendance-patient-row" data-go="/atendimentos/paciente/'+esc(p.id)+'"><div><strong>'+esc(p.nome)+'</strong><small>'+
        fmtDay(p.nascimento)+' · '+count+' atendimento(s)</small></div><span>Ver ficha ›</span></button>';
      }).join("")||'<div class="note">Nenhum paciente encontrado.</div>')+'</div>';
  }
  function guidesPage(){
    const editing=state.guides.find(g=>g.id===state.guideEditingId);
    const worker=state.workers.find(w=>w.id===state.workerEditingId);
    const selectedWorkerGuide=worker?.guide_id||state.workerGuideId||state.guides.find(g=>g.ativo)?.id||"";
    const form=canWrite()?'<form id="live-guide-form" data-guide-id="'+esc(editing?.id||"")+
      '" class="panel attendance-guide-form">'+
      '<label>Nome do Guia <input name="nome" maxlength="120" required placeholder="Nome do Guia" value="'+
      esc(editing?.nome||"")+'"></label>'+
      '<label>Cor da coluna <input name="cor" type="color" value="'+esc(editing?.cor||"#467C9C")+'"></label>'+
      '<label class="attendance-guide-active"><input name="ativo" type="checkbox"'+
      (!editing||editing.ativo?' checked':'')+'> Guia ativo</label>'+
      '<button type="submit" class="button">'+(editing?'Salvar alterações':'＋ Cadastrar Guia')+'</button>'+
      (editing?'<button type="button" class="button ghost" data-live-guide-cancel>Cancelar edição</button>':'')+
      '<div class="attendance-form-error" role="alert" hidden></div></form>':"";
    const rows=state.guides.map(g=>{
      const children=state.workers.filter(w=>w.guide_id===g.id);
      const childRows=children.map(w=>
        '<div class="attendance-guide-worker-row"><div><strong>'+esc(w.nome)+'</strong>'+
        '<small>'+esc(w.funcao||"Trabalhador vinculado")+
        ' · '+(w.ativo?"Ativo":"Inativo")+'</small></div>'+
        (canWrite()?'<button type="button" class="button ghost" data-live-worker-edit="'+esc(w.id)+
        '">Editar trabalhador</button>':"")+'</div>').join("");
      return '<section class="attendance-guide-group"><div class="list-item attendance-guide-row"><div>'+
        '<strong><span class="guide-dot" style="background:'+esc(g.cor)+'"></span> '+esc(g.nome)+'</strong>'+
        '<small>'+(g.ativo?'Ativo':'Inativo')+'</small></div>'+
        (canWrite()?'<div class="attendance-guide-buttons"><button type="button" class="button ghost"'+
          ' data-live-guide-edit="'+esc(g.id)+'">Editar Guia</button>'+
          '<button type="button" class="button ghost" data-live-worker-guide="'+esc(g.id)+
          '">＋ Vincular trabalhador</button></div>':'')+'</div>'+
        (childRows?'<div class="attendance-guide-workers">'+childRows+'</div>':
          '<div class="attendance-guide-workers-empty">Nenhum trabalhador vinculado.</div>')+
        '</section>';
    }).join("");
    const workerForm=canWrite()?'<section class="panel attendance-worker-panel">'+
      '<h3>'+(worker?'Editar trabalhador vinculado':'Vincular trabalhador ao Guia')+'</h3>'+
      '<form id="live-worker-form" data-worker-id="'+esc(worker?.id||"")+'" class="attendance-worker-form">'+
      '<label>Guia principal<select name="guide_id" required'+(worker?' disabled':'')+'>'+
      state.guides.map(g=>'<option value="'+esc(g.id)+'"'+
        (selectedWorkerGuide===g.id?' selected':'')+'>'+esc(g.nome)+'</option>').join("")+'</select></label>'+
      '<label>Nome do trabalhador<input name="nome" maxlength="120" required value="'+
      esc(worker?.nome||"")+'" placeholder="Nome do trabalhador"></label>'+
      '<label>Função / atividade<input name="funcao" maxlength="120" value="'+
      esc(worker?.funcao||"")+'" placeholder="Ex.: auxiliar"></label>'+
      '<label class="attendance-guide-active"><input name="ativo" type="checkbox"'+
      (!worker||worker.ativo?' checked':'')+'> Ativo</label>'+
      '<button class="button" type="submit">'+(worker?'Salvar trabalhador':'Vincular trabalhador')+'</button>'+
      (worker?'<button type="button" class="button ghost" data-live-worker-cancel>Cancelar</button>':'')+
      '<div class="attendance-form-error" role="alert" hidden></div></form></section>':"";
    return title("Guias","Cadastre Guias e vincule trabalhadores auxiliares a cada Guia principal. Esses trabalhadores não recebem login automático.")+
      form+'<div class="attendance-guide-list">'+(rows||'<div class="note">Nenhum Guia cadastrado.</div>')+
      '</div>'+workerForm;
  }
  function maskCpf(cpf){const x=String(cpf||"");return x.length===11?"***.***.***-"+x.slice(-2):"Não informado";}
  function patientDetail(route){
    const segments=route.split("/"),p=person(segments[3]);if(!p)return alertBox("Paciente não encontrado.")+
      '<button class="button" type="button" data-go="/atendimentos/pacientes">Voltar</button>';
    const selected=state.visits.find(v=>v.id===segments[4]&&v.patient_id===p.id);
    const visits=liveVisits().filter(v=>v.patient_id===p.id).sort((a,b)=>b.ordem-a.ordem);
    let details="";
    if(state.profileTab==="dados")details='<dl><div><dt>Modalidade</dt><dd>'+
      esc(MODES.find(m=>m[0]===p.cadastro_modalidade)?.[1]||"Presencial")+'</dd></div>'+
      '<div><dt>Nascimento</dt><dd>'+fmtDay(p.nascimento)+'</dd></div>'+
      '<div><dt>Idade</dt><dd>'+(ageYears(p.nascimento)===null?"Não informada":ageYears(p.nascimento)+" anos")+'</dd></div>'+
      '<div><dt>Último atendimento</dt><dd>'+fmtDay(lastAttendanceDate(p.id))+'</dd></div>'+
      '<div><dt>Telefone</dt><dd>'+esc(p.telefone||"Não informado")+'</dd></div>'+
      '<div><dt>CPF</dt><dd>'+esc(maskCpf(p.cpf))+'</dd></div>'+
      '<div><dt>Guia associado</dt><dd>'+esc(guide(p.guide_id)?.nome||"Não definido")+'</dd></div>'+
      '<div><dt>Endereço</dt><dd>'+esc(p.endereco||"Não informado")+'</dd></div>'+
      '<div><dt>Atendimentos</dt><dd>'+visits.length+'</dd></div></dl>';
    if(state.profileTab==="historico")details='<div class="list-box">'+(visits.map(v=>{
      const g=guide(v.guide_id),changes=state.events.filter(e=>e.visit_id===v.id);
      return '<div class="attendance-history-entry"><strong>'+fmtDay(v.service_date)+' · Guia '+esc(g?.nome||"Não encontrado")+'</strong> '+
        pill(v.status)+'<div class="muted">Ficha '+officialTicket(v)+' · Chegada '+v.ordem+' · '+esc(v.prioridade)+'</div>'+
        '<div class="attendance-event-list">'+changes.map(e=>'<small>'+fmtTime(e.changed_at)+' · '+esc(e.previous_status||"Entrada")+' → '+esc(e.next_status)+'</small>').join("")+'</div></div>';
    }).join("")||'<div class="note">Este paciente ainda não possui atendimentos.</div>')+'</div>';
    if(state.profileTab==="materiais")details='<div class="note">O controle de materiais e devoluções será implementado em uma próxima etapa.</div>';
    if(p.foto_path&&!state.photoUrls.has(p.foto_path)&&!state.photoErrors.has(p.foto_path))loadSignedPhoto(p.foto_path);
    const img=p.foto_path&&state.photoUrls.has(p.foto_path)?'<img class="avatar patient-avatar" alt="Foto de '+esc(p.nome)+'" src="'+esc(state.photoUrls.get(p.foto_path))+'">':
      '<div class="avatar patient-avatar attendance-avatar-fallback" aria-label="Sem fotografia">♙</div>';
    const current=selected?'<div class="attendance-current"><div class="guide-highlight"><i style="background:'+esc(guide(selected.guide_id)?.cor||"#b58b45")+'"></i>'+
      '<div><strong>Atendimento selecionado · '+esc(guide(selected.guide_id)?.nome?"Guia "+guide(selected.guide_id).nome:"Triagem — aguardando Guia")+'</strong>'+
      '<div class="muted">Ficha '+officialTicket(selected)+' · Chegada '+selected.ordem+' · '+fmtDay(selected.service_date)+' · '+esc(selected.prioridade)+'</div></div></div>'+
      (selected.guide_id?'<div class="attendance-status-control"><label>Situação do atendimento <select data-live-status="'+esc(selected.id)+'">'+STATUSES.map(st=>
      '<option value="'+esc(st)+'"'+(selected.status===st?" selected":"")+'>'+esc(st)+'</option>').join("")+'</select></label>'+
      pill(selected.status)+'</div>':
        '<div class="note">Paciente na Triagem. Selecione um Guia pela Fila Geral para emitir sua ficha.</div>')+
      (canWrite()&&selected.service_date===currentDay()&&!isClosed()&&isShiftStarted()?
        '<button type="button" class="button ghost attendance-visit-detail-edit" data-go="/atendimentos/editar-atendimento/'+
          esc(selected.id)+'">Editar registro de atendimento</button>':'')+
      '</div>':"";
    return '<button class="breadcrumb" data-go="/atendimentos/pacientes">← Voltar aos pacientes</button>'+
      '<section class="profile"><div class="profile-header">'+img+'<div><h2>'+esc(p.nome)+'</h2>'+
      '<div class="muted">Ficha individual · dados protegidos</div></div></div>'+current+
      '<div class="module-tabs" role="group" aria-label="Seções da ficha">'+[["dados","Dados"],["historico","Histórico"],["materiais","Materiais"]].map(t=>
      '<button class="tab '+(state.profileTab===t[0]?"active":"")+'" data-live-tab="'+t[0]+'">'+t[1]+'</button>').join("")+'</div>'+details+
      (canWrite()?'<div class="attendance-detail-actions"><button class="button ghost" type="button" data-go="/atendimentos/editar-paciente/'+esc(p.id)+'">✎ Editar informações</button><button class="button" type="button" data-go="/atendimentos/nova-chegada">＋ Novo atendimento</button></div>':"")+
      '</section>';
  }

  function guideNameAtVisit(v){
    return !v.guide_id?"Triagem — sem Guia":v.guia_nome_registro||guide(v.guide_id)?.nome||"Guia não encontrado";
  }
  function historyMatches(){
    const needle=normalize(state.historyPatient);
    return (state.historyIncludeExcluded?state.visits:liveVisits()).filter(v=>
      (!state.historyDate||v.service_date===state.historyDate)&&
      (state.historyGuide==="todos"||state.historyGuide==="triagem"&&!v.guide_id||v.guide_id===state.historyGuide)&&
      (!needle||normalize(person(v.patient_id)?.nome||"").includes(needle)));
  }
  function historySorted(visits){
    return visits.slice().sort((a,b)=>
      b.service_date.localeCompare(a.service_date)||
      guideNameAtVisit(a).localeCompare(guideNameAtVisit(b),"pt-BR")||
      (a.ficha_tipo==="P"?0:1)-(b.ficha_tipo==="P"?0:1)||
      (a.ficha_numero||a.ordem)-(b.ficha_numero||b.ordem));
  }
  function reportTable(visits,{official=false,caption=""}={}){
    const sorted=historySorted(visits);
    const groups=new Map();
    sorted.forEach(v=>{
      const key=JSON.stringify([v.service_date,v.guide_id,guideNameAtVisit(v)]);
      if(!groups.has(key))groups.set(key,{date:v.service_date,title:guideNameAtVisit(v),visits:[]});
      groups.get(key).visits.push(v);
    });
    const body=[...groups.values()].map(group=>
      group.visits.map(v=>'<tr><td>'+officialTicket(v)+'</td><td>'+
        esc(person(v.patient_id)?.nome||"Paciente não encontrado")+'</td><td>'+
        esc(guideNameAtVisit(v))+'</td><td>'+fmtDay(v.service_date)+'</td><td>'+
        esc(v.excluded_at?'Excluído':v.status)+'</td><td>'+durationLabel(durationSeconds(v))+'</td></tr>').join("")+
      '<tr class="attendance-report-subtotal"><td colspan="5">Total — Guia '+esc(group.title)+
      ' · '+fmtDay(group.date)+'</td><td>'+group.visits.length+'</td></tr>'
    ).join("");
    const empty=sorted.length?"":'<tr><td colspan="6">Nenhum atendimento encontrado.</td></tr>';
    const dates=[...new Set(sorted.map(v=>v.service_date))].sort().reverse();
    const period=dates.length===1?fmtDay(dates[0]):dates.length?fmtDay(dates.at(-1))+
      " a "+fmtDay(dates[0]):"Sem data selecionada";
    const heading=official?"Barquinha — Lista oficial de atendimentos":"Barquinha — Histórico de Atendimentos";
    const signDate=dates.length===1?fmtDay(dates[0]):"____/____/________";
    return '<section id="attendance-print-report" class="attendance-report">'+
      '<h2>'+heading+'</h2>'+
      '<p>Período consultado: <strong>'+esc(period)+'</strong>'+
      (caption?' · '+esc(caption):'')+'</p>'+
      (!official?'<p class="attendance-report-caveat">Extrato de consulta. Atendimentos de dias não encerrados ainda podem sofrer alterações.</p>':'')+
      '<table><thead><tr><th>Ordem de Atendimento</th><th>Nome Paciente</th><th>Guia</th>'+
      '<th>Data</th><th>Situação</th><th>Tempo de atendimento</th></tr></thead><tbody>'+
      body+empty+'<tr class="attendance-report-total"><td colspan="5">TOTAL GERAL DE ATENDIMENTOS</td>'+
      '<td>'+sorted.length+'</td></tr></tbody></table>'+
      '<p class="attendance-report-duration">Tempo total contabilizado: '+
      durationLabel(sorted.reduce((seconds,v)=>seconds+durationSeconds(v),0))+'</p>'+
      '<div class="attendance-report-signature"><div>____________________________________________</div>'+
      '<strong>Assinatura do(a) Recepcionista</strong><span>Data: '+signDate+'</span></div></section>';
  }
  function exportHistoryXlsx(){
    const visits=historySorted(historyMatches().filter(v=>!v.excluded_at));
    if(!visits.length)return;
    if(!window.BarquinhaAttendanceXlsx?.download){
      state.error="O exportador Excel não foi carregado. Atualize a página e tente novamente.";
      renderCallback();return;
    }
    const headers=["Data","Ficha","Paciente","Guia","Modalidade","Prioridade",
      "Situação","Duração HH:MM:SS","Ordem de chegada"];
    const groups=new Map();
    for(const v of visits){
      const key=v.service_date+"|"+v.guide_id;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(v);
    }
    const rows=[];
    for(const group of groups.values()){
      for(const v of group){
        rows.push([fmtDay(v.service_date),officialTicket(v),person(v.patient_id)?.nome||"Paciente",
          guideNameAtVisit(v),MODES.find(m=>m[0]===v.modalidade)?.[1]||v.modalidade,
          v.prioridade,v.status,durationLabel(durationSeconds(v)),v.ordem]);
      }
      rows.push(["Subtotal do Guia",group.length,"","","","","",
        durationLabel(group.reduce((n,v)=>n+durationSeconds(v),0)),""]);
    }
    rows.push(["TOTAL GERAL",visits.length,"","","","","",
      durationLabel(visits.reduce((n,v)=>n+durationSeconds(v),0)),""]);
    const name="historico-atendimentos-"+(state.historyDate||currentDay())+".xlsx";
    try{
      window.BarquinhaAttendanceXlsx.download(headers,rows,name);
      state.notice="Planilha Excel gerada localmente com os filtros selecionados.";
      renderCallback();
    }catch(e){state.error="Falha ao gerar XLSX: "+(e.message||e);renderCallback();}
  }
  function shiftPage(){
    const today=currentDay(),closed=state.closures.find(c=>c.service_date===today);
    const visits=historySorted(historyMatches());
    const activeVisits=visits.filter(v=>!v.excluded_at);
    const options='<option value="todos">Todos os Guias e Triagem</option>'+
      '<option value="triagem"'+(state.historyGuide==="triagem"?' selected':'')+'>Triagem — sem Guia</option>'+
      state.guides.map(g=>'<option value="'+esc(g.id)+'"'+
        (state.historyGuide===g.id?' selected':'')+'>'+esc(g.nome)+
        (g.ativo?'':' (inativo)')+'</option>').join("");
    const uniqueDates=[...new Set(visits.map(v=>v.service_date))];
    const header=title("Histórico de Atendimentos",
      "Pesquise atendimentos pelo dia, pelo Guia ou pelo nome do paciente e emita relatórios filtrados. Os registros permanecem no histórico.");
    const filters='<section class="attendance-history-filters" aria-label="Filtros do Histórico">'+
      '<label>Dia do atendimento<input type="date" id="live-history-date" value="'+esc(state.historyDate)+'"></label>'+
      '<label>Guia<select id="live-history-guide">'+options+'</select></label>'+
      '<label class="attendance-history-patient-search">Pesquisar paciente'+
      '<input type="search" id="live-history-patient" value="'+esc(state.historyPatient)+
      '" placeholder="Digite o nome do paciente" autocomplete="off"></label>'+
      '<label class="attendance-show-excluded"><input id="live-history-excluded" type="checkbox"'+
      (state.historyIncludeExcluded?' checked':'')+'> Mostrar registros excluídos (auditoria)</label>'+
      '<button type="button" class="button ghost" data-live-history-clear>Limpar filtros</button>'+
      '</section>';
    const summary='<div class="attendance-history-summary"><strong>'+visits.length+
      ' atendimento(s) encontrado(s)</strong><span>'+uniqueDates.length+' dia(s) de atendimento</span>'+
      '<span>'+new Set(visits.map(v=>v.guide_id)).size+' Guia(s)</span></div>';
    const body=visits.map(v=>{
      const priority=v.ficha_tipo==="P",excluded=!!v.excluded_at;
      const color=guide(v.guide_id)?.cor||"#c39d55";
      return '<tr class="attendance-history-card-row'+(excluded?' is-excluded':'')+'">'+
        '<td>'+fmtDay(v.service_date)+'</td>'+
        '<td><span class="attendance-history-ticket'+(priority?' is-priority':'')+'">'+
        officialTicket(v)+'</span></td>'+
        '<td><button type="button" class="attendance-history-patient-link" data-go="/atendimentos/paciente/'+
        esc(v.patient_id)+'/'+esc(v.id)+'">'+esc(person(v.patient_id)?.nome||"Paciente não encontrado")+'</button>'+
        '<small>'+esc(v.prioridade)+'</small></td>'+
        '<td><span class="attendance-history-guide" style="border-left:4px solid '+esc(color)+'">'+
        esc(guideNameAtVisit(v))+'</span></td>'+
        '<td>'+esc(MODES.find(m=>m[0]===v.modalidade)?.[1]||v.modalidade)+'</td>'+
        '<td><span class="attendance-history-status'+(excluded?' is-excluded':v.status==="Concluído"?' is-done':
          v.status==="Em atendimento"?' is-running':"")+'">'+esc(excluded?"Excluído":v.status)+'</span></td>'+
        '<td class="attendance-history-time">'+durationLabel(durationSeconds(v))+'</td></tr>';
    }).join("");
    const results='<div class="attendance-history-results" role="region" tabindex="0" aria-label="Atendimentos encontrados">'+
      '<table><thead><tr><th>Data</th><th>Ficha</th><th>Nome Paciente</th><th>Guia</th>'+
      '<th>Modalidade</th><th>Situação</th><th>Tempo</th></tr></thead><tbody>'+
      (body||'<tr><td colspan="7">Nenhum atendimento corresponde aos filtros selecionados.</td></tr>')+
      '</tbody></table></div>';
    const dayCount=liveVisits().filter(v=>v.service_date===today).length;
    const closing='<section class="attendance-shift-controls">'+
      (closed?'<div class="note">Expediente de '+fmtDay(today)+' encerrado em '+fmtTime(closed.closed_at)+
      '. A lista oficial do dia pode ser consultada e emitida.</div>':
      '<div class="note warn">Atendimentos de hoje: '+dayCount+
      '. Finalize o expediente somente após o último paciente.</div>'+
      (canWrite()?isShiftStarted()?'<button type="button" class="button danger" data-live-close-day>Finalizar Atendimentos</button>':
        '<button type="button" class="button" data-live-start-day>Iniciar Atendimentos</button>':'') )+
      '</section>';
    const fullClosedDay=Boolean(state.historyDate&&
      state.closures.some(c=>c.service_date===state.historyDate)&&
      state.historyGuide==="todos"&&!normalize(state.historyPatient));
    const preview=state.historyReportVisible&&activeVisits.length>0;
    const autoOfficial=Boolean(closed&&!state.historyDate&&state.historyGuide==="todos"&&
      !normalize(state.historyPatient));
    const reportRows=preview?activeVisits:autoOfficial?liveVisits().filter(v=>v.service_date===today):[];
    const official=preview?fullClosedDay:autoOfficial;
    const caption=state.historyDate?"Dia: "+fmtDay(state.historyDate):"Todos os dias";
    const actions='<div class="attendance-history-actions">'+
      '<button type="button" class="button secondary" data-live-history-generate'+(activeVisits.length?'':' disabled')+
      '">Preparar relatório da pesquisa</button>'+
      '<button type="button" class="button ghost" data-live-history-xlsx'+
      (activeVisits.length?'':' disabled')+'>Exportar Excel (.xlsx)</button>'+
      (reportRows.length?'<button type="button" class="button" data-live-print>Imprimir ou salvar em PDF</button>':'')+
      '</div>';
    return header+closing+filters+summary+results+actions+
      (reportRows.length?reportTable(reportRows,{official,caption:preview?caption:"Encerramento do dia"}):'');
  }
  async function startDay(){
    if(!canWrite()||state.busy||isClosed()||isShiftStarted())return;
    state.busy=true;
    try{
      const {data,error}=await client().rpc("barquinha_attendance_start_shift").single();
      if(error)throw error;
      const existing=state.shifts.findIndex(x=>x.service_date===data.service_date);
      if(existing>=0)state.shifts[existing]=data;else state.shifts.push(data);
      state.notice="Atendimentos iniciados em "+fmtTime(data.started_at)+". Registro de chegadas liberado.";
      renderCallback();
    }catch(e){state.error="Falha ao iniciar o expediente: "+(e.message||e);renderCallback();}
    finally{state.busy=false;}
  }
  async function closeDay(){
    if(!canWrite()||state.busy||isClosed()||!isShiftStarted())return;
    if(!confirm("Finalizar os atendimentos de "+fmtDay(currentDay())+
      "? O horário será registrado, as chegadas serão bloqueadas e o relatório poderá ser emitido."))return;
    state.busy=true;
    try{
      const {data,error}=await client().rpc("barquinha_attendance_finish_shift").single();
      if(error)throw error;
      const index=state.shifts.findIndex(x=>x.service_date===data.service_date);
      if(index>=0)state.shifts[index]=data;else state.shifts.push(data);
      if(!state.closures.some(x=>x.service_date===data.service_date))
        state.closures.push({service_date:data.service_date,closed_at:data.finished_at});
      for(const v of state.visits)if(v.service_date===data.service_date&&v.timer_started_at){
        v.atendimento_segundos=durationSeconds(v);
        v.timer_started_at=null;
      }
      state.historyDate=currentDay();state.historyGuide="todos";state.historyPatient="";state.historyReportVisible=true;
      state.notice="Expediente finalizado em "+fmtTime(data.finished_at)+
        ". Tempo total: "+durationLabel((Date.parse(data.finished_at)-Date.parse(data.started_at))/1000)+".";
      navigateCallback("/atendimentos/historico");
    }catch(e){state.error="Não foi possível finalizar: "+(e.message||e);renderCallback();}
    finally{state.busy=false;}
  }
  function tickTimers(){
    if(!state.loaded||!state.access||!document?.querySelectorAll)return;
    const now=Date.now();
    document.querySelectorAll("[data-live-visit-timer]").forEach(node=>{
      const visit=state.visits.find(v=>v.id===node.dataset.liveVisitTimer);
      if(visit)node.textContent=durationLabel(durationSeconds(visit,now));
    });
    document.querySelectorAll("[data-live-shift-timer]").forEach(node=>{
      const start=Date.parse(node.dataset.liveShiftTimer);
      const end=Date.parse(node.dataset.finished||"");
      if(Number.isFinite(start))
        node.textContent=durationLabel(((Number.isFinite(end)?end:now)-start)/1000);
    });
  }
  async function removePatientPhoto(patientId){
    if(!canWrite()||state.busy)return;
    const p=person(patientId);
    if(!p?.foto_path)return;
    if(!confirm("Remover a fotografia deste paciente? Os demais dados e atendimentos serão mantidos."))return;
    state.busy=true;
    const original=p.foto_path;
    try{
      const {data,error}=await client().from("barquinha_attendance_patients")
        .update({foto_path:null}).eq("id",p.id)
        .select("id,foto_path").single();
      if(error)throw error;
      p.foto_path=data.foto_path;
      state.photoUrls.delete(original);state.photoErrors.delete(original);
      state.notice="Fotografia removida da ficha. Os dados do paciente foram mantidos.";
      const remove=await client().storage.from(PHOTO_BUCKET).remove([original]);
      if(remove.error)state.notice+=" A imagem não pôde ser excluída do armazenamento; solicite revisão ao administrador.";
      renderCallback();
    }catch(e){
      state.error="Não foi possível remover a foto: "+(e.message||e);renderCallback();
    }finally{state.busy=false;}
  }
  async function loadSignedPhoto(path){
    if(state.photoRequests.has(path))return;
    state.photoRequests.add(path);
    try{
      const {data,error}=await client().storage.from(PHOTO_BUCKET).createSignedUrl(path,600);
      if(error)throw error;
      state.photoUrls.set(path,data.signedUrl);
    }catch(e){state.photoErrors.add(path);}
    finally{state.photoRequests.delete(path);renderCallback();}
  }
  function cpfDigits(v){return String(v||"").replace(/\D/g,"");}
  function validCpf(v){
    const cpf=cpfDigits(v);if(cpf.length!==11||/^(\d)\1{10}$/.test(cpf))return false;
    for(let length=9;length<=10;length++){let sum=0;for(let i=0;i<length;i++)sum+=Number(cpf[i])*(length+1-i);
      const digit=(sum*10)%11%10;if(digit!==Number(cpf[length]))return false;
    }return true;
  }
  const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
  function fail(form,message){
    const element=form.querySelector(".attendance-form-error");
    if(element){element.textContent=message;element.hidden=false;}
  }
  async function imageBlob(file){
    if(!file||!file.size)return null;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>12000000)throw Error("Use JPG, PNG ou WebP de até 12 MB na origem.");
    const image=await createImageBitmap(file);
    const size=Math.min(image.width,image.height);
    const canvas=document.createElement("canvas");canvas.width=420;canvas.height=420;
    const context=canvas.getContext("2d");
    if(!context){image.close();throw Error("Não foi possível preparar a fotografia.");}
    context.fillStyle="#fff";context.fillRect(0,0,420,420);
    context.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,420,420);
    image.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.76));
    if(!blob||blob.size>2097152)throw Error("A foto compactada ultrapassou 2 MB.");
    return blob;
  }
  function stopWebcam(){
    if(state.webcamStream)state.webcamStream.getTracks().forEach(t=>t.stop());
    state.webcamStream=null;
    const video=document?.getElementById?.("live-webcam");
    if(video){video.pause();video.srcObject=null;video.hidden=true;}
    for(const key of ["data-live-camera-capture","data-live-camera-stop"]){
      const b=document?.querySelector?.("["+key+"]");if(b)b.hidden=true;
    }
  }
  async function startWebcam(){
    const video=document.getElementById("live-webcam");
    if(!video||!navigator.mediaDevices?.getUserMedia){
      const msg=document.getElementById("live-camera-preview");
      if(msg)msg.textContent="Este navegador não permite usar webcam. Utilize o campo de fotografia.";
      return;
    }
    stopWebcam();
    try{
      state.webcamStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});
      video.srcObject=state.webcamStream;video.hidden=false;await video.play();
      document.querySelector("[data-live-camera-capture]").hidden=false;
      document.querySelector("[data-live-camera-stop]").hidden=false;
      const status=document.getElementById("live-camera-preview");
      if(status)status.textContent="Câmera ativa. Posicione o paciente e clique em Capturar foto.";
    }catch(e){
      stopWebcam();
      const status=document.getElementById("live-camera-preview");
      if(status)status.textContent="Não foi possível acessar a câmera: "+(e.message||e);
    }
  }
  async function captureWebcam(){
    const video=document.getElementById("live-webcam");
    if(!video||!video.videoWidth)return;
    const canvas=document.createElement("canvas");canvas.width=420;canvas.height=420;
    const ctx=canvas.getContext("2d"),side=Math.min(video.videoWidth,video.videoHeight);
    if(!ctx)return;
    ctx.drawImage(video,(video.videoWidth-side)/2,(video.videoHeight-side)/2,side,side,0,0,420,420);
    const blob=await new Promise(ok=>canvas.toBlob(ok,"image/jpeg",0.8));
    if(!blob)return;
    state.webcamBlob=blob;
    stopWebcam();
    const display=document.getElementById("live-camera-preview");
    if(display)display.textContent="Fotografia capturada e pronta para salvar.";
  }
  async function patientSubmit(form){
    if(state.busy||!canWrite())return;
    const data=new FormData(form),
      id=String(form.dataset.editId||""),
      mode=String(data.get("cadastro_modalidade")||"presencial"),
      nome=String(data.get("nome")||"").trim().replace(/\s+/g," "),
      nascimento=String(data.get("nascimento")||""),
      telefone=String(data.get("telefone")||"").trim(),
      cpf=cpfDigits(data.get("cpf")),
      endereco=String(data.get("endereco")||"").trim(),
      guide_id=String(data.get("guide_id")||"")||null;
    if(nome.length<2||nome.length>160)return fail(form,"Informe o nome completo do paciente.");
    if(!MODES.some(m=>m[0]===mode))return fail(form,"Modalidade inválida.");
    if(mode!=="distancia"&&!nascimento)return fail(form,"Informe a data de nascimento para atendimento presencial.");
    if(nascimento&&nascimento>currentDay())return fail(form,"Nascimento não pode ser uma data futura.");
    if(mode==="distancia"&&endereco.length<5)return fail(form,"Informe o endereço para cadastrar paciente à distância.");
    if(endereco.length>900)return fail(form,"O endereço ultrapassa 900 caracteres.");
    if(cpf&&!validCpf(cpf))return fail(form,"CPF inválido.");
    if(guide_id&&!guide(guide_id))return fail(form,"Selecione um Guia cadastrado.");
    const exists=state.patients.find(p=>p.id!==id&&((cpf&&p.cpf===cpf)||
      (nascimento&&normalize(p.nome)===normalize(nome)&&p.nascimento===nascimento)));
    if(exists)return fail(form,"Possível duplicidade: "+exists.nome+". Consulte a ficha antes de continuar.");
    const payload={nome,nascimento:nascimento||null,telefone:telefone||null,cpf:cpf||null,
      cadastro_modalidade:mode,endereco:endereco||null,guide_id};
    const submit=form.querySelector('[type="submit"]');state.busy=true;if(submit)submit.disabled=true;
    try{
      const file=data.get("foto"),blob=state.webcamBlob||(file?.size?await imageBlob(file):null);
      const request=id?client().from("barquinha_attendance_patients").update(payload).eq("id",id):
        client().from("barquinha_attendance_patients").insert(payload);
      const {data:saved,error}=await request
        .select("id,nome,nascimento,telefone,cpf,encaminhamento,foto_path,created_at,cadastro_modalidade,endereco,guide_id").single();
      if(error)throw error;
      const index=state.patients.findIndex(p=>p.id===saved.id);
      if(index>=0)state.patients[index]=saved;else state.patients.push(saved);
      state.notice=id?"Informações do paciente atualizadas.":"Paciente cadastrado com segurança.";
      if(blob){
        try{
          const path=saved.id+"/"+crypto.randomUUID()+".jpg";
          const upload=await client().storage.from(PHOTO_BUCKET).upload(path,blob,{upsert:false,contentType:"image/jpeg"});
          if(upload.error)throw upload.error;
          const updated=await client().from("barquinha_attendance_patients").update({foto_path:path}).eq("id",saved.id)
            .select("id,foto_path").single();
          if(updated.error)throw updated.error;
          saved.foto_path=path;state.photoUrls.clear();state.photoErrors.clear();
        }catch(uploadError){state.notice+=" A fotografia não foi salva: "+uploadError.message;}
      }
      stopWebcam();state.webcamBlob=null;state.profileTab="dados";
      navigateCallback("/atendimentos/paciente/"+saved.id);
    }catch(e){
      fail(form,e.code==="23505"?"Já existe um paciente com este CPF. Confira a ficha antes de cadastrar.":
        "Não foi possível salvar o cadastro: "+(e.message||e));
    }finally{state.busy=false;if(submit?.isConnected)submit.disabled=false;}
  }
  async function guideSubmit(form){
    if(state.busy||!canWrite())return;
    const values=new FormData(form),
      id=String(form.dataset.guideId||""),
      nome=String(values.get("nome")||"").trim().replace(/\s+/g," "),
      cor=String(values.get("cor")||"#467C9C"),
      ativo=values.get("ativo")!==null;
    if(nome.length<2||nome.length>120)return fail(form,"Informe um nome de Guia entre 2 e 120 caracteres.");
    if(!/^#[0-9a-fA-F]{6}$/.test(cor))return fail(form,"Selecione uma cor válida.");
    if(id&&!guide(id))return fail(form,"Guia não encontrado para edição.");
    if(state.guides.some(g=>g.id!==id&&normalize(g.nome)===normalize(nome)))
      return fail(form,"Já existe um Guia cadastrado com esse nome.");
    const submit=form.querySelector('[type="submit"]');state.busy=true;if(submit)submit.disabled=true;
    try{
      const request=id?client().from("barquinha_attendance_guides")
        .update({nome,cor,ativo}).eq("id",id):
        client().from("barquinha_attendance_guides").insert({nome,cor,ativo});
      const {data:saved,error}=await request.select("id,nome,cor,ativo,created_at").single();
      if(error)throw error;
      const index=state.guides.findIndex(g=>g.id===saved.id);
      if(index>=0)state.guides[index]=saved;else state.guides.push(saved);
      state.guideEditingId=null;
      state.notice=id?"Guia atualizado. Os atendimentos anteriores permanecem preservados.":"Guia cadastrado.";
      renderCallback();
    }catch(e){fail(form,e.code==="23505"?"Já existe um Guia com esse nome.":"Não foi possível salvar o Guia: "+(e.message||e));}
    finally{state.busy=false;if(submit?.isConnected)submit.disabled=false;}
  }
  async function workerSubmit(form){
    if(state.busy||!canWrite())return;
    const values=new FormData(form),id=String(form.dataset.workerId||"");
    const old=state.workers.find(w=>w.id===id);
    const guideId=old?.guide_id||String(values.get("guide_id")||"");
    const name=String(values.get("nome")||"").trim().replace(/\s+/g," ");
    const funcao=String(values.get("funcao")||"").trim();
    const ativo=values.get("ativo")!==null;
    if(name.length<2||name.length>120||funcao.length>120)return fail(form,"Confira o nome e a função.");
    if(!guide(guideId))return fail(form,"Selecione um Guia válido.");
    if(state.workers.some(w=>w.id!==id&&w.guide_id===guideId&&normalize(w.nome)===normalize(name)))
      return fail(form,"Esse trabalhador já está vinculado ao Guia.");
    state.busy=true;
    try{
      const payload={nome:name,funcao:funcao||null,ativo};
      const request=old?client().from("barquinha_attendance_guide_workers")
          .update(payload).eq("id",old.id):
        client().from("barquinha_attendance_guide_workers")
          .insert({guide_id:guideId,...payload});
      const {data,error}=await request.select("id,guide_id,nome,funcao,ativo,created_at").single();
      if(error)throw error;
      const index=state.workers.findIndex(w=>w.id===data.id);
      if(index>=0)state.workers[index]=data;else state.workers.push(data);
      state.workerEditingId=null;state.workerGuideId=guideId;
      state.notice=old?"Trabalhador atualizado.":"Trabalhador vinculado ao Guia.";
      renderCallback();
    }catch(e){fail(form,"Não foi possível salvar o trabalhador: "+(e.message||e));}
    finally{state.busy=false;}
  }
  async function arrivalSubmit(form){
    if(state.busy||!canWrite())return;
    const data=new FormData(form);
    const patient=person(String(data.get("patient_id")||""));
    const guideId=String(data.get("guide_id")||""),
      modalidade=String(data.get("modalidade")||"presencial"),
      prioridade=String(data.get("prioridade")||"Normal");
    if(!patient)return fail(form,"Selecione um paciente válido na lista de sugestões pelo nome.");
    if(!PRIORITIES.includes(prioridade)||guideId&&(!guide(guideId)||!guide(guideId).ativo))
      return fail(form,"Selecione um Guia ativo ou a Triagem e informe a prioridade.");
    if(!guideId&&state.visits.some(v=>v.patient_id===patient.id))
      return fail(form,"Triagem somente na primeira visita. Para atendimentos posteriores, selecione um Guia.");
    if(!MODES.some(m=>m[0]===modalidade))return fail(form,"Modalidade de atendimento inválida.");
    if(isClosed())return fail(form,"O expediente de hoje já foi encerrado.");
    if(!isShiftStarted())return fail(form,"Inicie os atendimentos na Fila Geral antes de registrar chegadas.");
    if(afterArrivalDeadline())
      return fail(form,"Chegadas após 17h exigem autorização do Presidente. Este procedimento ainda está em preparação.");
    const priority=agePriority(patient.nascimento)&&prioridade==="Normal"?"Idoso":prioridade;
    const submit=form.querySelector('[type="submit"]');state.busy=true;if(submit)submit.disabled=true;
    try{
      const {data:saved,error}=await client().from("barquinha_attendance_visits")
        .insert({patient_id:patient.id,guide_id:guideId||null,modalidade,prioridade:priority})
        .select("id,ordem,ficha_tipo,ficha_numero,guia_nome_registro,patient_id,guide_id,service_date,modalidade,prioridade,status,created_at,status_changed_at,atendimento_iniciado_em,atendimento_finalizado_em,timer_started_at,atendimento_segundos,excluded_at,excluded_by,exclusion_reason").single();
      if(error)throw error;
      state.visits.unshift(saved);
      state.notice=guideId?"Chegada registrada. Ficha "+officialTicket(saved)+" do Guia "+
        (guide(guideId)?.nome||"")+" (chegada "+saved.ordem+").":
        "Chegada registrada na Triagem (ordem de chegada "+saved.ordem+
        "). A ficha de atendimento será emitida quando o Guia for escolhido.";
      // O Guia escolhido é também o vínculo padrão do paciente para próximas chegadas.
      // Se esta atualização falhar, a ficha já emitida permanece salva.
      if(guideId&&patient.guide_id!==guideId){
        const linked=await client().from("barquinha_attendance_patients")
          .update({guide_id:guideId}).eq("id",patient.id);
        if(!linked.error)patient.guide_id=guideId;
        else state.notice+=" Atenção: o vínculo padrão do Guia não pôde ser salvo.";
      }
      navigateCallback("/atendimentos/fila");void reloadEvents();
    }catch(e){fail(form,"Não foi possível registrar a chegada: "+(e.message||e));}
    finally{state.busy=false;if(submit?.isConnected)submit.disabled=false;}
  }
  async function reloadEvents(){
    const {data,error}=await client().from("barquinha_attendance_events")
      .select("id,visit_id,previous_status,next_status,changed_at").order("changed_at",{ascending:false}).limit(5000);
    if(!error)state.events=data||[];
  }
  async function saveVisitEdit(form){
    if(!canWrite()||state.busy||!isShiftStarted())return;
    const data=new FormData(form),id=String(form.dataset.visitId||"");
    const v=state.visits.find(x=>x.id===id);
    if(!v||v.excluded_at)return fail(form,"Registro não disponível.");
    const payload={
      p_visit_id:id,
      p_patient_id:String(data.get("patient_id")||""),
      p_guide_id:String(data.get("guide_id")||"")||null,
      p_modalidade:String(data.get("modalidade")||""),
      p_prioridade:String(data.get("prioridade")||""),
      p_status:String(data.get("status")||"")
    };
    if(!person(payload.p_patient_id)||!MODES.some(m=>m[0]===payload.p_modalidade))
      return fail(form,"Revise o paciente e a modalidade.");
    if(!payload.p_guide_id&&payload.p_status!=="Aguardando")
      return fail(form,"Registros em Triagem devem permanecer como Aguardando.");
    state.busy=true;
    try{
      const {data:saved,error}=await client().rpc("barquinha_attendance_edit_visit",payload).single();
      if(error)throw error;
      Object.assign(v,saved);
      if(saved.guide_id){const p=person(saved.patient_id);if(p)p.guide_id=saved.guide_id;}
      state.notice="Registro corrigido. A alteração foi preservada na auditoria.";
      navigateCallback("/atendimentos/paciente/"+saved.patient_id+"/"+saved.id);
    }catch(e){fail(form,"Falha ao corrigir registro: "+(e.message||e));}
    finally{state.busy=false;}
  }
  async function excludeVisit(id){
    if(!canWrite()||state.busy||!isShiftStarted())return;
    const v=state.visits.find(v=>v.id===id);
    if(!v||v.excluded_at)return;
    if(!confirm("Excluir o registro de chegada? O paciente e o histórico de auditoria serão preservados."))return;
    const reason=prompt("Informe o motivo da exclusão do registro de atendimento:");
    if(reason===null)return;
    const normalized=reason.trim();
    if(normalized.length<5){state.error="Informe um motivo de pelo menos 5 caracteres.";renderCallback();return;}
    state.busy=true;
    try{
      const {data,error}=await client().rpc("barquinha_attendance_exclude_visit",{
        p_visit_id:id,p_reason:normalized
      }).single();
      if(error)throw error;
      Object.assign(v,data);
      state.notice="Registro excluído da fila e do relatório, com motivo preservado na auditoria.";
      navigateCallback("/atendimentos/fila");
    }catch(e){state.error="Não foi possível excluir o registro: "+(e.message||e);renderCallback();}
    finally{state.busy=false;}
  }
  async function routeTriage(select){
    if(state.busy||!canWrite()||isClosed()||!isShiftStarted())return;
    const visit=state.visits.find(v=>v.id===select.dataset.liveRouteTriage);
    const newGuide=guide(select.value);
    if(!visit||visit.guide_id||!newGuide?.ativo)return;
    state.busy=true;select.disabled=true;
    try{
      const {data,error}=await client().rpc("barquinha_attendance_route_triage",{
        p_visit_id:visit.id,p_guide_id:newGuide.id
      }).single();
      if(error)throw error;
      if(!data||data.guide_id!==newGuide.id||!data.ficha_numero)
        throw Error("A ficha não foi confirmada pelo banco. Atualize a fila.");
      Object.assign(visit,data);
      const p=person(visit.patient_id);
      if(p)p.guide_id=newGuide.id;
      state.notice="Paciente encaminhado da Triagem para Guia "+newGuide.nome+
        ". Ficha "+officialTicket(visit)+" emitida.";
      renderCallback();
    }catch(e){
      select.value="";
      state.notice="Não foi possível encaminhar a Triagem: "+(e.message||e)+
        ". Atualize a fila e confira o paciente antes de tentar novamente.";
      renderCallback();
    }finally{
      state.busy=false;
      if(select.isConnected)select.disabled=false;
    }
  }
  async function changeStatus(select){
    if(state.busy||!canChangeStatus()||isClosed()||!isShiftStarted()||!STATUSES.includes(select.value))return;
    const visit=state.visits.find(v=>v.id===select.dataset.liveStatus);
    if(!visit)return;
    const before=visit.status,newStatus=select.value;
    if(before===newStatus)return;
    select.disabled=true;state.busy=true;
    try{
      const {data,error}=await client().from("barquinha_attendance_visits")
        .update({status:newStatus}).eq("id",visit.id).eq("status",before)
        .select("id,status,status_changed_at,timer_started_at,atendimento_segundos,atendimento_iniciado_em,atendimento_finalizado_em").maybeSingle();
      if(error)throw error;
      if(!data)throw Error("A situação já foi alterada por outra pessoa. Atualize e tente novamente.");
      Object.assign(visit,data);
      await reloadEvents();state.notice="Situação alterada de "+before+" para "+newStatus+".";
      renderCallback();
    }catch(e){select.value=before;state.error="Não foi possível alterar a situação: "+(e.message||e);renderCallback();}
    finally{state.busy=false;if(select.isConnected)select.disabled=false;}
  }
  function syncArrivalPatient(){
    const input=document?.getElementById?.("live-arrival-patient-search");
    const hidden=document?.getElementById?.("live-arrival-selected-id");
    const results=document?.getElementById?.("live-arrival-suggestions");
    if(!input)return;
    const selected=person(state.arrivalSelectedId);
    const candidates=selected?[]:searchArrivalPatients(input.value);
    if(results){
      results.innerHTML=candidates.map(arrivalSuggestItem).join("");
      results.hidden=!candidates.length;
    }
    input.setAttribute?.("aria-expanded",String(candidates.length>0));
    if(hidden)hidden.value=selected?.id||"";
    const guideSelect=document?.getElementById?.("live-arrival-guide");
    const priority=document?.getElementById?.("live-arrival-priority");
    const hint=document?.getElementById?.("live-arrival-age-hint");
    if(selected){
      if(guideSelect)guideSelect.value=selected.guide_id&&guide(selected.guide_id)?.ativo?selected.guide_id:"";
      if(priority)priority.value=agePriority(selected.nascimento)?"Idoso":"Normal";
      if(hint)hint.textContent=ageYears(selected.nascimento)===null?
        "Nascimento não informado. Selecione a prioridade aplicável.":
        "Idade: "+ageYears(selected.nascimento)+" anos"+
        (agePriority(selected.nascimento)?" · Prioridade idoso sugerida":" · Classificação normal sugerida");
    }else if(hint)hint.textContent="Selecione uma sugestão para preencher automaticamente Guia e prioridade.";
  }
  function pickArrivalPatient(id){
    const p=person(id);if(!p)return;
    state.arrivalSelectedId=p.id;
    state.arrivalSearch=p.nome;
    const input=document?.getElementById?.("live-arrival-patient-search");
    if(input)input.value=p.nome;
    syncArrivalPatient();
  }
  function handleKeydown(event){
    if(event.target?.id!=="live-arrival-patient-search")return false;
    const items=searchArrivalPatients(event.target.value);
    if(event.key==="Escape"){
      const area=document?.getElementById?.("live-arrival-suggestions");
      if(area)area.hidden=true;
      event.preventDefault();return true;
    }
    if(event.key==="ArrowDown"){
      const first=document?.querySelector?.("[data-live-patient-pick]");
      if(first){event.preventDefault();first.focus();return true;}
    }
    if(event.key==="Enter"&&items.length===1&&!state.arrivalSelectedId){
      event.preventDefault();pickArrivalPatient(items[0].id);return true;
    }
    return false;
  }
  function syncPatientForm(){
    const mode=document.getElementById("live-patient-mode")?.value||"presencial";
    const birth=document.getElementById("live-patient-birth");
    const address=document.getElementById("live-patient-address");
    const age=document.getElementById("live-patient-age");
    if(birth)birth.required=mode!=="distancia";
    if(address)address.required=mode==="distancia";
    if(age&&birth){
      const years=ageYears(birth.value);
      age.textContent=years===null?"Não informada":years+" anos"+(years>=60?" · PRIORIDADE: IDOSO":"");
    }
  }
  function rerenderSearchInput(id,target){
    const pos=target.selectionStart;
    renderCallback();
    const next=document?.getElementById?.(id);
    if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch(e){}}
  }
  function handleClick(event){
    const match=selector=>event.target?.closest?.(selector);
    const candidate=match("[data-live-patient-pick]");
    if(candidate){event.preventDefault();pickArrivalPatient(candidate.dataset.livePatientPick);return true;}
    if(match("[data-live-refresh]")){event.preventDefault();refresh();return true;}
    const tab=match("[data-live-tab]");
    if(tab){event.preventDefault();state.profileTab=tab.dataset.liveTab;renderCallback();return true;}
    const editGuide=match("[data-live-guide-edit]");
    if(editGuide){event.preventDefault();state.guideEditingId=guide(editGuide.dataset.liveGuideEdit)?.id||null;renderCallback();return true;}
    if(match("[data-live-guide-cancel]")){event.preventDefault();state.guideEditingId=null;renderCallback();return true;}
    const editWorker=match("[data-live-worker-edit]");
    if(editWorker){event.preventDefault();state.workerEditingId=editWorker.dataset.liveWorkerEdit;renderCallback();return true;}
    const addWorker=match("[data-live-worker-guide]");
    if(addWorker){
      event.preventDefault();state.workerGuideId=addWorker.dataset.liveWorkerGuide;
      state.workerEditingId=null;renderCallback();return true;
    }
    if(match("[data-live-worker-cancel]")){
      event.preventDefault();state.workerEditingId=null;renderCallback();return true;
    }
    if(match("[data-live-history-clear]")){
      event.preventDefault();
      state.historyDate="";state.historyGuide="todos";state.historyPatient="";
      state.historyReportVisible=false;state.historyIncludeExcluded=false;renderCallback();return true;
    }
    if(match("[data-live-history-generate]")){
      event.preventDefault();if(historyMatches().some(v=>!v.excluded_at)){
        state.historyReportVisible=true;renderCallback();
      }return true;
    }
    if(match("[data-live-history-xlsx]")){event.preventDefault();exportHistoryXlsx();return true;}
    const photo=match("[data-live-remove-photo]");
    if(photo){event.preventDefault();void removePatientPhoto(photo.dataset.liveRemovePhoto);return true;}
    const exclude=match("[data-live-exclude-visit]");
    if(exclude){event.preventDefault();void excludeVisit(exclude.dataset.liveExcludeVisit);return true;}
    if(match("[data-live-camera-start]")){event.preventDefault();void startWebcam();return true;}
    if(match("[data-live-camera-capture]")){event.preventDefault();void captureWebcam();return true;}
    if(match("[data-live-camera-stop]")){event.preventDefault();stopWebcam();return true;}
    if(match("[data-live-start-day]")){event.preventDefault();void startDay();return true;}
    if(match("[data-live-close-day]")){event.preventDefault();void closeDay();return true;}
    if(match("[data-live-print]")){event.preventDefault();window.print();return true;}
    return false;
  }
  function handleSubmit(event){
    const form=event.target;
    if(form?.id==="live-patient-form"){event.preventDefault();void patientSubmit(form);return true;}
    if(form?.id==="live-guide-form"){event.preventDefault();void guideSubmit(form);return true;}
    if(form?.id==="live-worker-form"){event.preventDefault();void workerSubmit(form);return true;}
    if(form?.id==="live-visit-edit-form"){event.preventDefault();void saveVisitEdit(form);return true;}
    if(form?.id==="live-arrival-form"){event.preventDefault();void arrivalSubmit(form);return true;}
    return false;
  }
  function handleChange(event){
    const target=event.target;
    if(target?.id==="live-guide-filter"){state.filter=target.value;renderCallback();return true;}
    if(target?.id==="live-history-date"){
      state.historyDate=target.value;state.historyReportVisible=false;renderCallback();return true;
    }
    if(target?.id==="live-history-guide"){
      state.historyGuide=target.value;state.historyReportVisible=false;renderCallback();return true;
    }
    if(target?.id==="live-history-excluded"){
      state.historyIncludeExcluded=!!target.checked;state.historyReportVisible=false;renderCallback();return true;
    }
    if(target?.name==="foto"){state.webcamBlob=null;return true;}
    if(target?.id==="live-patient-mode"||target?.id==="live-patient-birth"){syncPatientForm();return true;}
    if(target?.matches?.("[data-live-route-triage]")){void routeTriage(target);return true;}
    if(target?.matches?.("[data-live-status]")){void changeStatus(target);return true;}
    return false;
  }
  function handleInput(event){
    const t=event.target;
    if(t?.id==="live-patient-birth"||t?.id==="live-patient-mode"){syncPatientForm();return true;}
    if(t?.id==="live-arrival-patient-search"){
      state.arrivalSelectedId="";state.arrivalSearch=t.value;
      const guideEl=document?.getElementById?.("live-arrival-guide");
      const priorityEl=document?.getElementById?.("live-arrival-priority");
      if(guideEl)guideEl.value="";
      if(priorityEl)priorityEl.value="Normal";
      syncArrivalPatient();return true;
    }
    if(t?.id==="live-queue-search"){
      state.queueSearch=t.value;rerenderSearchInput("live-queue-search",t);return true;
    }
    if(t?.id==="live-history-patient"){
      state.historyPatient=t.value;state.historyReportVisible=false;
      rerenderSearchInput("live-history-patient",t);return true;
    }
    if(t?.id!=="live-patient-search")return false;
    state.search=t.value;rerenderSearchInput("live-patient-search",t);return true;
  }
  function syncQuietly(){
    if(state.loaded&&state.access&&!state.loading&&!state.busy)void load();
  }
  window.AttendanceLive={connect,page,handleClick,handleSubmit,handleChange,handleInput,handleKeydown,tickTimers,syncQuietly,clear:()=>resetFor(null)};
})();