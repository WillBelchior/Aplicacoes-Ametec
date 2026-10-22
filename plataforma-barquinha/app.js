"use strict";
/* Plataforma Barquinha, etapa 1.
 * Interface estática de demonstração: sem acesso ao Supabase, sem coleta e sem gravação de pacientes.
 * O módulo de Obras permanece independente em ../obra-facil/index.html.
 */
(function () {
  const GUIDES = [
    {id:"joao",nome:"João",cor:"#6478C6"},
    {id:"pedro",nome:"Pedro",cor:"#2F9A91"},
    {id:"antonio",nome:"Antônio",cor:"#C38A47"}
  ];
  const PEOPLE = [
    {id:"maria",nome:"Maria Silva",telefone:"(85) 90000-0101",nascimento:"14/03/1959",material:"Recebido incompleto",pendencia:true,visitas:3},
    {id:"carlos",nome:"Carlos Souza",telefone:"(85) 90000-0202",nascimento:"06/06/1981",material:"Sem pendências",pendencia:false,visitas:2},
    {id:"ana",nome:"Ana Lima",telefone:"(85) 90000-0303",nascimento:"12/08/1994",material:"Sem pendências",pendencia:false,visitas:1},
    {id:"jose",nome:"José Ferreira",telefone:"(85) 90000-0404",nascimento:"09/11/1977",material:"Sem pendências",pendencia:false,visitas:4},
    {id:"roberto",nome:"Roberto Santos",telefone:"(85) 90000-0505",nascimento:"04/01/1988",material:"Sem pendências",pendencia:false,visitas:2}
  ];
  const ATTENDANCES = [
    {id:"at-001",ordem:1,pessoa:"maria",guia:"joao",tipo:"presencial",prioridade:"Idoso",status:"Aguardando"},
    {id:"at-002",ordem:2,pessoa:"carlos",guia:"antonio",tipo:"presencial",prioridade:"Normal",status:"Chamado"},
    {id:"at-003",ordem:3,pessoa:"ana",guia:"pedro",tipo:"presencial",prioridade:"Gestante",status:"Aguardando"},
    {id:"at-004",ordem:4,pessoa:"maria",guia:"pedro",tipo:"presencial",prioridade:"Normal",status:"Aguardando"},
    {id:"at-005",ordem:5,pessoa:"jose",guia:"joao",tipo:"distancia",prioridade:"Normal",status:"Aguardando"},
    {id:"at-006",ordem:6,pessoa:"roberto",guia:"antonio",tipo:"trabalhador",prioridade:"Normal",status:"Aguardando"}
  ];
  const REQUESTS = [
    {id:"sol-001",pessoa:"jose",guia:"joao",motivo:"Atendimento à distância",status:"Aguardando autorização"},
    {id:"sol-002",pessoa:"ana",guia:"pedro",motivo:"Chegada após as 17h",status:"Atendimento não autorizado"}
  ];
  const state = {filter:"todos",search:"",profileTab:"dados",patientDraft:{nome:"",nascimento:"",telefone:"",cpf:"",foto:"",encaminhamento:""},patientFormError:"",duplicatePatientId:null,justRegisteredId:null,nextDemoId:0};
  const app = document.getElementById("app");
  if (!app) return;
  const esc = (value) => String(value === null || value === undefined ? "" : value)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const guide = (id) => GUIDES.find((entry) => entry.id === id);
  const patient = (id) => PEOPLE.find((entry) => entry.id === id);
  const currentRoute = () => {
    const route = decodeURIComponent((location.hash || "#/inicio").slice(1));
    return route.startsWith("/") ? route : "/inicio";
  };
  function navigate(route) {
    if (location.hash === "#" + route) render();
    else location.hash = "#" + route;
  }
  function icon(text) { return '<span aria-hidden="true">' + text + '</span>'; }
  function tag(text,type) { return '<span class="pill ' + (type || "") + '">' + esc(text) + '</span>'; }
  function heading(title,description,kicker) {
    return '<section class="intro"><div class="eyebrow">' + esc(kicker || "Plataforma Barquinha") +
      '</div><h1>' + esc(title) + '</h1><p>' + esc(description) + '</p></section>';
  }
  function sideButton(route,emoji,label,active) {
    return '<button type="button" class="nav-btn ' + (active ? "active" : "") +
      '" data-go="' + esc(route) + '"' + (active ? ' aria-current="page"' : "") + '><span class="nav-icon" aria-hidden="true">' +
      emoji + '</span>' + esc(label) + '</button>';
  }
  function bottomButton(route,emoji,label,active) {
    return '<button class="mobile-nav ' + (active ? "active" : "") + '" type="button" data-go="' +
      esc(route) + '"><span aria-hidden="true">' + emoji + '</span>' + esc(label) + '</button>';
  }
  function shell(route,body) {
    const home=route==="/inicio";
    const projects=route==="/projetos";
    const attend=route.startsWith("/atendimentos");
    const crumb=home?"Visão geral":projects?"Projetos Barquinha":"Atendimentos Barquinha";
    return '<div class="shell"><aside class="sidebar"><div class="logo-row"><div class="logo-icon" aria-hidden="true">⚓</div>' +
      '<div><div class="brand-name">Barquinha</div><span class="brand-caption">Plataforma de gestão</span></div></div>' +
      '<div class="side-label">Plataforma</div><nav class="nav-list" aria-label="Navegação principal">' +
      sideButton("/inicio","⌂","Visão geral",home) + sideButton("/projetos","▤","Projetos Barquinha",projects) +
      sideButton("/atendimentos/fila","☷","Atendimentos Barquinha",attend) + '</nav>' +
      '<div class="sidebar-foot"><strong>Fundação V0.1</strong>Somente interface demonstrativa.<br>Sem banco e sem login compartilhado.</div></aside>' +
      '<div class="content-shell"><header class="topbar"><div class="crumb">Barquinha / <strong>' + esc(crumb) +
      '</strong></div><div class="top-status"><i class="status-dot" aria-hidden="true"></i>Modo demonstração</div></header>' +
      '<main class="main" id="main-content">' + body +
      '<footer class="footer-note">Plataforma Barquinha • Etapa 1 • Nenhum dado de paciente é transmitido ou salvo nesta prévia.</footer></main></div>' +
      '<nav class="mobile-bottom" aria-label="Navegação para celular">' +
      bottomButton("/inicio","⌂","Início",home) + bottomButton("/projetos","▤","Projetos",projects) +
      bottomButton("/atendimentos/fila","☷","Atendimentos",attend) + '</nav></div>';
  }
  function homePage() {
    return heading("Uma Barquinha, uma plataforma",
      "Acesso central aos módulos da instituição. Os dados existentes de Obras permanecem preservados; Atendimentos está em fase de demonstração.","GESTÃO INTEGRADA") +
      '<section class="banner"><div><h2>Bem-vindo à Plataforma Barquinha</h2><p>Organização das obras e dos atendimentos em um só ponto de entrada.</p></div><span class="banner-symbol" aria-hidden="true">⚓</span></section>' +
      '<div class="grid-2"><article class="card"><div class="card-top"><div class="card-icon" aria-hidden="true">▤</div>' +
      tag("Aplicativo existente","green") + '</div><h3>Projetos Barquinha</h3>' +
      '<p>Obras, etapas, materiais, financeiro, diário e contatos. A versão atual permanece independente e inalterada.</p>' +
      '<div class="actions"><button class="button" data-go="/projetos">Ver módulo de Projetos →</button></div></article>' +
      '<article class="card"><div class="card-top"><div class="card-icon" aria-hidden="true">☷</div>' +
      tag("Prévia visual","blue") + '</div><h3>Atendimentos Barquinha</h3>' +
      '<p>Fila geral, pacientes, Guias por cor, solicitações de autorização e controle de expediente, com dados fictícios.</p>' +
      '<div class="actions"><button class="button" data-go="/atendimentos/fila">Explorar Atendimentos →</button></div></article></div>' +
      '<h2 class="section-title">Estrutura planejada</h2>' +
      '<div class="grid-3"><div class="card"><div class="card-icon">♧</div><h3>Identidade única</h3><p>Uma navegação e uma linguagem visual para todos os módulos.</p></div>' +
      '<div class="card"><div class="card-icon">◈</div><h3>Banco compartilhado</h3><p>O mesmo Supabase, com dados de Obras e Atendimentos separados por tabelas e permissões.</p></div>' +
      '<div class="card"><div class="card-icon">↻</div><h3>Offline futuro</h3><p>Sincronização por módulo com prevenção de duplicidades; ainda não implementada nesta etapa.</p></div></div>' +
      '<div class="note warn" style="margin-top:20px">Atenção: nesta fase, os módulos compartilham apenas a entrada visual. Não há login único, acesso ao banco ou sincronização entre eles.</div>';
  }
  function projectsPage() {
    return heading("Projetos Barquinha","A aplicação de Obras continua no local original, sem mudanças no código e sem migração dos registros.","MÓDULO 01") +
      '<section class="banner"><div><h2>Gestão de obras e projetos</h2><p>Continue utilizando o sistema de Obras atual enquanto construímos a plataforma unificada.</p></div><span class="banner-symbol" aria-hidden="true">▤</span></section>' +
      '<div class="panel"><h3>Acesso ao módulo existente</h3><p>O botão abaixo abre o aplicativo original preservado no diretório <strong>obra-facil</strong> do mesmo repositório. Para testar localmente, sirva a raiz do repositório.</p>' +
      '<div class="actions" style="margin-top:18px"><a class="button" href="../obra-facil/index.html">Abrir Projetos Barquinha ↗</a></div></div>' +
      '<div class="note">Integração inicial por navegação. Não alteramos autenticação, contratos de dados, permissões ou funcionalidades do Projeto de Obras.</div>';
  }
  function moduleTabs(route) {
    const tabs=[
      ["/atendimentos/fila","Fila geral"],
      ["/atendimentos/pacientes","Pacientes"],
      ["/atendimentos/guias","Guias"],
      ["/atendimentos/autorizacoes","Autorizações"],
      ["/atendimentos/expediente","Expediente"]
    ];
    return '<nav class="module-tabs" aria-label="Áreas de Atendimentos">' + tabs.map((t) =>
      '<button class="tab ' + (route.startsWith(t[0]) ? "active" : "") + '" data-go="' + t[0] +
      '" type="button">' + t[1] + '</button>').join("") + '</nav>';
  }
  function queueCard(item) {
    const p=patient(item.pessoa),g=guide(item.guia);
    if(!p||!g)return "";
    const priority=item.prioridade!=="Normal" ? ' • '+esc(item.prioridade) : "";
    return '<button type="button" class="queue-card" data-go="/atendimentos/paciente/' +
      esc(p.id) + '/' + esc(item.id) + '" aria-label="Abrir ficha de ' + esc(p.nome) +
      ', Guia ' + esc(g.nome) + '"><span class="queue-row"><span class="guide-rail" style="background:' +
      esc(g.cor) + '"></span><span class="queue-inner"><span class="ticket">' +
      String(item.ordem).padStart(2,"0") + '</span><span class="queue-details"><strong>' +
      esc(p.nome) + '</strong><small>Guia ' + esc(g.nome) + priority +
      '</small></span><span class="queue-status">' + tag(item.status,item.status==="Chamado"?"blue":"") +
      '<em>' + (item.tipo==="distancia"?"À distância":item.tipo==="trabalhador"?"Trabalhador":"Presencial") +
      '</em></span><span class="chevron" aria-hidden="true">›</span></span></span></button>';
  }
  function queuePage() {
    const options='<option value="todos">Todos os Guias</option>' +
      GUIDES.map((g)=>'<option value="'+g.id+'" '+(state.filter===g.id?'selected':'')+'>'+esc(g.nome)+'</option>').join("");
    const kinds=[["presencial","Presenciais"],["distancia","À distância"],["trabalhador","Trabalhadores da casa"]];
    const selectedGuides=GUIDES.filter((g)=>state.filter==="todos"||state.filter===g.id);
    const columns=selectedGuides.map((g)=>{
      const visits=ATTENDANCES.filter((a)=>a.guia===g.id).sort((a,b)=>a.ordem-b.ordem);
      const sections=kinds.map((kind)=>{
        const rows=visits.filter((a)=>a.tipo===kind[0]);
        if(!rows.length)return "";
        return '<section class="queue-guide-section" aria-label="'+esc(kind[1])+' de Guia '+esc(g.nome)+'">'+
          '<div class="queue-group"><span>'+kind[1]+'</span><span>'+rows.length+'</span></div>'+
          '<div class="queue">'+rows.map(queueCard).join("")+'</div></section>';
      }).join("");
      return '<section class="queue-guide-column" aria-label="Fila do Guia '+esc(g.nome)+'">'+
        '<div class="queue-guide-header" style="border-top-color:'+esc(g.cor)+'">'+
        '<div class="queue-guide-info"><span class="guide-dot" style="background:'+esc(g.cor)+'"></span>'+
        '<h3>Guia '+esc(g.nome)+'</h3></div>'+
        '<span class="pill blue">'+visits.length+' '+(visits.length===1?'atendimento':'atendimentos')+'</span></div>'+
        '<div class="queue-guide-body">'+
        (sections||'<div class="queue-empty">Nenhum paciente nesta fila.</div>')+'</div></section>';
    }).join("");
    return heading("Atendimento do Dia","Fila geral apresentada em colunas, uma para cada Guia. A numeração permanece a mesma em toda a sessão; dados fictícios.","MÓDULO 02") +
      '<div class="metrics"><div class="metric"><strong>06</strong><span>Atendimentos</span></div>' +
      '<div class="metric"><strong>05</strong><span>Aguardando</span></div><div class="metric"><strong>01</strong><span>Chamado</span></div>' +
      '<div class="metric"><strong>02</strong><span>Autorizações na prévia</span></div></div>' +
      '<div class="filters"><div class="queue-actions"><h3>Fila geral por Guia</h3><button class="button" type="button" data-go="/atendimentos/novo-paciente">＋ Cadastrar paciente</button></div><label>Visualizar: <select id="filter-guides" aria-label="Filtrar por Guia">' +
      options + '</select></label></div>' +
      '<p class="queue-hint">Cada coluna reúne os atendimentos do Guia. No celular, deslize a tabela para os lados para ver os demais Guias.</p>' +
      '<div class="queue-board-scroll" role="region" aria-label="Filas dos Guias, com rolagem horizontal" tabindex="0">'+
      '<div class="queue-board'+(selectedGuides.length===1?' single':'')+'" style="--guide-count:'+selectedGuides.length+'">'+
      columns+'</div></div>' +
      '<div class="note" style="margin-top:17px">As faixas de 12 px e o número original do atendimento são preservados. Organizar por coluna não cria filas independentes nem libera solicitações pendentes: as regras de elegibilidade ainda serão implementadas na integração real.</div>';
  }
    function normalizeName(value) {
    return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z\s]/g," ").replace(/\s+/g," ").trim();
  }
  function normalizePhone(value) { return String(value||"").replace(/\D/g,""); }
  function isoFromPt(value) {
    const match=String(value||"").match(/^(\d\d)\/(\d\d)\/(\d{4})$/);
    return match ? match[3]+"-"+match[2]+"-"+match[1] : "";
  }
  function ptFromIso(value) { return value.slice(8,10)+"/"+value.slice(5,7)+"/"+value.slice(0,4); }
  function dateIsValid(iso) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return false;
    const d=new Date(iso+"T12:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0,10)===iso && d.getTime()<=Date.now();
  }
  function cpfDigits(value) { return String(value||"").replace(/\D/g,""); }
  function validCpf(value) {
    const digits=cpfDigits(value);
    if(!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits))return false;
    for(const size of [9,10]){
      const sum=digits.slice(0,size).split("").reduce((total, digit, index)=>total+Number(digit)*(size+1-index),0);
      const remainder=(sum*10)%11;
      if(Number(digits[size])!==(remainder===10?0:remainder))return false;
    }
    return true;
  }
  function formatCpf(value){
    const digits=cpfDigits(value);
    return digits.length===11?digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,"$1.$2.$3-$4"):digits;
  }
  function maskedCpf(value){
    const digits=cpfDigits(value);
    return digits.length===11?"***.***.***-"+digits.slice(-2):"Não informado";
  }
  function demoImage(src, className, alt) {
    return typeof src==="string" && /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/]+=*$/.test(src)
      ? '<img class="'+className+'" src="'+src+'" alt="'+esc(alt)+'">'
      : '<div class="'+className+' patient-no-photo" aria-label="Sem foto cadastrada">♙</div>';
  }
  function handlePhoto(file) {
    if(!file){state.patientDraft.foto="";state.patientFormError="";render();return;}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>2*1024*1024||file.size===0){
      state.patientFormError="Selecione uma foto JPG, PNG ou WebP de até 2 MB.";
      state.patientDraft.foto="";
      render();
      return;
    }
    const reader=new FileReader();
    reader.onerror=()=>{state.patientFormError="Não foi possível abrir a foto.";state.patientDraft.foto="";render();};
    reader.onload=()=>{
      const src=reader.result;
      if(typeof src!=="string"||!/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/]+=*$/.test(src)){
        state.patientFormError="Formato de foto não reconhecido.";
        state.patientDraft.foto="";
      }else{state.patientFormError="";state.patientDraft.foto=src;}
      render();
    };
    reader.readAsDataURL(file);
  }
  function patientFormPage() {
    const draft=state.patientDraft;
    const field=(key,label,type,placeholder,required,extraClass)=>'<label class="'+(extraClass||"")+'">'+
      esc(label)+(required?' *':'')+
      '<input data-patient-field="'+key+'" name="'+key+'" type="'+type+'" '+(required?'required ':'')+
      'maxlength="'+(key==="nome"?"160":key==="encaminhamento"?"250":"50")+'" autocomplete="off" '+
      (placeholder?'placeholder="'+esc(placeholder)+'" ':'')+'value="'+esc(draft[key])+'"></label>';
    return '<button class="breadcrumb" type="button" data-go="/atendimentos/fila">← Voltar à fila geral</button>'+
      heading("Cadastrar novo paciente","Preencha os dados básicos. Nesta demonstração, o cadastro existe somente enquanto a página estiver aberta e não entra automaticamente na fila.","CADASTRO • MODO DEMONSTRAÇÃO")+
      '<div class="patient-form"><div class="note warn" style="margin-bottom:16px"><strong>Utilize apenas informações fictícias.</strong> Este formulário ainda não possui autenticação e armazenamento adequado para dados de pacientes reais.</div>'+
      '<form id="new-patient-form" class="panel" novalidate><fieldset><legend>Dados do paciente</legend><div class="patient-fields">'+
      field("nome","Nome completo","text","Ex.: Maria de Teste",true,"wide")+
      field("nascimento","Data de nascimento","date","",true,"")+
      field("telefone","Telefone de contato","tel","(85) 99999-9999",false,"")+
      '<label>CPF (opcional nesta demonstração)<input data-patient-field="cpf" name="cpf" inputmode="numeric" type="text" maxlength="14" autocomplete="off" placeholder="000.000.000-00" value="'+esc(draft.cpf)+'"><small>Validação dos dígitos verificadores e alerta de duplicidade.</small></label>'+
      field("encaminhamento","Encaminhamento / indicação (opcional)","text","Quem encaminhou o paciente?",false,"wide")+
      '<div class="photo-field wide"><div class="photo-preview">'+demoImage(draft.foto,"photo-preview-img","Prévia da foto do paciente")+'</div><label class="photo-upload-label">Foto do paciente (opcional)<input id="patient-photo" name="foto" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG ou WebP • Até 2 MB • Somente nesta sessão de teste</small></label></div>'+
      '</div></fieldset>'+
      (state.patientFormError?'<div class="form-error" role="alert">'+esc(state.patientFormError)+
      (state.duplicatePatientId?' <button type="button" class="button ghost" data-go="/atendimentos/paciente/'+esc(state.duplicatePatientId)+'">Ver cadastro existente →</button>':'')+'</div>':'')+
      '<div class="patient-form-actions"><button type="button" class="button ghost" data-go="/atendimentos/fila">Cancelar</button>'+
      '<button type="submit" class="button">Cadastrar paciente</button></div></form>'+
      '<div class="note">Cadastro de paciente e chegada para atendimento são operações diferentes. Após esta etapa, o registro aparece em Pacientes; a inclusão na fila exigirá uma ação própria no sistema real.</div></div>';
  }
  function submitPatientDraft() {
    const draft=state.patientDraft;
    const name=draft.nome.trim().replace(/\s+/g," ");
    const dob=draft.nascimento;
    const phone=draft.telefone.trim();
    const cpf=cpfDigits(draft.cpf);
    state.patientFormError="";
    state.duplicatePatientId=null;
    if(name.length<2 || name.length>160 || !dateIsValid(dob)) {
      state.patientFormError="Informe um nome completo e uma data de nascimento válida, não futura.";
      render();
      return;
    }
    if(cpf.length && !validCpf(cpf)) {
      state.patientFormError="CPF inválido. Confira os 11 dígitos e os verificadores.";
      render();
      return;
    }
    const normalized=normalizeName(name);
    const digits=normalizePhone(phone);
    const existing=PEOPLE.find((p)=>
      (normalizeName(p.nome)===normalized && isoFromPt(p.nascimento)===dob) ||
      (digits.length>=10 && normalizePhone(p.telefone)===digits) ||
      (cpf.length===11 && cpfDigits(p.cpf)===cpf));
    if(existing) {
      state.duplicatePatientId=existing.id;
      state.patientFormError="Possível cadastro duplicado: "+existing.nome+". Confira a ficha existente antes de cadastrar novamente.";
      render();
      return;
    }
    const id="demo-paciente-"+(++state.nextDemoId);
    PEOPLE.push({id,nome:name,nascimento:ptFromIso(dob),telefone:phone||"Não informado",
      encaminhamento:draft.encaminhamento.trim(),cpf, foto:draft.foto,material:"Nenhum ciclo registrado",pendencia:false,visitas:0});
    state.patientDraft={nome:"",nascimento:"",telefone:"",cpf:"",foto:"",encaminhamento:""};
    state.justRegisteredId=id;
    navigate("/atendimentos/paciente/"+id);
  }
  function patientsPage() {
    const matches=PEOPLE.filter((p)=>(p.nome+" "+p.telefone).toLowerCase().includes(state.search.toLowerCase()));
    return heading("Pacientes","Consulta demonstrativa. Cada paciente possui um identificador; múltiplos atendimentos não criam um segundo cadastro.","MÓDULO 02") +
      '<div class="filters"><label>Buscar paciente <input id="search-patient" class="filter-search" autocomplete="off" placeholder="Nome ou telefone" value="' +
      esc(state.search) + '"></label>' + tag(matches.length+" encontrados") + '</div>' +
      '<div class="list-box" id="patients-results">' +
      matches.map((p)=>'<div class="list-item"><div class="patient-directory-person">'+demoImage(p.foto,"patient-thumb","Foto de "+p.nome)+'<div><strong>'+esc(p.nome)+'</strong><small>'+esc(p.telefone)+
      ' • '+esc(p.visitas)+' visitas</small></div></div><button class="button ghost" data-go="/atendimentos/paciente/'+
      esc(p.id)+'">Abrir ficha →</button></div>').join("") +
      (matches.length?"":'<div class="note">Nenhum paciente fictício corresponde à pesquisa.</div>')+'</div>';
  }
  function guidesPage() {
    return heading("Guias","Cores escolhidas no cadastro identificarão o responsável por cada atendimento. A personalização real virá com o banco.","MÓDULO 02") +
      '<div class="list-box">'+GUIDES.map((g)=>'<div class="list-item"><div><span class="guide-dot" style="background:'+esc(g.cor)+
      '"></span><strong>Guia '+esc(g.nome)+'</strong><small>Cor de identificação: '+esc(g.cor)+'</small></div>'+
      tag("Ativo","green")+'</div>').join("")+'</div>'+
      '<div class="note" style="margin-top:16px">As cores são demonstrativas e podem ser alteradas futuramente no cadastro. Este protótipo não envia alterações ao Supabase.</div>';
  }
  function approvalsPage() {
    return heading("Central de Autorizações","Solicitações à distância e chegadas após as 17h dependem de decisão do Presidente do Trabalho.","MÓDULO 02") +
      '<div class="list-box">'+REQUESTS.map((a)=>{
        const p=patient(a.pessoa),g=guide(a.guia);
        return '<div class="list-item"><div><strong>'+esc(p.nome)+'</strong><small>Guia '+esc(g.nome)+' • '+esc(a.motivo)+
        '</small></div>'+tag(a.status,a.status==="Aguardando autorização"?"amber":"red")+'</div>';
      }).join("")+'</div>'+
      '<div class="note warn" style="margin-top:16px">Somente visualização. Solicitações pendentes ou recusadas não entram na fila efetiva. Aprovações reais exigirão autenticação do Presidente e confirmação do servidor.</div>';
  }
  function shiftPage() {
    return heading("Controle do expediente","A recepção escolhe a hora de início. Após as 17h, novas chegadas exigem autorização do Presidente.","MÓDULO 02") +
      '<div class="grid-3"><div class="card"><div class="eyebrow">Início</div><h3>Flexível</h3><p>Definido pela recepção responsável.</p></div>' +
      '<div class="card"><div class="eyebrow">Limite de chegada regular</div><h3>17:00</h3><p>Chegadas posteriores passam por autorização.</p></div>' +
      '<div class="card"><div class="eyebrow">Finalização</div><h3>Após o último</h3><p>O expediente continua até que todos os atendimentos sejam resolvidos.</p></div></div>' +
      '<div class="panel" style="margin-top:16px"><h3>Ações previstas</h3><div class="actions" style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="button" disabled title="Ação indisponível neste protótipo">Iniciar Atendimentos</button>' +
      '<button class="button secondary" disabled title="Ação indisponível neste protótipo">Finalizar Atendimentos</button></div>' +
      '<p style="margin-top:13px">Os botões permanecem desabilitados nesta fase para não sugerir gravação ou encerramento verdadeiro.</p></div>';
  }
  function patientPage(route) {
    const segments=route.split("/");
    const p=patient(segments[3]);
    const a=ATTENDANCES.find((x)=>x.id===segments[4] && x.pessoa===segments[3]);
    if(!p)return '<div class="note warn">Paciente não encontrado na demonstração.</div><button class="button" data-go="/atendimentos/fila">Voltar à fila</button>';
    const g=a?guide(a.guia):null;
    const selected=state.profileTab;
    const body=selected==="dados"?
      '<dl><div><dt>Data de nascimento</dt><dd>'+esc(p.nascimento)+'</dd></div><div><dt>Telefone</dt><dd>'+esc(p.telefone)+
      '</dd></div><div><dt>CPF</dt><dd>'+esc(maskedCpf(p.cpf))+
      '</dd></div><div><dt>Visitas registradas</dt><dd>'+p.visitas+'</dd></div><div><dt>Situação</dt><dd>Ativo (exemplo)</dd></div></dl>':
      selected==="materiais"?
      '<div class="list-item"><div><strong>Último ciclo</strong><small>'+esc(p.material)+'</small></div>'+
      tag(p.pendencia?"Passagem bloqueada":"Sem pendências",p.pendencia?"red":"green")+'</div>':
      '<div class="list-box"><div class="list-item"><div><strong>08/10/2026</strong><small>Visita e atendimentos demonstrativos</small></div></div>'+
      '<div class="list-item"><div><strong>15/09/2026</strong><small>Registro histórico demonstrativo</small></div></div></div>';
    return '<button class="breadcrumb" data-go="/atendimentos/fila">← Voltar à fila geral</button>'+
      (state.justRegisteredId===p.id?'<div class="note" role="status" style="margin-bottom:14px"><strong>Paciente cadastrado nesta demonstração.</strong> Este registro temporário será perdido ao atualizar a página; não foi enviado ao Supabase e ainda não entrou na fila.</div>':"")+
      '<div class="profile"><div class="profile-header">'+demoImage(p.foto,"avatar patient-avatar","Foto de "+p.nome)+'<div><h2>'+
      esc(p.nome)+'</h2><div class="muted">Ficha individual • somente demonstração</div></div>'+
      tag("Ativo","green")+'</div>'+(g?'<div class="guide-highlight"><i style="background:'+esc(g.cor)+
      '"></i><div><strong>Atendimento selecionado</strong><div class="muted">Guia '+esc(g.nome)+
      ' • Ordem '+String(a.ordem).padStart(2,"0")+' • '+esc(a.status)+'</div></div></div>':"")+
      '<div class="module-tabs" role="group" aria-label="Seções da ficha">' +
      [["dados","Dados"],["materiais","Materiais"],["historico","Histórico"]].map((t)=>'<button class="tab '+
      (selected===t[0]?"active":"")+'" data-profile-tab="'+t[0]+'">'+t[1]+'</button>').join("")+
      '</div>'+body+'</div><div class="note">A ficha identifica o paciente independentemente de quantos atendimentos apareçam na fila. Nenhum dado é persistido nesta etapa.</div>';
  }
  function attendancePage(route) {
    let inner;
    if(route==="/atendimentos/novo-paciente")inner=patientFormPage();
    else if(route.startsWith("/atendimentos/paciente/"))inner=patientPage(route);
    else if(route==="/atendimentos/pacientes")inner=patientsPage();
    else if(route==="/atendimentos/guias")inner=guidesPage();
    else if(route==="/atendimentos/autorizacoes")inner=approvalsPage();
    else if(route==="/atendimentos/expediente")inner=shiftPage();
    else inner=queuePage();
    return moduleTabs(route)+inner;
  }
  function render() {
    const route=currentRoute();
    const content=route==="/inicio" ? homePage() :
      route==="/projetos" ? projectsPage() :
      route.startsWith("/atendimentos") ? attendancePage(route) :
      '<div class="note warn">Área não encontrada.</div><button class="button" data-go="/inicio">Ir ao início</button>';
    app.innerHTML=shell(route,content);
    document.title=(route==="/inicio"?"Plataforma Barquinha":route==="/projetos"?"Projetos Barquinha":"Atendimentos Barquinha")+" | Fundação V0.1";
  }
  app.addEventListener("click",function(event){
    const navigation=event.target.closest("[data-go]");
    if(navigation){navigate(navigation.getAttribute("data-go"));return;}
    const pTab=event.target.closest("[data-profile-tab]");
    if(pTab){state.profileTab=pTab.getAttribute("data-profile-tab");render();}
  });
  app.addEventListener("submit",function(event) {
    if(event.target && event.target.id==="new-patient-form"){
      event.preventDefault();
      submitPatientDraft();
    }
  });
  app.addEventListener("change",function(event){
    if(event.target.id==="patient-photo"){handlePhoto(event.target.files&&event.target.files[0]);return;}
    if(event.target.id==="filter-guides"){state.filter=event.target.value;render();}
    const patientField=event.target.dataset && event.target.dataset.patientField;
    if(patientField && Object.hasOwn(state.patientDraft,patientField))state.patientDraft[patientField]=event.target.value;
  });
  app.addEventListener("input",function(event){
    const patientField=event.target.dataset && event.target.dataset.patientField;
    if(patientField && Object.hasOwn(state.patientDraft,patientField)){state.patientDraft[patientField]=event.target.value;return;}
    if(event.target.id!=="search-patient")return;
    const input=event.target, pos=input.selectionStart;
    state.search=input.value;
    render();
    const next=document.getElementById("search-patient");
    if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch(e){}}
  });
  window.addEventListener("hashchange",function(){state.profileTab="dados";render();window.scrollTo(0,0);});
  if(!location.hash)location.hash="#/inicio";
  render();
})();