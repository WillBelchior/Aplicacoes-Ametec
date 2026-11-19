"use strict";
/* Atendimentos Barquinha: módulo persistente isolado do Projetos.
   Dados pessoais ficam no Supabase com RLS; sem localStorage nem dados fictícios. */
(() => {
  const STATUSES=["Aguardando","Chamado","Em atendimento","Concluído","Não compareceu","Desistente"];
  const PRIORITIES=["Normal","Idoso","Gestante","Deficiência","Outra"];
  const MODES=[["presencial","Presencial"],["distancia","À distância"],["trabalhador","Trabalhador da casa"]];
  const CLOSED=new Set(["Concluído","Não compareceu","Desistente","Cancelado"]);
  // Primeiro teste de recepção: somente atendimentos presenciais; os demais
  // dependem das autorizações e da ordem de atendimento ainda não implementadas.
  const PILOT_ONLY=true;
  function afterArrivalDeadline(){
    const hour=Number(new Intl.DateTimeFormat("en-GB",{
      timeZone:"America/Fortaleza",hour:"2-digit",hourCycle:"h23"
    }).format(new Date()));
    return hour>=17;
  }
  const PHOTO_BUCKET="barquinha-attendance-photos";
  const state={userId:null,loaded:false,loading:false,error:"",notice:"",access:null,
    guides:[],patients:[],visits:[],events:[],sessions:[],filter:"todos",search:"",arrivalSearch:"",profileTab:"dados",
    cameraStream:null,cameraBlob:null,reportHtml:"",
    photoUrls:new Map(),photoRequests:new Set(),photoErrors:new Set(),busy:false};
  let renderCallback=()=>{},navigateCallback=route=>{location.hash="#"+route;};
  const auth=()=>window.PlatformAuth;
  const client=()=>auth()?.client;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const person=id=>state.patients.find(p=>p.id===id);
  const guide=id=>state.guides.find(g=>g.id===id);
  const currentDay=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Fortaleza",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const fmtDay=date=>date?new Date(date+"T12:00:00").toLocaleDateString("pt-BR"):"—";
  const fmtTime=date=>date?new Date(date).toLocaleString("pt-BR",{timeZone:"America/Fortaleza",dateStyle:"short",timeStyle:"short"}):"—";
  const statusLabel=value=>value==="Em atendimento"?"Em Atendimento":value==="Não compareceu"?"Não Compareceu":value==="Cancelado"?"Desistente":value;
  const pill=status=>'<span class="pill '+(status==="Concluído"?"green":status==="Chamado"?"blue":status==="Cancelado"||status==="Desistente"?"red":"")+'">'+esc(statusLabel(status))+'</span>';
  const alertBox=text=>'<div class="note warn" role="alert">'+esc(text)+'</div>';
  const field=(name,label,type,required,extra)=>'<label>'+esc(label)+(required?" *":"")+
    '<input name="'+name+'" type="'+type+'" '+(required?"required ":"")+(extra||"")+'></label>';
  const nav=(tabs)=>tabs||"";
  const canWrite=()=>["administrador","recepcao"].includes(state.access?.access_role);
  const canChangeStatus=()=>["administrador","recepcao","guia"].includes(state.access?.access_role);
  const isClosed=day=>state.sessions.some(s=>s.service_date===day);
  const ageAt=(birth,day=currentDay())=>{
    if(!birth)return null;
    const y=Number(day.slice(0,4))-Number(birth.slice(0,4));
    const hadBirthday=day.slice(5)>=birth.slice(5);
    return y-(hadBirthday?0:1);
  };
  const isElderly=p=>ageAt(p?.nascimento)>=60;
  const isPriority=v=>Boolean(v.chamada_prioritaria)||v.prioridade!=="Normal";
  const ticket=v=>(isPriority(v)?"P":"")+String(v.chamada_numero||v.ordem||0).padStart(2,"0");
  function stopCamera(){
    if(state.cameraStream){state.cameraStream.getTracks().forEach(track=>track.stop());state.cameraStream=null;}
  }
  const patientSelect="id,nome,nascimento,telefone,cpf,encaminhamento,foto_path,created_at,preferred_guide_id,modalidade_cadastro,endereco";
  const visitSelect="id,ordem,patient_id,guide_id,service_date,modalidade,prioridade,status,chamada_numero,chamada_prioritaria,created_at,status_changed_at";
  function connect(render,navigate){renderCallback=render;navigateCallback=navigate;}
  function resetFor(userId){
    state.userId=userId;state.loaded=false;state.loading=false;state.error="";state.access=null;
    stopCamera();state.cameraBlob=null;state.arrivalSearch="";state.reportHtml="";
    state.guides=[];state.patients=[];state.visits=[];state.events=[];state.sessions=[];state.notice="";
    state.photoUrls.clear();state.photoRequests.clear();state.photoErrors.clear();state.filter="todos";state.search="";
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
        client().from("barquinha_attendance_patients").select(patientSelect).order("nome"),
        client().from("barquinha_attendance_visits").select(visitSelect).order("created_at",{ascending:false}).limit(3000),
        client().from("barquinha_attendance_events").select("id,visit_id,previous_status,next_status,changed_at").order("changed_at",{ascending:false}).limit(5000),
        client().from("barquinha_attendance_sessions").select("service_date,started_at,closed_at,closed_by").order("service_date",{ascending:false}).limit(100)
      ];
      const results=await Promise.all(requests);
      for(const result of results)if(result.error)throw result.error;
      if(auth()?.user?.id!==userId)return;
      [state.guides,state.patients,state.visits,state.events,state.sessions]=results.map(r=>r.data||[]);
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
    // Every route render replaces the form markup: stop the stream before detaching its video element.
    if(state.cameraStream)stopCamera();
    if(!state.loaded&&!state.loading)queueMicrotask(load);
    if(!state.loaded)return nav(tabs)+'<div class="panel attendance-placeholder">Carregando dados protegidos de Atendimentos…</div>';
    if(state.error)return nav(tabs)+info();
    if(!state.access)return nav(tabs)+alertBox("Este usuário não possui autorização para acessar os dados de Atendimentos. Solicite liberação à administração.");
    let inner;
    if(route==="/atendimentos/novo-paciente")inner=patientForm();
    else if(route.startsWith("/atendimentos/editar-paciente/"))inner=patientForm(route.split("/")[3]);
    else if(route==="/atendimentos/nova-chegada")inner=arrivalForm();
    else if(route.startsWith("/atendimentos/paciente/"))inner=patientDetail(route);
    else if(route==="/atendimentos/pacientes")inner=patientsPage();
    else if(route==="/atendimentos/guias")inner=guidesPage();
    else if(route==="/atendimentos/autorizacoes")inner=deferred("Autorizações","As regras de autorização e exceções serão ativadas após a conclusão do fluxo básico.");
    else if(route==="/atendimentos/expediente")inner=sessionPage();
    else inner=queuePage();
    const previewNotice='<div class="note" role="status"><strong>Cadastro institucional protegido.</strong> Pacientes e Guias são registrados no Supabase por usuários autorizados. O cadastro à distância aceita nome e endereço, mas passagens à distância e chegadas após 17h dependem de autorização do Presidente e continuam bloqueadas até a conclusão desse fluxo.</div>';
    return nav(tabs)+previewNotice+info()+inner;
  }
  function deferred(title,detail){return '<section class="intro"><div class="eyebrow">EM PREPARAÇÃO</div><h1>'+esc(title)+'</h1><p>'+esc(detail)+'</p></section>';}
  function title(t,description){return '<section class="intro"><div class="eyebrow">ATENDIMENTOS BARQUINHA</div><h1>'+esc(t)+'</h1><p>'+esc(description)+'</p></section>';}
  function queuePage(){
    const day=currentDay();
    const today=state.visits.filter(v=>v.service_date===day);
    const finished=today.filter(v=>CLOSED.has(v.status));
    const guides=state.guides.filter(g=>g.ativo||today.some(v=>v.guide_id===g.id));
    const selected=guides.filter(g=>state.filter==="todos"||g.id===state.filter);
    const filter='<option value="todos">Todos os Guias</option>'+guides.map(g=>
      '<option value="'+esc(g.id)+'"'+(g.id===state.filter?' selected':'')+'>'+esc(g.nome)+'</option>').join("");
    const closed=isClosed(day);
    const statusChoices=v=>STATUSES.map(st=>
      '<option value="'+esc(st)+'"'+(v.status===st||(v.status==="Cancelado"&&st==="Desistente")?' selected':'')+
      '>'+esc(statusLabel(st))+'</option>').join("");
    const columns=selected.map(g=>{
      const visits=today.filter(v=>v.guide_id===g.id).sort((a,b)=>{
        return Number(isPriority(b))-Number(isPriority(a)) ||
          (a.chamada_numero||a.ordem)-(b.chamada_numero||b.ordem);
      });
      const body=visits.map(v=>{
        const p=person(v.patient_id);
        if(!p)return "";
        const priority=isPriority(v);
        const status=canChangeStatus()&&!closed?
          '<label class="queue-select-wrap">Situação<select aria-label="Situação de '+esc(p.nome)+'" data-live-status="'+esc(v.id)+'">'+statusChoices(v)+'</select></label>':
          '<span class="queue-readonly">'+pill(v.status)+'</span>';
        return '<article class="queue-card'+(priority?' is-priority':'')+'">'+
          '<button class="queue-open-patient" type="button" data-go="/atendimentos/paciente/'+esc(p.id)+'/'+esc(v.id)+'">'+
          '<span class="ticket'+(priority?' ticket-priority':'')+'">'+ticket(v)+'</span>'+
          '<span class="queue-details"><strong>'+esc(p.nome)+'</strong><small>'+
          (priority?'<span class="queue-priority-label">'+esc(v.prioridade)+' · PRIORIDADE</span>':'Ficha normal')+
          ' · '+esc(v.modalidade==="distancia"?"À distância":"Presencial")+'</small></span>'+
          '</button>'+status+'</article>';
      }).join("");
      return '<section class="queue-guide-column"><div class="queue-guide-header" style="border-top-color:'+esc(g.cor)+
        '"><div class="queue-guide-info"><span class="guide-dot" style="background:'+esc(g.cor)+'"></span>'+
        '<h3 title="Guia '+esc(g.nome)+'">Guia '+esc(g.nome)+'</h3></div>'+
        '<span class="pill blue">'+visits.length+' no dia</span></div>'+
        '<div class="queue-guide-body">'+(body||'<div class="queue-empty">Nenhum registro para este Guia.</div>')+
        '</div></section>';
    }).join("");
    const actionButtons=canWrite()&&!closed?
      '<button class="button" type="button" data-go="/atendimentos/nova-chegada">＋ Registrar chegada</button>'+
      '<button class="button secondary" type="button" data-go="/atendimentos/novo-paciente">＋ Cadastrar paciente</button>':"";
    return title("Atendimento do Dia","Fila geral de "+fmtDay(day)+" · Fichas numeradas por Guia e prioridade.")+
      (closed?'<div class="note" role="status">Expediente encerrado. Todos os registros permanecem nesta lista; o relatório pode ser impresso na aba Expediente.</div>':"")+
      '<div class="metrics"><div class="metric"><strong>'+today.filter(v=>!CLOSED.has(v.status)).length+
      '</strong><span>Em aberto</span></div><div class="metric"><strong>'+finished.length+
      '</strong><span>Encerrados</span></div><div class="metric"><strong>'+state.patients.length+
      '</strong><span>Pacientes cadastrados</span></div></div>'+
      '<div class="filters"><div class="queue-actions"><h3>Fila geral por Guia</h3>'+actionButtons+
      '<button type="button" class="button ghost" data-live-refresh>↻ Atualizar</button>'+
      '<button type="button" class="button secondary" data-go="/atendimentos/expediente">Expediente e relatório</button></div>'+
      '<label>Visualizar <select id="live-guide-filter">'+filter+'</select></label></div>'+
      (!guides.length?alertBox("Nenhum Guia cadastrado. Abra a aba Guias para começar."):"")+
      '<p class="queue-hint">'+(selected.length>=6?"Use a rolagem horizontal para visualizar todos os Guias. ":"")+
      'Todas as situações permanecem visíveis. Fichas P01 e 01 são sequências independentes para cada Guia.</p>'+
      '<div class="queue-board-scroll" role="region" tabindex="0" aria-label="Filas de atendimentos por Guia">'+
      '<div class="queue-board'+(selected.length===1?" single":"")+(selected.length>=6?" is-scroll":"")+
      '" data-guide-count="'+selected.length+'" style="--guide-count:'+Math.max(1,selected.length)+'">'+columns+'</div></div>';
  }
  function sessionPage(){
    const day=currentDay(),session=state.sessions.find(s=>s.service_date===day);
    const count=state.visits.filter(v=>v.service_date===day).length;
    const closed=Boolean(session?.closed_at);
    return title("Expediente","Abertura, encerramento e relatório completo da recepção.")+
      '<section class="panel attendance-shift"><h3>'+fmtDay(day)+'</h3>'+
      '<p><strong>Situação:</strong> '+(closed?'Encerrado em '+fmtTime(session.closed_at):
        session?'Aberto desde '+fmtTime(session.started_at):'Ainda não iniciado formalmente')+'</p>'+
      '<p>Atendimentos registrados no dia: <strong>'+count+'</strong>. Todos os status serão incluídos no relatório, com subtotal por Guia.</p>'+
      '<div class="attendance-shift-actions">'+
      (!session&&canWrite()?'<button class="button" data-live-start>Iniciar Atendimentos</button>':"")+
      (!closed&&canWrite()?'<button class="button" data-live-finish>Finalizar Atendimentos e emitir relatório</button>':"")+
      (closed?'<button class="button secondary" data-live-print>Imprimir relatório da data</button>':"")+
      '</div><small>O encerramento é definitivo para esta data: bloqueia novas chegadas e alterações de situação. Confira as informações antes de finalizar.</small>'+
      '</section>';
  }
  function reportMarkup(day,closedAt){
    const today=state.visits.filter(v=>v.service_date===day);
    const groups=[...new Set(today.map(v=>v.guide_id))].map(id=>({
      id,name:guide(id)?.nome||"Guia não encontrado",
      visits:today.filter(v=>v.guide_id===id).sort((a,b)=>Number(isPriority(b))-Number(isPriority(a))||
        (a.chamada_numero||a.ordem)-(b.chamada_numero||b.ordem))
    })).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
    const rows=groups.map(g=>
      g.visits.map(v=>'<tr><td class="ticket-print">'+esc(ticket(v))+'</td><td>'+esc(person(v.patient_id)?.nome||"Paciente não encontrado")+
        '</td><td>'+esc(g.name)+'</td><td>'+esc(statusLabel(v.status))+'</td></tr>').join("")+
      '<tr class="subtotal"><td colspan="3">Total de atendimentos — Guia '+esc(g.name)+'</td><td>'+g.visits.length+'</td></tr>'
    ).join("");
    return '<section id="attendance-print-report"><header><h1>Barquinha — Relatório de Atendimentos</h1>'+
      '<p>Data: '+fmtDay(day)+(closedAt?' · Encerramento: '+fmtTime(closedAt):'')+'</p></header>'+
      '<table><thead><tr><th>Ordem de Atendimento</th><th>Nome Paciente</th><th>Guia</th><th>Situação</th></tr></thead>'+
      '<tbody>'+rows+'<tr class="report-total"><td colspan="3">TOTAL GERAL DE ATENDIMENTOS</td><td>'+today.length+'</td></tr></tbody></table>'+
      '<footer><p>Data do atendimento: '+fmtDay(day)+'</p>'+
      '<div class="signature-line">Assinatura do(a) Recepcionista</div></footer></section>';
  }
  function printSessionReport(day=currentDay()){
    const session=state.sessions.find(s=>s.service_date===day);
    if(!session?.closed_at){state.error="Encerre o expediente antes de emitir o relatório.";renderCallback();return;}
    document.getElementById("attendance-print-report")?.remove();
    const container=document.createElement("div");
    container.innerHTML=reportMarkup(day,session.closed_at);
    document.body.appendChild(container.firstElementChild);
    window.addEventListener("afterprint",()=>document.getElementById("attendance-print-report")?.remove(),{once:true});
    window.print();
  }
  async function startSession(){
    if(state.busy||!canWrite()||state.sessions.some(s=>s.service_date===currentDay()))return;
    state.busy=true;
    try{
      const {data,error}=await client().from("barquinha_attendance_sessions")
        .insert({service_date:currentDay()})
        .select("service_date,started_at,closed_at,closed_by").single();
      if(error)throw error;
      state.sessions.unshift(data);state.notice="Expediente iniciado.";renderCallback();
    }catch(e){state.error="Não foi possível abrir o expediente: "+(e.message||e);renderCallback();}
    finally{state.busy=false;}
  }
  async function finishSession(){
    if(state.busy||!canWrite()||isClosed(currentDay()))return;
    if(!window.confirm("Encerrar os atendimentos de hoje? Isso bloqueará novas chegadas e alterações de status e emitirá a tabela para assinatura."))return;
    state.busy=true;
    try{
      const day=currentDay();
      let session=state.sessions.find(s=>s.service_date===day);
      if(!session){
        const {data:started,error:startError}=await client().from("barquinha_attendance_sessions")
          .insert({service_date:day})
          .select("service_date,started_at,closed_at,closed_by").single();
        if(startError)throw startError;
        state.sessions.unshift(started);session=started;
      }
      const {data:closed,error}=await client().from("barquinha_attendance_sessions")
        .update({closed_at:new Date().toISOString()}).eq("service_date",day).is("closed_at",null)
        .select("service_date,started_at,closed_at,closed_by").single();
      if(error)throw error;
      Object.assign(session,closed);
      state.notice="Expediente encerrado. Relatório liberado para assinatura.";
      renderCallback();
      printSessionReport(day);
    }catch(e){state.error="Não foi possível finalizar o expediente: "+(e.message||e);renderCallback();}
    finally{state.busy=false;}
  }
  function patientForm(patientId=null){
    if(!canWrite())return alertBox("Sua função não permite cadastrar ou editar pacientes.");
    const p=patientId?person(patientId):null;
    if(patientId&&!p)return alertBox("Paciente não encontrado.");
    const editing=Boolean(p);
    const modo=p?.modalidade_cadastro||"presencial";
    const guides=state.guides.filter(g=>g.ativo||g.id===p?.preferred_guide_id);
    const options=guides.map(g=>'<option value="'+esc(g.id)+'"'+(p?.preferred_guide_id===g.id?' selected':'')+'>'+esc(g.nome)+'</option>').join("");
    const dob=p?.nascimento||"";
    const age=ageAt(dob);
    return '<button class="breadcrumb" type="button" data-go="'+(editing?'/atendimentos/paciente/'+p.id:'/atendimentos/pacientes')+'">← Voltar</button>'+
      title(editing?"Editar paciente":"Cadastrar paciente",editing?"Atualize os dados do paciente. Os atendimentos anteriores serão preservados.":"O Guia pode ser associado permanentemente. Cadastro à distância aceita apenas nome e endereço.")+
      '<form id="live-patient-form" data-patient-id="'+esc(p?.id||"")+'" class="panel attendance-form">'+
      '<div class="patient-fields">'+
      '<label>Nome completo *<input name="nome" type="text" maxlength="160" autocomplete="name" required value="'+esc(p?.nome||"")+'"></label>'+
      '<label>Modalidade de cadastro *<select name="modalidade_cadastro" id="live-patient-mode">'+
      '<option value="presencial"'+(modo==="presencial"?' selected':'')+'>Presencial</option>'+
      '<option value="distancia"'+(modo==="distancia"?' selected':'')+'>À distância</option>'+
      '<option value="trabalhador"'+(modo==="trabalhador"?' selected':'')+'>Trabalhador da casa</option></select>'+
      '<small>Cadastro à distância não exige nascimento, CPF ou telefone. O atendimento à distância depende de autorização do Presidente.</small></label>'+
      '<label>Data de nascimento'+(modo!=="distancia"?" *":"")+
      '<input id="live-patient-birth" name="nascimento" type="date" max="'+currentDay()+'"'+(modo!=="distancia"?" required":"")+
      ' value="'+esc(dob)+'"></label>'+
      '<label>Idade e classificação<output id="live-patient-age" class="age-preview" aria-live="polite">'+
      (age===null?"Idade não informada":age+" anos"+(age>=60?" · IDOSO — prioridade automática":" · Classificação normal"))+
      '</output></label>'+
      '<label>Guia<select name="preferred_guide_id"><option value="">Sem Guia definido</option>'+options+'</select>'+
      '<small>O Guia escolhido será sugerido automaticamente nas próximas chegadas.</small></label>'+
      '<label>Telefone<input name="telefone" type="tel" maxlength="40" value="'+esc(p?.telefone||"")+'"></label>'+
      '<label>CPF<input name="cpf" type="text" maxlength="14" inputmode="numeric" autocomplete="off" value="'+esc(p?.cpf||"")+'"></label>'+
      '<label class="field-wide">Endereço'+(modo==="distancia"?" *":"")+
      '<textarea name="endereco" id="live-patient-address" rows="3" maxlength="600"'+(modo==="distancia"?" required":"")+
      ' placeholder="Rua, número, referência, bairro, cidade e demais informações disponíveis">'+esc(p?.endereco||"")+'</textarea>'+
      '<small>Para pacientes à distância, informe o endereço disponível com detalhes suficientes.</small></label>'+
      '<div class="field-wide webcam-field"><label>Fotografia<input type="file" name="foto" accept="image/jpeg,image/png,image/webp">'+
      '<small>Envie uma imagem ou tire uma foto com a câmera, com autorização do paciente.</small></label>'+
      '<div class="webcam-controls"><button class="button ghost" type="button" data-camera-open>📷 Abrir câmera</button>'+
      '<button class="button ghost" type="button" data-camera-capture hidden>Capturar foto</button>'+
      '<button class="button ghost" type="button" data-camera-stop hidden>Fechar câmera</button></div>'+
      '<video id="live-camera-video" autoplay muted playsinline hidden></video>'+
      '<img id="live-camera-preview" alt="Prévia da fotografia capturada" hidden>'+
      (editing&&p.foto_path?'<label class="photo-remove"><input type="checkbox" name="remover_foto"> Remover foto atual da ficha</label>':"")+
      '</div></div>'+
      '<div class="attendance-form-error" role="alert" hidden></div>'+
      '<div class="patient-form-actions"><button type="button" class="button ghost" data-go="'+
      (editing?'/atendimentos/paciente/'+p.id:'/atendimentos/pacientes')+'">Cancelar</button>'+
      '<button type="submit" class="button">'+(editing?"Salvar alterações":"Salvar paciente")+'</button></div></form>';
  }
  function arrivalForm(){
    if(!canWrite())return alertBox("Sua função não permite registrar chegadas.");
    if(isClosed(currentDay()))return alertBox("O expediente de hoje está encerrado. Não é possível registrar novas chegadas.");
    const options=state.patients.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nome)+' · '+fmtDay(p.nascimento)+'</option>').join("");
    const guides=state.guides.filter(g=>g.ativo).map(g=>'<option value="'+esc(g.id)+'">'+esc(g.nome)+'</option>').join("");
    return '<button class="breadcrumb" type="button" data-go="/atendimentos/fila">← Voltar à fila</button>'+
      title("Registrar chegada","Pesquise o paciente pelo nome e selecione seu Guia. A ficha oficial é gerada por Guia, separando senhas normais e prioritárias.")+
      (!options||!guides?alertBox("Cadastre pelo menos um paciente e um Guia antes de registrar uma chegada."):"")+
      '<form id="live-arrival-form" class="panel attendance-form"><div class="patient-fields">'+
      '<label>Buscar paciente pelo nome<input type="search" id="live-arrival-search" autocomplete="off" value="'+esc(state.arrivalSearch)+'" placeholder="Digite o nome para filtrar"></label>'+
      '<label>Paciente *<select name="patient_id" required><option value="">Selecione um paciente</option>'+options+'</select>'+
      '<small>A lista será filtrada enquanto você digita.</small></label>'+
      '<label>Guia *<select name="guide_id" required><option value="">Selecione um Guia</option>'+guides+'</select>'+
      '<small>Se o paciente tiver um Guia associado, ele será selecionado automaticamente.</small></label>'+
      '<label>Modalidade *<select name="modalidade"><option value="presencial">Presencial</option></select>'+
      '<small>Atendimento à distância e após 17h exigem autorização do Presidente.</small></label>'+
      '<label>Prioridade *<select name="prioridade" id="live-arrival-priority">'+PRIORITIES.map(t=>'<option>'+esc(t)+'</option>').join("")+'</select>'+
      '<small id="live-arrival-age-note">Idosos de 60 anos ou mais recebem a classificação automaticamente.</small></label>'+
      '</div><div class="attendance-form-error" role="alert" hidden></div><div class="patient-form-actions">'+
      '<button class="button ghost" type="button" data-go="/atendimentos/fila">Cancelar</button>'+
      '<button class="button" type="submit"'+(!options||!guides?' disabled':'')+'>Gerar ficha e registrar chegada</button></div></form>';
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
    return title("Guias","Cadastre os Guias para organizar as filas e atribuir atendimentos.")+
      (canWrite()?'<form id="live-guide-form" class="panel attendance-guide-form">'+
      '<label>Nome do Guia <input name="nome" maxlength="120" required placeholder="Nome completo"></label>'+
      '<label>Cor da coluna <input name="cor" type="color" value="#467C9C"></label>'+
      '<button type="submit" class="button">＋ Cadastrar Guia</button><div class="attendance-form-error" role="alert" hidden></div></form>':"")+
      '<div class="list-box">'+(state.guides.map(g=>'<div class="list-item"><div><strong><span class="guide-dot" style="background:'+esc(g.cor)+'"></span> '+
      esc(g.nome)+'</strong><small>'+(g.ativo?"Ativo":"Inativo")+'</small></div><span>'+state.visits.filter(v=>v.guide_id===g.id).length+' atendimento(s)</span></div>').join("")||
      '<div class="note">Nenhum Guia cadastrado.</div>')+'</div>';
  }
  function maskCpf(cpf){const x=String(cpf||"");return x.length===11?"***.***.***-"+x.slice(-2):"Não informado";}
  function patientDetail(route){
    const segments=route.split("/"),p=person(segments[3]);if(!p)return alertBox("Paciente não encontrado.")+
      '<button class="button" type="button" data-go="/atendimentos/pacientes">Voltar</button>';
    const selected=state.visits.find(v=>v.id===segments[4]&&v.patient_id===p.id);
    const visits=state.visits.filter(v=>v.patient_id===p.id).sort((a,b)=>b.ordem-a.ordem);
    let details="";
    if(state.profileTab==="dados")details='<dl><div><dt>Nascimento</dt><dd>'+fmtDay(p.nascimento)+'</dd></div>'+
      '<div><dt>Idade / Prioridade</dt><dd>'+(ageAt(p.nascimento)===null?'Não informada':ageAt(p.nascimento)+' anos'+(isElderly(p)?' · PRIORIDADE IDOSO':''))+'</dd></div>'+
      '<div><dt>Guia associado</dt><dd>'+esc(guide(p.preferred_guide_id)?.nome||"Sem Guia definido")+'</dd></div>'+
      '<div><dt>Modalidade de cadastro</dt><dd>'+esc(p.modalidade_cadastro==="distancia"?"À distância":p.modalidade_cadastro==="trabalhador"?"Trabalhador da casa":"Presencial")+'</dd></div>'+
      '<div><dt>Endereço</dt><dd>'+esc(p.endereco||"Não informado")+'</dd></div>'+
      '<div><dt>Telefone</dt><dd>'+esc(p.telefone||"Não informado")+'</dd></div>'+
      '<div><dt>CPF</dt><dd>'+esc(maskCpf(p.cpf))+'</dd></div>'+
      '<div><dt>Atendimentos</dt><dd>'+visits.length+'</dd></div>'+
      (p.encaminhamento?'<div><dt>Informação histórica</dt><dd>'+esc(p.encaminhamento)+'</dd></div>':"")+'</dl>';
    if(state.profileTab==="historico")details='<div class="list-box">'+(visits.map(v=>{
      const g=guide(v.guide_id),changes=state.events.filter(e=>e.visit_id===v.id);
      return '<div class="attendance-history-entry"><strong>'+fmtDay(v.service_date)+' · Guia '+esc(g?.nome||"Não encontrado")+'</strong> '+
        pill(v.status)+'<div class="muted">Ficha '+ticket(v)+' · '+esc(v.prioridade)+'</div>'+
        '<div class="attendance-event-list">'+changes.map(e=>'<small>'+fmtTime(e.changed_at)+' · '+esc(e.previous_status||"Entrada")+' → '+esc(e.next_status)+'</small>').join("")+'</div></div>';
    }).join("")||'<div class="note">Este paciente ainda não possui atendimentos.</div>')+'</div>';
    if(state.profileTab==="materiais")details='<div class="note">O controle de materiais e devoluções será implementado em uma próxima etapa.</div>';
    if(p.foto_path&&!state.photoUrls.has(p.foto_path)&&!state.photoErrors.has(p.foto_path))loadSignedPhoto(p.foto_path);
    const img=p.foto_path&&state.photoUrls.has(p.foto_path)?'<img class="avatar patient-avatar" alt="Foto de '+esc(p.nome)+'" src="'+esc(state.photoUrls.get(p.foto_path))+'">':
      '<div class="avatar patient-avatar attendance-avatar-fallback" aria-label="Sem fotografia">♙</div>';
    const current=selected?'<div class="attendance-current"><div class="guide-highlight"><i style="background:'+esc(guide(selected.guide_id)?.cor||"#467C9C")+'"></i>'+
      '<div><strong>Atendimento selecionado · Guia '+esc(guide(selected.guide_id)?.nome||"—")+'</strong>'+
      '<div class="muted">Ficha '+ticket(selected)+' · '+fmtDay(selected.service_date)+' · '+esc(selected.prioridade)+'</div></div></div>'+
      '<div class="attendance-status-control"><label>Situação do atendimento <select data-live-status="'+esc(selected.id)+'"'+(isClosed(selected.service_date)?' disabled':'')+'>'+STATUSES.map(st=>
      '<option value="'+esc(st)+'"'+(selected.status===st?" selected":"")+'>'+esc(statusLabel(st))+'</option>').join("")+'</select></label>'+
      pill(selected.status)+'</div></div>':"";
    return '<button class="breadcrumb" data-go="/atendimentos/pacientes">← Voltar aos pacientes</button>'+
      '<section class="profile"><div class="profile-header">'+img+'<div><h2>'+esc(p.nome)+'</h2>'+
      '<div class="muted">Ficha individual · dados protegidos</div></div></div>'+current+
      '<div class="module-tabs" role="group" aria-label="Seções da ficha">'+[["dados","Dados"],["historico","Histórico"],["materiais","Materiais"]].map(t=>
      '<button class="tab '+(state.profileTab===t[0]?"active":"")+'" data-live-tab="'+t[0]+'">'+t[1]+'</button>').join("")+'</div>'+details+
      (canWrite()?'<div class="attendance-detail-actions"><button class="button" type="button" data-go="/atendimentos/editar-paciente/'+esc(p.id)+'">Editar informações</button>'+
      (!isClosed(currentDay())?'<button class="button secondary" type="button" data-go="/atendimentos/nova-chegada">＋ Novo atendimento</button>':"")+'</div>':"")+
      '</section>';
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
  async function patientSubmit(form){
    if(state.busy||!canWrite())return;
    const data=new FormData(form);
    const patientId=String(form.dataset.patientId||"");
    const existing=patientId?person(patientId):null;
    if(patientId&&!existing)return fail(form,"Paciente não encontrado. Atualize a lista.");
    const nome=String(data.get("nome")||"").trim().replace(/\s+/g," ");
    const nascimento=String(data.get("nascimento")||"");
    const telefone=String(data.get("telefone")||"").trim();
    const cpf=cpfDigits(data.get("cpf"));
    const preferred_guide_id=String(data.get("preferred_guide_id")||"")||null;
    const modalidade_cadastro=String(data.get("modalidade_cadastro")||"presencial");
    const endereco=String(data.get("endereco")||"").trim();
    if(nome.length<2||nome.length>160)return fail(form,"Informe o nome completo do paciente.");
    if(!MODES.some(m=>m[0]===modalidade_cadastro))return fail(form,"Selecione a modalidade de cadastro.");
    if((!nascimento&&modalidade_cadastro!=="distancia")||(nascimento&&nascimento>currentDay()))
      return fail(form,"Informe uma data de nascimento válida. Ela é dispensada apenas para cadastro à distância.");
    if(modalidade_cadastro==="distancia"&&endereco.length<5)
      return fail(form,"Informe o endereço disponível para o cadastro à distância.");
    if(cpf&&!validCpf(cpf))return fail(form,"CPF inválido.");
    if(preferred_guide_id&&!guide(preferred_guide_id))return fail(form,"Guia não encontrado.");
    const duplicate=state.patients.find(p=>p.id!==patientId&&(
      (cpf&&p.cpf===cpf)||
      (nascimento&&p.nascimento===nascimento&&normalize(p.nome)===normalize(nome))||
      (!nascimento&&!p.nascimento&&normalize(p.nome)===normalize(nome)&&normalize(p.endereco)===normalize(endereco))
    ));
    if(duplicate)return fail(form,"Possível duplicidade: "+duplicate.nome+". Consulte a ficha antes de cadastrar.");
    const file=data.get("foto"),removePhoto=data.get("remover_foto")==="on";
    const payload={nome,nascimento:nascimento||null,telefone:telefone||null,cpf:cpf||null,
      preferred_guide_id,modalidade_cadastro,endereco:endereco||null};
    if(existing&&removePhoto&&!file?.size&&!state.cameraBlob)payload.foto_path=null;
    const submit=form.querySelector('[type="submit"]');
    state.busy=true;if(submit)submit.disabled=true;
    try{
      const blob=state.cameraBlob||((file?.size)?await imageBlob(file):null);
      const statement=existing?
        client().from("barquinha_attendance_patients").update(payload).eq("id",patientId):
        client().from("barquinha_attendance_patients").insert(payload);
      const {data:saved,error}=await statement.select(patientSelect).single();
      if(error)throw error;
      if(existing){Object.assign(existing,saved);}
      else state.patients.push(saved);
      state.notice=existing?"Dados do paciente atualizados.":"Paciente cadastrado.";
      if(blob){
        try{
          const path=saved.id+"/"+crypto.randomUUID()+".jpg";
          const uploaded=await client().storage.from(PHOTO_BUCKET).upload(path,blob,
            {upsert:false,contentType:"image/jpeg"});
          if(uploaded.error)throw uploaded.error;
          const {data:photo,error:photoError}=await client().from("barquinha_attendance_patients")
            .update({foto_path:path}).eq("id",saved.id).select("id,foto_path").single();
          if(photoError)throw photoError;
          saved.foto_path=photo.foto_path;
          const actual=person(saved.id);if(actual)actual.foto_path=photo.foto_path;
        }catch(e){state.notice+=" A fotografia não foi salva: "+(e.message||e);}
      }
      if(existing&&removePhoto&&!blob&&existing.foto_path===null)
        state.photoUrls.clear();
      stopCamera();state.cameraBlob=null;state.profileTab="dados";
      navigateCallback("/atendimentos/paciente/"+saved.id);
    }catch(e){
      fail(form,e.code==="23505"?"Já existe paciente com este CPF.":("Não foi possível salvar: "+(e.message||e)));
    }finally{state.busy=false;if(submit?.isConnected)submit.disabled=false;}
  }
  async function guideSubmit(form){
    if(state.busy||!canWrite())return;
    const data=new FormData(form),nome=String(data.get("nome")||"").trim(),cor=String(data.get("cor")||"#467C9C");
    if(nome.length<2)return fail(form,"Informe o nome do Guia.");
    const submit=form.querySelector('[type="submit"]');state.busy=true;if(submit)submit.disabled=true;
    try{
      const {data:added,error}=await client().from("barquinha_attendance_guides").insert({nome,cor})
        .select("id,nome,cor,ativo,created_at").single();
      if(error)throw error;
      state.guides.push(added);state.notice="Guia cadastrado.";
      renderCallback();
    }catch(e){fail(form,e.code==="23505"?"Já existe um Guia com esse nome.":"Não foi possível salvar o Guia: "+e.message);}
    finally{state.busy=false;if(submit?.isConnected)submit.disabled=false;}
  }
  async function arrivalSubmit(form){
    if(state.busy||!canWrite())return;
    if(isClosed(currentDay()))return fail(form,"O expediente foi encerrado. Atualize a página.");
    const data=new FormData(form);
    const patientId=String(data.get("patient_id")||"");
    const guideId=String(data.get("guide_id")||"");
    const modalidade=String(data.get("modalidade")||"");
    let prioridade=String(data.get("prioridade")||"");
    const p=person(patientId);
    if(!p||!guide(guideId)||!MODES.some(m=>m[0]===modalidade)||!PRIORITIES.includes(prioridade))
      return fail(form,"Selecione paciente, Guia, modalidade e prioridade válidos.");
    if(PILOT_ONLY&&modalidade!=="presencial")
      return fail(form,"Atendimentos à distância dependem de autorização do Presidente. O cadastro de pacientes está liberado, não a passagem à distância.");
    if(afterArrivalDeadline())
      return fail(form,"Chegadas após 17h exigem autorização do Presidente. Use o procedimento manual autorizado.");
    if(isElderly(p)&&prioridade==="Normal")prioridade="Idoso";
    const submit=form.querySelector('[type="submit"]');
    state.busy=true;if(submit)submit.disabled=true;
    try{
      const {data:saved,error}=await client().from("barquinha_attendance_visits")
        .insert({patient_id:patientId,guide_id:guideId,modalidade,prioridade})
        .select(visitSelect).single();
      if(error)throw error;
      state.visits.unshift(saved);
      state.notice="Ficha "+ticket(saved)+" criada para o Guia "+guide(guideId).nome+".";
      if(!p.preferred_guide_id){
        const linked=await client().from("barquinha_attendance_patients")
          .update({preferred_guide_id:guideId}).eq("id",p.id).is("preferred_guide_id",null)
          .select("id,preferred_guide_id").maybeSingle();
        if(!linked.error&&linked.data)p.preferred_guide_id=linked.data.preferred_guide_id;
      }
      state.arrivalSearch="";
      navigateCallback("/atendimentos/fila");
      void reloadEvents();
    }catch(e){fail(form,"Não foi possível registrar a chegada: "+(e.message||e));}
    finally{state.busy=false;if(submit?.isConnected)submit.disabled=false;}
  }
  async function reloadEvents(){
    const {data,error}=await client().from("barquinha_attendance_events")
      .select("id,visit_id,previous_status,next_status,changed_at").order("changed_at",{ascending:false}).limit(5000);
    if(!error)state.events=data||[];
  }
  async function changeStatus(select){
    if(state.busy||!STATUSES.includes(select.value))return;
    const visit=state.visits.find(v=>v.id===select.dataset.liveStatus);
    if(!visit)return;
    if(isClosed(visit.service_date)){select.value=visit.status;state.error="O expediente já foi encerrado.";renderCallback();return;}
    const before=visit.status,newStatus=select.value;
    if(before===newStatus)return;
    select.disabled=true;state.busy=true;
    try{
      const {data,error}=await client().from("barquinha_attendance_visits")
        .update({status:newStatus}).eq("id",visit.id).eq("status",before)
        .select("id,status,status_changed_at").maybeSingle();
      if(error)throw error;
      if(!data)throw Error("A situação já foi alterada por outra pessoa. Atualize e tente novamente.");
      visit.status=data.status;visit.status_changed_at=data.status_changed_at;
      await reloadEvents();state.notice="Situação alterada de "+before+" para "+newStatus+".";
      renderCallback();
    }catch(e){select.value=before;state.error="Não foi possível alterar a situação: "+(e.message||e);renderCallback();}
    finally{state.busy=false;if(select.isConnected)select.disabled=false;}
  }
  function updateAgePreview(form){
    const age=ageAt(form.querySelector('[name="nascimento"]')?.value);
    const output=form.querySelector("#live-patient-age");if(!output)return;
    output.textContent=age===null?"Idade não informada":age+" anos"+(age>=60?" · IDOSO — prioridade automática":" · Classificação normal");
    output.classList.toggle("is-elderly",age!==null&&age>=60);
  }
  function updatePatientMode(form){
    const remote=form.querySelector('[name="modalidade_cadastro"]')?.value==="distancia";
    form.querySelector('[name="nascimento"]').required=!remote;
    form.querySelector('[name="endereco"]').required=remote;
    updateAgePreview(form);
  }
  async function openCamera(button){
    const form=button.closest("form"),video=form.querySelector("#live-camera-video");
    if(!navigator.mediaDevices?.getUserMedia)return fail(form,"Câmera indisponível: utilize o envio de fotografia.");
    stopCamera();
    try{
      state.cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});
      video.srcObject=state.cameraStream;video.hidden=false;
      await video.play();
      form.querySelector("[data-camera-capture]").hidden=false;
      form.querySelector("[data-camera-stop]").hidden=false;
    }catch(e){stopCamera();fail(form,"Não foi possível abrir a câmera. Confira as permissões ou envie uma fotografia: "+(e.message||e));}
  }
  async function captureCamera(button){
    const form=button.closest("form"),video=form.querySelector("#live-camera-video");
    if(!state.cameraStream||!video.videoWidth)return fail(form,"Aguarde a imagem da câmera.");
    const size=Math.min(video.videoWidth,video.videoHeight);
    const canvas=document.createElement("canvas");canvas.width=420;canvas.height=420;
    canvas.getContext("2d").drawImage(video,(video.videoWidth-size)/2,(video.videoHeight-size)/2,size,size,0,0,420,420);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.78));
    if(!blob)return fail(form,"Não foi possível capturar a fotografia.");
    state.cameraBlob=blob;
    const preview=form.querySelector("#live-camera-preview");
    preview.src=URL.createObjectURL(blob);preview.hidden=false;
    stopCamera();video.hidden=true;
    form.querySelector("[data-camera-capture]").hidden=true;form.querySelector("[data-camera-stop]").hidden=true;
  }
  function syncArrivalPatient(select){
    const form=select.closest("form"),p=person(select.value);
    if(!form||!p)return;
    const guideSelect=form.querySelector('[name="guide_id"]');
    if(p.preferred_guide_id&&[...guideSelect.options].some(o=>o.value===p.preferred_guide_id))
      guideSelect.value=p.preferred_guide_id;
    const priority=form.querySelector('[name="prioridade"]');
    priority.value=isElderly(p)?"Idoso":"Normal";
    const output=form.querySelector("#live-arrival-age-note");
    const age=ageAt(p.nascimento);
    output.textContent=age===null?"Idade não informada: selecione a prioridade manualmente.":age+" anos"+(age>=60?" · PRIORIDADE IDOSO automática":" · Classificação normal");
    output.classList.toggle("is-elderly",age!==null&&age>=60);
  }
  function filterArrivalPatients(input){
    const form=input.closest("form"),select=form.querySelector('[name="patient_id"]');
    state.arrivalSearch=input.value;
    const matches=state.patients.filter(p=>normalize(p.nome).includes(normalize(input.value)));
    const previous=select.value;
    select.innerHTML='<option value="">Selecione um paciente ('+matches.length+' encontrados)</option>'+
      matches.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nome)+' · '+fmtDay(p.nascimento)+'</option>').join("");
    if(matches.some(p=>p.id===previous))select.value=previous;
    if(select.value)syncArrivalPatient(select);
  }
  function handleClick(event){
    const target=event.target;
    if(target.closest("[data-live-start]")){event.preventDefault();void startSession();return true;}
    if(target.closest("[data-live-finish]")){event.preventDefault();void finishSession();return true;}
    if(target.closest("[data-live-print]")){event.preventDefault();printSessionReport();return true;}
    const open=target.closest("[data-camera-open]");
    if(open){event.preventDefault();void openCamera(open);return true;}
    const capture=target.closest("[data-camera-capture]");
    if(capture){event.preventDefault();void captureCamera(capture);return true;}
    const stop=target.closest("[data-camera-stop]");
    if(stop){event.preventDefault();stopCamera();const f=stop.closest("form");f.querySelector("#live-camera-video").hidden=true;
      f.querySelector("[data-camera-capture]").hidden=true;stop.hidden=true;return true;}
    const refreshButton=target.closest("[data-live-refresh]");
    if(refreshButton){event.preventDefault();refresh();return true;}
    const tab=target.closest("[data-live-tab]");
    if(tab){event.preventDefault();state.profileTab=tab.dataset.liveTab;renderCallback();return true;}
    return false;
  }
  function handleSubmit(event){
    const form=event.target;
    if(form?.id==="live-patient-form"){event.preventDefault();void patientSubmit(form);return true;}
    if(form?.id==="live-guide-form"){event.preventDefault();void guideSubmit(form);return true;}
    if(form?.id==="live-arrival-form"){event.preventDefault();void arrivalSubmit(form);return true;}
    return false;
  }
  function handleChange(event){
    const target=event.target;
    if(target?.id==="live-guide-filter"){state.filter=target.value;renderCallback();return true;}
    if(target?.matches?.("[data-live-status]")){void changeStatus(target);return true;}
    if(target?.name==="modalidade_cadastro"){updatePatientMode(target.closest("form"));return true;}
    if(target?.name==="nascimento"){updateAgePreview(target.closest("form"));return true;}
    if(target?.name==="patient_id"&&target.closest("#live-arrival-form")){syncArrivalPatient(target);return true;}
    return false;
  }
  function handleInput(event){
    const target=event.target;
    if(target?.id==="live-arrival-search"){filterArrivalPatients(target);return true;}
    if(target?.id==="live-patient-birth"){updateAgePreview(target.closest("form"));return true;}
    if(target?.id!=="live-patient-search")return false;
    state.search=target.value;
    const pos=target.selectionStart;renderCallback();
    const next=document.getElementById("live-patient-search");
    if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch(e){}}
    return true;
  }
  function syncQuietly(){
    if(state.loaded&&state.access&&!state.loading&&!state.busy)void load();
  }
  window.AttendanceLive={connect,page,handleClick,handleSubmit,handleChange,handleInput,syncQuietly,clear:()=>resetFor(null)};
})();