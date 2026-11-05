"use strict";
/* Atendimentos Barquinha: módulo persistente isolado do Projetos.
   Dados pessoais ficam no Supabase com RLS; sem localStorage nem dados fictícios. */
(() => {
  const STATUSES=["Aguardando","Chamado","Em atendimento","Concluído","Não compareceu","Cancelado"];
  const PRIORITIES=["Normal","Idoso","Gestante","Deficiência","Outra"];
  const MODES=[["presencial","Presencial"],["distancia","À distância"],["trabalhador","Trabalhador da casa"]];
  const CLOSED=new Set(["Concluído","Não compareceu","Cancelado"]);
  const PHOTO_BUCKET="barquinha-attendance-photos";
  const state={userId:null,loaded:false,loading:false,error:"",notice:"",access:null,
    guides:[],patients:[],visits:[],events:[],filter:"todos",search:"",profileTab:"dados",
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
  function connect(render,navigate){renderCallback=render;navigateCallback=navigate;}
  function resetFor(userId){
    state.userId=userId;state.loaded=false;state.loading=false;state.error="";state.access=null;
    state.guides=[];state.patients=[];state.visits=[];state.events=[];state.notice="";
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
        client().from("barquinha_attendance_patients").select("id,nome,nascimento,telefone,cpf,encaminhamento,foto_path,created_at").order("nome"),
        client().from("barquinha_attendance_visits").select("id,ordem,patient_id,guide_id,service_date,modalidade,prioridade,status,created_at,status_changed_at").order("created_at",{ascending:false}).limit(3000),
        client().from("barquinha_attendance_events").select("id,visit_id,previous_status,next_status,changed_at").order("changed_at",{ascending:false}).limit(5000)
      ];
      const results=await Promise.all(requests);
      for(const result of results)if(result.error)throw result.error;
      if(auth()?.user?.id!==userId)return;
      [state.guides,state.patients,state.visits,state.events]=results.map(r=>r.data||[]);
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
    else if(route==="/atendimentos/nova-chegada")inner=arrivalForm();
    else if(route.startsWith("/atendimentos/paciente/"))inner=patientDetail(route);
    else if(route==="/atendimentos/pacientes")inner=patientsPage();
    else if(route==="/atendimentos/guias")inner=guidesPage();
    else if(route==="/atendimentos/autorizacoes")inner=deferred("Autorizações","As regras de autorização e exceções serão ativadas após a conclusão do fluxo básico.");
    else if(route==="/atendimentos/expediente")inner=deferred("Expediente","A abertura e o encerramento do expediente serão implementados em uma etapa posterior.");
    else inner=queuePage();
    const previewNotice=location.hostname?.startsWith("plataforma-barquinha-preview")?"<div class=\"note warn\"><strong>Ambiente de homologação.</strong> Utilize cadastros fictícios até concluir a validação do atendimento e a revisão de proteção de dados.</div>":"";
    return nav(tabs)+previewNotice+info()+inner;
  }
  function deferred(title,detail){return '<section class="intro"><div class="eyebrow">EM PREPARAÇÃO</div><h1>'+esc(title)+'</h1><p>'+esc(detail)+'</p></section>';}
  function title(t,description){return '<section class="intro"><div class="eyebrow">ATENDIMENTOS BARQUINHA</div><h1>'+esc(t)+'</h1><p>'+esc(description)+'</p></section>';}
  function queuePage(){
    const day=currentDay(),active=state.visits.filter(v=>v.service_date===day&&!CLOSED.has(v.status));
    const completed=state.visits.filter(v=>v.service_date===day&&CLOSED.has(v.status));
    const selected=state.guides.filter(g=>g.ativo&&(state.filter==="todos"||g.id===state.filter));
    const filter='<option value="todos">Todos os Guias</option>'+state.guides.filter(g=>g.ativo).map(g=>
      '<option value="'+esc(g.id)+'"'+(g.id===state.filter?' selected':'')+'>'+esc(g.nome)+'</option>').join("");
    const columns=selected.map(g=>{
      const visits=active.filter(v=>v.guide_id===g.id).sort((a,b)=>{
        const priority=p=>p.prioridade==="Normal"?1:0;
        return priority(a)-priority(b)||a.ordem-b.ordem;
      });
      const body=visits.map(v=>{
        const p=person(v.patient_id);
        if(!p)return "";
        return '<button type="button" class="queue-card" data-go="/atendimentos/paciente/'+esc(p.id)+'/'+esc(v.id)+
          '" aria-label="Abrir atendimento de '+esc(p.nome)+'"><span class="queue-row"><span class="guide-rail" style="background:'+esc(g.cor)+
          '"></span><span class="queue-inner"><span class="ticket">'+String(v.ordem).padStart(2,"0")+'</span><span class="queue-details"><strong>'+esc(p.nome)+
          '</strong><small>'+esc(v.prioridade)+" · "+esc(MODES.find(m=>m[0]===v.modalidade)?.[1]||v.modalidade)+
          '</small></span><span class="queue-status">'+pill(v.status)+'</span><span class="chevron" aria-hidden="true">›</span></span></span></button>';
      }).join("");
      return '<section class="queue-guide-column"><div class="queue-guide-header" style="border-top-color:'+esc(g.cor)+
        '"><div class="queue-guide-info"><span class="guide-dot" style="background:'+esc(g.cor)+'"></span><h3>Guia '+esc(g.nome)+'</h3></div>'+
        '<span class="pill blue">'+visits.length+' na fila</span></div><div class="queue-guide-body">'+(body||'<div class="queue-empty">Nenhum atendimento aguardando.</div>')+'</div></section>';
    }).join("");
    const buttons=canWrite()?'<button class="button" type="button" data-go="/atendimentos/nova-chegada">＋ Registrar chegada</button>'+
      '<button class="button secondary" type="button" data-go="/atendimentos/novo-paciente">＋ Cadastrar paciente</button>':"";
    return title("Atendimento do Dia","Fila real de "+fmtDay(day)+" · As colunas são organizadas por Guia e atualizadas após cada alteração.")+
      '<div class="metrics"><div class="metric"><strong>'+active.length+'</strong><span>Na fila</span></div>'+
      '<div class="metric"><strong>'+completed.length+'</strong><span>Finalizados hoje</span></div>'+
      '<div class="metric"><strong>'+state.patients.length+'</strong><span>Pacientes cadastrados</span></div></div>'+
      '<div class="filters"><div class="queue-actions"><h3>Fila geral por Guia</h3>'+buttons+
      '<button type="button" class="button ghost" data-live-refresh>↻ Atualizar</button></div>'+
      '<label>Visualizar <select id="live-guide-filter">'+filter+'</select></label></div>'+
      (!state.guides.length?alertBox("Nenhum Guia cadastrado. Abra a aba Guias para começar."):"")+
      '<p class="queue-hint">Deslize as colunas horizontalmente no celular. Atendimentos encerrados saem da fila, mas permanecem no histórico.</p>'+
      '<div class="queue-board-scroll" role="region" tabindex="0" aria-label="Filas de atendimentos por Guia">'+
      '<div class="queue-board'+(selected.length===1?" single":"")+'" style="--guide-count:'+selected.length+'">'+columns+'</div></div>';
  }
  function patientForm(){
    if(!canWrite())return alertBox("Sua função não permite cadastrar pacientes.");
    return '<button class="breadcrumb" type="button" data-go="/atendimentos/pacientes">← Voltar aos pacientes</button>'+
      title("Cadastrar paciente","O cadastro é único; a chegada para atendimento é registrada separadamente.")+
      '<form id="live-patient-form" class="panel attendance-form"><div class="patient-fields">'+
      field("nome","Nome completo","text",true,'maxlength="160" autocomplete="name"')+
      field("nascimento","Data de nascimento","date",true,'max="'+currentDay()+'"')+
      field("telefone","Telefone","tel",false,'maxlength="40"')+
      field("cpf","CPF (opcional)","text",false,'maxlength="14" inputmode="numeric" autocomplete="off"')+
      field("encaminhamento","Encaminhamento / indicação (opcional)","text",false,'maxlength="250"')+
      '<label>Fotografia (opcional)<input type="file" name="foto" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG ou WebP, até 2 MB após compactação. Armazenamento privado.</small></label></div>'+
      '<div class="attendance-form-error" role="alert" hidden></div><div class="patient-form-actions">'+
      '<button type="button" class="button ghost" data-go="/atendimentos/pacientes">Cancelar</button>'+
      '<button type="submit" class="button">Salvar paciente</button></div></form>';
  }
  function arrivalForm(){
    if(!canWrite())return alertBox("Sua função não permite registrar chegadas.");
    const options=state.patients.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.nome)+' · '+fmtDay(p.nascimento)+'</option>').join("");
    const guides=state.guides.filter(g=>g.ativo).map(g=>'<option value="'+esc(g.id)+'">'+esc(g.nome)+'</option>').join("");
    return '<button class="breadcrumb" type="button" data-go="/atendimentos/fila">← Voltar à fila</button>'+
      title("Registrar chegada","Selecione o paciente e o Guia. Um paciente pode ter vários atendimentos no mesmo dia.")+
      (!options||!guides?alertBox("Cadastre pelo menos um paciente e um Guia antes de registrar uma chegada."):"")+
      '<form id="live-arrival-form" class="panel attendance-form"><div class="patient-fields">'+
      '<label>Paciente *<select name="patient_id" required><option value="">Selecione um paciente</option>'+options+'</select></label>'+
      '<label>Guia *<select name="guide_id" required><option value="">Selecione um Guia</option>'+guides+'</select></label>'+
      '<label>Modalidade *<select name="modalidade">'+MODES.map(m=>'<option value="'+m[0]+'">'+m[1]+'</option>').join("")+'</select></label>'+
      '<label>Prioridade *<select name="prioridade">'+PRIORITIES.map(p=>'<option>'+esc(p)+'</option>').join("")+'</select></label>'+
      '</div><div class="attendance-form-error" role="alert" hidden></div><div class="patient-form-actions"><button class="button ghost" type="button" data-go="/atendimentos/fila">Cancelar</button>'+
      '<button class="button" type="submit"'+(!options||!guides?' disabled':'')+'>Adicionar à fila</button></div></form>';
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
      '<div><dt>Telefone</dt><dd>'+esc(p.telefone||"Não informado")+'</dd></div>'+
      '<div><dt>CPF</dt><dd>'+esc(maskCpf(p.cpf))+'</dd></div>'+
      '<div><dt>Atendimentos</dt><dd>'+visits.length+'</dd></div>'+
      '<div><dt>Encaminhamento</dt><dd>'+esc(p.encaminhamento||"Não informado")+'</dd></div></dl>';
    if(state.profileTab==="historico")details='<div class="list-box">'+(visits.map(v=>{
      const g=guide(v.guide_id),changes=state.events.filter(e=>e.visit_id===v.id);
      return '<div class="attendance-history-entry"><strong>'+fmtDay(v.service_date)+' · Guia '+esc(g?.nome||"Não encontrado")+'</strong> '+
        pill(v.status)+'<div class="muted">Ordem '+v.ordem+' · '+esc(v.prioridade)+'</div>'+
        '<div class="attendance-event-list">'+changes.map(e=>'<small>'+fmtTime(e.changed_at)+' · '+esc(e.previous_status||"Entrada")+' → '+esc(e.next_status)+'</small>').join("")+'</div></div>';
    }).join("")||'<div class="note">Este paciente ainda não possui atendimentos.</div>')+'</div>';
    if(state.profileTab==="materiais")details='<div class="note">O controle de materiais e devoluções será implementado em uma próxima etapa.</div>';
    if(p.foto_path&&!state.photoUrls.has(p.foto_path)&&!state.photoErrors.has(p.foto_path))loadSignedPhoto(p.foto_path);
    const img=p.foto_path&&state.photoUrls.has(p.foto_path)?'<img class="avatar patient-avatar" alt="Foto de '+esc(p.nome)+'" src="'+esc(state.photoUrls.get(p.foto_path))+'">':
      '<div class="avatar patient-avatar attendance-avatar-fallback" aria-label="Sem fotografia">♙</div>';
    const current=selected?'<div class="attendance-current"><div class="guide-highlight"><i style="background:'+esc(guide(selected.guide_id)?.cor||"#467C9C")+'"></i>'+
      '<div><strong>Atendimento selecionado · Guia '+esc(guide(selected.guide_id)?.nome||"—")+'</strong>'+
      '<div class="muted">Ordem '+selected.ordem+' · '+fmtDay(selected.service_date)+' · '+esc(selected.prioridade)+'</div></div></div>'+
      '<div class="attendance-status-control"><label>Situação do atendimento <select data-live-status="'+esc(selected.id)+'">'+STATUSES.map(st=>
      '<option value="'+esc(st)+'"'+(selected.status===st?" selected":"")+'>'+esc(st)+'</option>').join("")+'</select></label>'+
      pill(selected.status)+'</div></div>':"";
    return '<button class="breadcrumb" data-go="/atendimentos/pacientes">← Voltar aos pacientes</button>'+
      '<section class="profile"><div class="profile-header">'+img+'<div><h2>'+esc(p.nome)+'</h2>'+
      '<div class="muted">Ficha individual · dados protegidos</div></div></div>'+current+
      '<div class="module-tabs" role="group" aria-label="Seções da ficha">'+[["dados","Dados"],["historico","Histórico"],["materiais","Materiais"]].map(t=>
      '<button class="tab '+(state.profileTab===t[0]?"active":"")+'" data-live-tab="'+t[0]+'">'+t[1]+'</button>').join("")+'</div>'+details+
      (canWrite()?'<div class="attendance-detail-actions"><button class="button" type="button" data-go="/atendimentos/nova-chegada">＋ Novo atendimento</button></div>':"")+
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
    const data=new FormData(form),nome=String(data.get("nome")||"").trim().replace(/\s+/g," "),
      nascimento=String(data.get("nascimento")||""),telefone=String(data.get("telefone")||"").trim(),
      cpf=cpfDigits(data.get("cpf")),encaminhamento=String(data.get("encaminhamento")||"").trim();
    if(nome.length<2||nome.length>160||!nascimento||nascimento>currentDay())return fail(form,"Informe nome e nascimento válidos.");
    if(cpf&&!validCpf(cpf))return fail(form,"CPF inválido.");
    const exists=state.patients.find(p=>(cpf&&p.cpf===cpf)||(normalize(p.nome)===normalize(nome)&&p.nascimento===nascimento));
    if(exists)return fail(form,"Possível duplicidade: "+exists.nome+". Consulte a ficha antes de cadastrar novamente.");
    const submit=form.querySelector('[type="submit"]');state.busy=true;if(submit)submit.disabled=true;
    try{
      const file=data.get("foto"),blob=file?.size?await imageBlob(file):null;
      const {data:saved,error}=await client().from("barquinha_attendance_patients")
        .insert({nome,nascimento,telefone:telefone||null,cpf:cpf||null,encaminhamento:encaminhamento||null})
        .select("id,nome,nascimento,telefone,cpf,encaminhamento,foto_path,created_at").single();
      if(error)throw error;
      state.patients.push(saved);
      state.notice="Paciente cadastrado com segurança.";
      if(blob){
        try{
          const path=saved.id+"/"+crypto.randomUUID()+".jpg";
          const upload=await client().storage.from(PHOTO_BUCKET).upload(path,blob,{upsert:false,contentType:"image/jpeg"});
          if(upload.error)throw upload.error;
          const updated=await client().from("barquinha_attendance_patients").update({foto_path:path}).eq("id",saved.id)
            .select("id,foto_path").single();
          if(updated.error)throw updated.error;
          saved.foto_path=path;
        }catch(uploadError){state.notice+=" A fotografia não foi salva: "+uploadError.message;}
      }
      state.profileTab="dados";navigateCallback("/atendimentos/paciente/"+saved.id);
    }catch(e){
      fail(form,e.code==="23505"?"Já existe um paciente com este CPF. Confira a ficha antes de cadastrar.":"Não foi possível cadastrar: "+(e.message||e));
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
    const patientId=String(data.get("patient_id")||""),guideId=String(data.get("guide_id")||""),
      modalidade=String(data.get("modalidade")||""),prioridade=String(data.get("prioridade")||"");
    if(!person(patientId)||!guide(guideId)||!MODES.some(m=>m[0]===modalidade)||!PRIORITIES.includes(prioridade))
      return fail(form,"Selecione paciente, Guia, modalidade e prioridade válidos.");
    const submit=form.querySelector('[type="submit"]');state.busy=true;if(submit)submit.disabled=true;
    try{
      const {data:saved,error}=await client().from("barquinha_attendance_visits")
        .insert({patient_id:patientId,guide_id:guideId,modalidade,prioridade})
        .select("id,ordem,patient_id,guide_id,service_date,modalidade,prioridade,status,created_at,status_changed_at").single();
      if(error)throw error;
      state.visits.unshift(saved);state.notice="Chegada registrada. Ordem "+saved.ordem+" atribuída ao Guia.";
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
  function handleClick(event){
    const refreshButton=event.target.closest("[data-live-refresh]");
    if(refreshButton){event.preventDefault();refresh();return true;}
    const tab=event.target.closest("[data-live-tab]");
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
    return false;
  }
  function handleInput(event){
    if(event.target?.id!=="live-patient-search")return false;
    state.search=event.target.value;
    const pos=event.target.selectionStart;renderCallback();
    const next=document.getElementById("live-patient-search");
    if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch(e){}}
    return true;
  }
  window.AttendanceLive={connect,page,handleClick,handleSubmit,handleChange,handleInput,clear:()=>resetFor(null)};
})();