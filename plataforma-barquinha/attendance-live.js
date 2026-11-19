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
  const PILOT_ONLY=false;
  function afterArrivalDeadline(){
    const hour=Number(new Intl.DateTimeFormat("en-GB",{
      timeZone:"America/Fortaleza",hour:"2-digit",hourCycle:"h23"
    }).format(new Date()));
    return hour>=17;
  }
  const PHOTO_BUCKET="barquinha-attendance-photos";
  const state={userId:null,loaded:false,loading:false,error:"",notice:"",access:null,
    guides:[],patients:[],visits:[],events:[],closures:[],filter:"todos",search:"",profileTab:"dados",arrivalSearch:"",webcamStream:null,webcamBlob:null,editId:null,
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
  const pill=status=>'<span class="pill '+(status==="Concluído"?"green":status==="Chamado"?"blue":status==="Cancelado"?"red":"")+'">'+esc(status)+'</span>';
  const alertBox=text=>'<div class="note warn" role="alert">'+esc(text)+'</div>';
  const field=(name,label,type,required,extra)=>'<label>'+esc(label)+(required?" *":"")+
    '<input name="'+name+'" type="'+type+'" '+(required?"required ":"")+(extra||"")+'></label>';
  const nav=(tabs)=>tabs||"";
  const canWrite=()=>["administrador","recepcao"].includes(state.access?.access_role);
  const canChangeStatus=()=>["administrador","recepcao","guia"].includes(state.access?.access_role);
  const isClosed=()=>state.closures.some(c=>c.service_date===currentDay());
  const officialTicket=v=>(v.ficha_tipo==="P"?"P":"")+String(v.ficha_numero||v.ordem||0).padStart(2,"0");
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
    stopWebcam();state.guides=[];state.patients=[];state.visits=[];state.events=[];state.closures=[];state.notice="";state.arrivalSearch="";state.editId=null;
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
        client().from("barquinha_attendance_patients").select("id,nome,nascimento,telefone,cpf,encaminhamento,foto_path,created_at,cadastro_modalidade,endereco,guide_id").order("nome"),
        client().from("barquinha_attendance_visits").select("id,ordem,ficha_tipo,ficha_numero,patient_id,guide_id,service_date,modalidade,prioridade,status,created_at,status_changed_at").order("created_at",{ascending:false}).limit(5000),
        client().from("barquinha_attendance_events").select("id,visit_id,previous_status,next_status,changed_at").order("changed_at",{ascending:false}).limit(5000),
        client().from("barquinha_attendance_closures").select("service_date,closed_at,closed_by").order("service_date",{ascending:false}).limit(100)
      ];
      const results=await Promise.all(requests);
      for(const result of results)if(result.error)throw result.error;
      if(auth()?.user?.id!==userId)return;
      [state.guides,state.patients,state.visits,state.events,state.closures]=results.map(r=>r.data||[]);
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
    if(!state.loaded&&!state.loading)queueMicrotask(load);
    if(!state.loaded)return nav(tabs)+'<div class="panel attendance-placeholder">Carregando dados protegidos de Atendimentos…</div>';
    if(state.error)return nav(tabs)+info();
    if(!state.access)return nav(tabs)+alertBox("Este usuário não possui autorização para acessar os dados de Atendimentos. Solicite liberação à administração.");
    let inner;
    if(route==="/atendimentos/novo-paciente")inner=patientForm();
    else if(route.startsWith("/atendimentos/editar-paciente/"))inner=patientForm(person(route.split("/")[3]));
    else if(route==="/atendimentos/nova-chegada")inner=arrivalForm();
    else if(route.startsWith("/atendimentos/paciente/"))inner=patientDetail(route);
    else if(route==="/atendimentos/pacientes")inner=patientsPage();
    else if(route==="/atendimentos/guias")inner=guidesPage();
    else if(route==="/atendimentos/autorizacoes")inner=deferred("Autorizações","As regras de autorização e exceções serão ativadas após a conclusão do fluxo básico.");
    else if(route==="/atendimentos/expediente")inner=shiftPage();
    else inner=queuePage();
    const previewNotice='<div class="note" role="status"><strong>Atendimentos Barquinha.</strong> Fichas por Guia: 01, 02… e prioritárias P01, P02…. Cadastros à distância são permitidos com nome e endereço; a realização de atendimentos remotos ainda exige autorização do Presidente.</div>';
    return nav(tabs)+previewNotice+info()+inner;
  }
  function deferred(title,detail){return '<section class="intro"><div class="eyebrow">EM PREPARAÇÃO</div><h1>'+esc(title)+'</h1><p>'+esc(detail)+'</p></section>';}
  function title(t,description){return '<section class="intro"><div class="eyebrow">ATENDIMENTOS BARQUINHA</div><h1>'+esc(t)+'</h1><p>'+esc(description)+'</p></section>';}
  function queuePage(){
    const day=currentDay(),today=state.visits.filter(v=>v.service_date===day);
    const pending=today.filter(v=>!CLOSED.has(v.status));
    const completed=today.filter(v=>CLOSED.has(v.status));
    const selected=state.guides.filter(g=>g.ativo&&(state.filter==="todos"||g.id===state.filter));
    const filter='<option value="todos">Todos os Guias</option>'+state.guides.filter(g=>g.ativo).map(g=>
      '<option value="'+esc(g.id)+'"'+(g.id===state.filter?' selected':'')+'>'+esc(g.nome)+'</option>').join("");
    const locked=isClosed();
    const columns=selected.map(g=>{
      const visits=today.filter(v=>v.guide_id===g.id).sort((a,b)=>{
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
          '</select></div></div>';
      }).join("");
      return '<section class="queue-guide-column"><div class="queue-guide-header" style="border-top-color:'+esc(g.cor)+
        '"><div class="queue-guide-info"><span class="guide-dot" style="background:'+esc(g.cor)+'"></span><h3 title="Guia '+esc(g.nome)+'">Guia '+esc(g.nome)+'</h3></div>'+
        '<span class="pill blue">'+visits.length+' registrado(s)</span></div><div class="queue-guide-body">'+
        (body||'<div class="queue-empty">Nenhum atendimento registrado hoje.</div>')+'</div>'+
        '<div class="queue-guide-total">Total do Guia: <strong>'+visits.length+'</strong></div></section>';
    }).join("");
    const buttons=canWrite()?'<button class="button" type="button" data-go="/atendimentos/nova-chegada"'+(locked?' disabled':'')+
      '>＋ Registrar chegada</button><button class="button secondary" type="button" data-go="/atendimentos/novo-paciente">＋ Cadastrar paciente</button>':"";
    return title("Fila Geral — Atendimento do Dia","Fichas por Guia de "+fmtDay(day)+
      " · Prioritárias P01, P02… e normais 01, 02…, em listas independentes.")+
      (locked?'<div class="note">Expediente encerrado. Os registros permanecem visíveis e o relatório está disponível na aba Expediente.</div>':'')+
      '<div class="metrics"><div class="metric"><strong>'+pending.length+'</strong><span>Em andamento</span></div>'+
      '<div class="metric"><strong>'+completed.length+'</strong><span>Finalizados hoje</span></div>'+
      '<div class="metric"><strong>'+today.length+'</strong><span>Total de atendimentos hoje</span></div></div>'+
      '<div class="filters"><div class="queue-actions"><h3>Fila geral por Guia</h3>'+buttons+
      '<button type="button" class="button ghost" data-live-refresh>↻ Atualizar</button></div>'+
      '<label>Visualizar <select id="live-guide-filter">'+filter+'</select></label></div>'+
      (!state.guides.length?alertBox("Nenhum Guia cadastrado. Abra a aba Guias para começar."):"")+
      '<p class="queue-hint">'+(selected.length>=6?"Use a rolagem horizontal para ver todos os Guias.":"Até cinco Guias são exibidos juntos, aproveitando toda a largura da tela.")+
      ' Pacientes continuam visíveis independentemente do status; saem somente da fila diária quando muda a data.</p>'+
      '<div class="queue-board-scroll" role="region" tabindex="0" aria-label="Filas de atendimentos por Guia">'+
      '<div class="queue-board'+(selected.length===1?" single":"")+(selected.length>=6?" is-scroll":"")+
      '" data-guide-count="'+selected.length+'" style="--guide-count:'+Math.max(selected.length,1)+'">'+columns+'</div></div>';
  }
  function patientForm(patient=null){
    if(!canWrite())return alertBox("Sua função não permite cadastrar ou editar pacientes.");
    const p=patient||{},edit=!!patient;
    const optionValue=(name,value)=>' value="'+esc(value||"")+'"';
    return '<button class="breadcrumb" type="button" data-go="'+(edit?'/atendimentos/paciente/'+esc(p.id):'/atendimentos/pacientes')+
      '">← Voltar</button>'+
      title(edit?"Editar paciente":"Cadastrar paciente","O Guia será sugerido automaticamente em cada chegada. Atendimento à distância pode ser cadastrado apenas com nome e endereço; sua realização exige autorização separada.")+
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
      '<label>Telefone<input name="telefone" type="tel" maxlength="40"'+optionValue("telefone",p.telefone)+'></label>'+
      '<label>CPF<input name="cpf" type="text" maxlength="14" inputmode="numeric" autocomplete="off"'+optionValue("cpf",p.cpf)+'></label>'+
      '<label>Guia <select name="guide_id">'+selectGuide(p.guide_id||"","Selecione o Guia")+'</select></label>'+
      '<label class="patient-address-field">Endereço do paciente'+
      '<textarea name="endereco" id="live-patient-address" maxlength="900" rows="3"'+
      (p.cadastro_modalidade==="distancia"?' required':'')+' placeholder="Rua, número, bairro, cidade, referência…">'+esc(p.endereco||"")+'</textarea>'+
      '<small>Obrigatório para cadastro à distância.</small></label>'+
      '<label>Fotografia<input type="file" name="foto" accept="image/jpeg,image/png,image/webp" capture="environment">'+
      '<small>JPG/PNG/WebP, compactada para armazenamento privado.</small></label>'+
      '<div class="webcam-controls"><button type="button" class="button ghost" data-live-camera-start>📷 Abrir webcam</button>'+
      '<button type="button" class="button ghost" data-live-camera-capture hidden>Capturar foto</button>'+
      '<button type="button" class="button ghost" data-live-camera-stop hidden>Fechar câmera</button>'+
      '<video id="live-webcam" autoplay muted playsinline hidden aria-label="Visualização da webcam"></video>'+
      '<div id="live-camera-preview" aria-live="polite"></div></div></div>'+
      '<div class="attendance-form-error" role="alert" hidden></div><div class="patient-form-actions">'+
      '<button type="button" class="button ghost" data-go="'+(edit?'/atendimentos/paciente/'+esc(p.id):'/atendimentos/pacientes')+'">Cancelar</button>'+
      '<button type="submit" class="button">'+(edit?"Salvar alterações":"Salvar paciente")+'</button></div></form>';
  }
  const patientOptionText=p=>p.nome+" · "+fmtDay(p.nascimento)+" · "+p.id.slice(0,6);
  function arrivalForm(){
    if(!canWrite())return alertBox("Sua função não permite registrar chegadas.");
    const options=state.patients.map(p=>'<option value="'+esc(patientOptionText(p))+'"></option>').join("");
    const guides=state.guides.filter(g=>g.ativo).map(g=>'<option value="'+esc(g.id)+'">'+esc(g.nome)+'</option>').join("");
    return '<button class="breadcrumb" type="button" data-go="/atendimentos/fila">← Voltar à fila</button>'+
      title("Registrar chegada","Digite as primeiras letras do nome do paciente. O Guia já associado será preenchido automaticamente.")+
      (isClosed()?alertBox("O expediente de hoje foi encerrado. Novas chegadas estão bloqueadas."):'')+
      (!options||!guides?alertBox("Cadastre pelo menos um paciente e um Guia antes de registrar uma chegada."):"")+
      '<form id="live-arrival-form" class="panel attendance-form"><div class="patient-fields">'+
      '<label>Paciente *<input type="search" name="patient_name" id="live-arrival-patient-search" list="live-patient-options" required placeholder="Digite o nome para localizar…" autocomplete="off">'+
      '<datalist id="live-patient-options">'+options+'</datalist></label>'+
      '<label>Guia *<select name="guide_id" id="live-arrival-guide" required><option value="">Selecione o Guia</option>'+guides+'</select></label>'+
      '<label>Modalidade *<select name="modalidade"><option value="presencial">Presencial</option></select>'+
      '<small>Atendimento à distância e trabalhadores da casa: aguardam autorização do Presidente.</small></label>'+
      '<label>Prioridade *<select name="prioridade" id="live-arrival-priority">'+priorityOptions()+'</select>'+
      '<small id="live-arrival-age-hint">A prioridade Idoso será preenchida quando o paciente tiver 60 anos ou mais.</small></label>'+
      '</div><div class="attendance-form-error" role="alert" hidden></div><div class="patient-form-actions">'+
      '<button class="button ghost" type="button" data-go="/atendimentos/fila">Cancelar</button>'+
      '<button class="button" type="submit"'+(!options||!guides||isClosed()?' disabled':'')+'>Emitir ficha e registrar chegada</button></div></form>';
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
    if(state.profileTab==="dados")details='<dl><div><dt>Modalidade</dt><dd>'+
      esc(MODES.find(m=>m[0]===p.cadastro_modalidade)?.[1]||"Presencial")+'</dd></div>'+
      '<div><dt>Nascimento</dt><dd>'+fmtDay(p.nascimento)+'</dd></div>'+
      '<div><dt>Idade</dt><dd>'+(ageYears(p.nascimento)===null?"Não informada":ageYears(p.nascimento)+" anos")+'</dd></div>'+
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
    const current=selected?'<div class="attendance-current"><div class="guide-highlight"><i style="background:'+esc(guide(selected.guide_id)?.cor||"#467C9C")+'"></i>'+
      '<div><strong>Atendimento selecionado · Guia '+esc(guide(selected.guide_id)?.nome||"—")+'</strong>'+
      '<div class="muted">Ficha '+officialTicket(selected)+' · Chegada '+selected.ordem+' · '+fmtDay(selected.service_date)+' · '+esc(selected.prioridade)+'</div></div></div>'+
      '<div class="attendance-status-control"><label>Situação do atendimento <select data-live-status="'+esc(selected.id)+'">'+STATUSES.map(st=>
      '<option value="'+esc(st)+'"'+(selected.status===st?" selected":"")+'>'+esc(st)+'</option>').join("")+'</select></label>'+
      pill(selected.status)+'</div></div>':"";
    return '<button class="breadcrumb" data-go="/atendimentos/pacientes">← Voltar aos pacientes</button>'+
      '<section class="profile"><div class="profile-header">'+img+'<div><h2>'+esc(p.nome)+'</h2>'+
      '<div class="muted">Ficha individual · dados protegidos</div></div></div>'+current+
      '<div class="module-tabs" role="group" aria-label="Seções da ficha">'+[["dados","Dados"],["historico","Histórico"],["materiais","Materiais"]].map(t=>
      '<button class="tab '+(state.profileTab===t[0]?"active":"")+'" data-live-tab="'+t[0]+'">'+t[1]+'</button>').join("")+'</div>'+details+
      (canWrite()?'<div class="attendance-detail-actions"><button class="button ghost" type="button" data-go="/atendimentos/editar-paciente/'+esc(p.id)+'">✎ Editar informações</button><button class="button" type="button" data-go="/atendimentos/nova-chegada">＋ Novo atendimento</button></div>':"")+
      '</section>';
  }

  function reportTable(date){
    const today=state.visits.filter(v=>v.service_date===date);
    const usedGuideIds=[...new Set(today.map(v=>v.guide_id))];
    const gids=usedGuideIds.sort((a,b)=>(guide(a)?.nome||"").localeCompare(guide(b)?.nome||"","pt-BR"));
    const rows=gids.map(guideId=>{
      const visits=today.filter(v=>v.guide_id===guideId).sort((a,b)=>
        (a.ficha_tipo==="P"?0:1)-(b.ficha_tipo==="P"?0:1)||
        (a.ficha_numero||a.ordem)-(b.ficha_numero||b.ordem));
      const title=guide(guideId)?.nome||"Guia não encontrado";
      return visits.map(v=>'<tr><td>'+officialTicket(v)+'</td><td>'+
        esc(person(v.patient_id)?.nome||"Paciente")+'</td><td>'+esc(title)+'</td><td>'+
        esc(v.status)+'</td></tr>').join("")+
        '<tr class="attendance-report-subtotal"><td colspan="3">Total de atendimentos — Guia '+
        esc(title)+'</td><td>'+visits.length+'</td></tr>';
    }).join("");
    const fallback=today.length?"":'<tr><td colspan="4">Nenhum atendimento registrado nesta data.</td></tr>';
    return '<section id="attendance-print-report" class="attendance-report">'+
      '<h2>Barquinha — Lista oficial de atendimentos</h2><p>Data do atendimento: <strong>'+fmtDay(date)+'</strong></p>'+
      '<table><thead><tr><th>Ordem de Atendimento</th><th>Nome Paciente</th><th>Guia</th><th>Situação</th></tr></thead>'+
      '<tbody>'+rows+fallback+
      '<tr class="attendance-report-total"><td colspan="3">TOTAL GERAL DE ATENDIMENTOS</td><td>'+
      today.length+'</td></tr></tbody></table>'+
      '<div class="attendance-report-signature"><div>____________________________________________</div>'+
      '<strong>Assinatura do(a) Recepcionista</strong><span>Data: '+fmtDay(date)+'</span></div></section>';
  }
  function shiftPage(){
    const day=currentDay(),closed=state.closures.find(c=>c.service_date===day);
    const count=state.visits.filter(v=>v.service_date===day).length;
    const header=title("Encerramento dos Atendimentos",
      "Ao finalizar o dia, todos os pacientes registrados entram na lista oficial, inclusive Concluído, Não compareceu e Desistente.");
    const actions=closed?
      '<div class="note">Expediente encerrado em '+fmtTime(closed.closed_at)+'. A lista foi preservada.</div>'+
      '<button type="button" class="button" data-live-print>Imprimir ou salvar a lista em PDF</button>':
      '<div class="note warn">Existem '+count+' atendimento(s) registrados para hoje. Encerre somente após o último paciente.</div>'+
      (canWrite()?'<button type="button" class="button" data-live-close-day>Finalizar Atendimentos e emitir lista</button>':'');
    return header+'<div class="attendance-shift-controls">'+actions+'</div>'+
      (closed?reportTable(day):'<div class="panel attendance-placeholder">A lista oficial com assinatura será emitida após o encerramento.</div>');
  }
  async function closeDay(){
    if(!canWrite()||state.busy||isClosed())return;
    if(!confirm("Encerrar o atendimento de "+fmtDay(currentDay())+
      "? A fila ficará bloqueada para novas chegadas e alterações. A lista oficial será emitida."))return;
    state.busy=true;
    try{
      const {data,error}=await client().from("barquinha_attendance_closures")
        .insert({service_date:currentDay()}).select("service_date,closed_at,closed_by").single();
      if(error)throw error;
      state.closures.push(data);
      state.notice="Atendimentos encerrados. Lista oficial preparada para impressão.";
    }catch(e){state.error="Não foi possível encerrar: "+(e.message||e);}
    finally{state.busy=false;renderCallback();}
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
    const data=new FormData(form);
    const patientLabel=String(data.get("patient_name")||"").trim();
    const matched=state.patients.filter(p=>patientOptionText(p)===patientLabel);
    const patient=matched.length===1?matched[0]:null;
    const guideId=String(data.get("guide_id")||""),
      modalidade=String(data.get("modalidade")||"presencial"),
      prioridade=String(data.get("prioridade")||"Normal");
    if(!patient)return fail(form,"Selecione um paciente válido na lista de sugestões pelo nome.");
    if(!guide(guideId)||!PRIORITIES.includes(prioridade))
      return fail(form,"Selecione um Guia e a prioridade.");
    if(modalidade!=="presencial")
      return fail(form,"Atendimentos à distância dependem de autorização do Presidente; o cadastro do paciente está disponível separadamente.");
    if(isClosed())return fail(form,"O expediente de hoje já foi encerrado.");
    if(afterArrivalDeadline())
      return fail(form,"Chegadas após 17h exigem autorização do Presidente. Este procedimento ainda está em preparação.");
    const priority=agePriority(patient.nascimento)&&prioridade==="Normal"?"Idoso":prioridade;
    const submit=form.querySelector('[type="submit"]');state.busy=true;if(submit)submit.disabled=true;
    try{
      const {data:saved,error}=await client().from("barquinha_attendance_visits")
        .insert({patient_id:patient.id,guide_id:guideId,modalidade,prioridade:priority})
        .select("id,ordem,ficha_tipo,ficha_numero,patient_id,guide_id,service_date,modalidade,prioridade,status,created_at,status_changed_at").single();
      if(error)throw error;
      state.visits.unshift(saved);
      state.notice="Chegada registrada. Ficha "+officialTicket(saved)+" do Guia "+(guide(guideId)?.nome||"")+
        " (ordem global de chegada "+saved.ordem+").";
      navigateCallback("/atendimentos/fila");void reloadEvents();
    }catch(e){fail(form,"Não foi possível registrar a chegada: "+(e.message||e));}
    finally{state.busy=false;if(submit?.isConnected)submit.disabled=false;}
  }
  async function reloadEvents(){
    const {data,error}=await client().from("barquinha_attendance_events")
      .select("id,visit_id,previous_status,next_status,changed_at").order("changed_at",{ascending:false}).limit(5000);
    if(!error)state.events=data||[];
  }
  async function changeStatus(select){
    if(state.busy||!canChangeStatus()||isClosed()||!STATUSES.includes(select.value))return;
    const visit=state.visits.find(v=>v.id===select.dataset.liveStatus);
    if(!visit)return;
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
  function syncArrivalPatient(){
    const input=document.getElementById("live-arrival-patient-search");
    if(!input)return;
    const matched=state.patients.filter(p=>patientOptionText(p)===input.value.trim());
    const p=matched.length===1?matched[0]:null;
    const guideSelect=document.getElementById("live-arrival-guide");
    const priority=document.getElementById("live-arrival-priority");
    const hint=document.getElementById("live-arrival-age-hint");
    if(p){
      if(guideSelect&&p.guide_id&&guide(p.guide_id))guideSelect.value=p.guide_id;
      if(priority)priority.value=agePriority(p.nascimento)?"Idoso":"Normal";
      if(hint)hint.textContent=ageYears(p.nascimento)===null?
        "Idade não informada. Selecione a prioridade aplicável.":
        "Idade: "+ageYears(p.nascimento)+" anos"+(agePriority(p.nascimento)?" — PRIORIDADE IDOSO":" — classificação normal");
    }else if(hint){hint.textContent="Digite e selecione um paciente da lista para preencher o Guia e a idade.";}
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
  function handleClick(event){
    const refreshButton=event.target.closest("[data-live-refresh]");
    if(refreshButton){event.preventDefault();refresh();return true;}
    const tab=event.target.closest("[data-live-tab]");
    if(tab){event.preventDefault();state.profileTab=tab.dataset.liveTab;renderCallback();return true;}
    if(event.target.closest("[data-live-camera-start]")){event.preventDefault();void startWebcam();return true;}
    if(event.target.closest("[data-live-camera-capture]")){event.preventDefault();void captureWebcam();return true;}
    if(event.target.closest("[data-live-camera-stop]")){event.preventDefault();stopWebcam();return true;}
    if(event.target.closest("[data-live-close-day]")){event.preventDefault();void closeDay();return true;}
    if(event.target.closest("[data-live-print]")){event.preventDefault();window.print();return true;}
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
    if(target?.id==="live-patient-mode"||target?.id==="live-patient-birth"){syncPatientForm();return true;}
    if(target?.id==="live-arrival-patient-search"){syncArrivalPatient();return true;}
    if(target?.matches?.("[data-live-status]")){void changeStatus(target);return true;}
    return false;
  }
  function handleInput(event){
    const t=event.target;
    if(t?.id==="live-patient-birth"||t?.id==="live-patient-mode"){syncPatientForm();return true;}
    if(t?.id==="live-arrival-patient-search"){syncArrivalPatient();return true;}
    if(t?.id!=="live-patient-search")return false;
    state.search=t.value;
    const pos=t.selectionStart;renderCallback();
    const next=document.getElementById("live-patient-search");
    if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch(e){}}
    return true;
  }
  function syncQuietly(){
    if(state.loaded&&state.access&&!state.loading&&!state.busy)void load();
  }
  window.AttendanceLive={connect,page,handleClick,handleSubmit,handleChange,handleInput,syncQuietly,clear:()=>resetFor(null)};
})();