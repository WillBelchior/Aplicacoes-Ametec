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
  const state = {filter:"todos",search:"",profileTab:"dados"};
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
      '<div class="filters"><h3>Fila geral por Guia</h3><label>Visualizar: <select id="filter-guides" aria-label="Filtrar por Guia">' +
      options + '</select></label></div>' +
      '<p class="queue-hint">Cada coluna reúne os atendimentos do Guia. No celular, deslize a tabela para os lados para ver os demais Guias.</p>' +
      '<div class="queue-board-scroll" role="region" aria-label="Filas dos Guias, com rolagem horizontal" tabindex="0">'+
      '<div class="queue-board'+(selectedGuides.length===1?' single':'')+'" style="--guide-count:'+selectedGuides.length+'">'+
      columns+'</div></div>' +
      '<div class="note" style="margin-top:17px">As faixas de 12 px e o número original do atendimento são preservados. Organizar por coluna não cria filas independentes nem libera solicitações pendentes: as regras de elegibilidade ainda serão implementadas na integração real.</div>';
  }
    function patientsPage() {
    const matches=PEOPLE.filter((p)=>(p.nome+" "+p.telefone).toLowerCase().includes(state.search.toLowerCase()));
    return heading("Pacientes","Consulta demonstrativa. Cada paciente possui um identificador; múltiplos atendimentos não criam um segundo cadastro.","MÓDULO 02") +
      '<div class="filters"><label>Buscar paciente <input id="search-patient" class="filter-search" autocomplete="off" placeholder="Nome ou telefone" value="' +
      esc(state.search) + '"></label>' + tag(matches.length+" encontrados") + '</div>' +
      '<div class="list-box" id="patients-results">' +
      matches.map((p)=>'<div class="list-item"><div><strong>'+esc(p.nome)+'</strong><small>'+esc(p.telefone)+
      ' • '+esc(p.visitas)+' visitas</small></div><button class="button ghost" data-go="/atendimentos/paciente/'+
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
      '</dd></div><div><dt>Visitas registradas</dt><dd>'+p.visitas+'</dd></div><div><dt>Situação</dt><dd>Ativo (exemplo)</dd></div></dl>':
      selected==="materiais"?
      '<div class="list-item"><div><strong>Último ciclo</strong><small>'+esc(p.material)+'</small></div>'+
      tag(p.pendencia?"Passagem bloqueada":"Sem pendências",p.pendencia?"red":"green")+'</div>':
      '<div class="list-box"><div class="list-item"><div><strong>08/10/2026</strong><small>Visita e atendimentos demonstrativos</small></div></div>'+
      '<div class="list-item"><div><strong>15/09/2026</strong><small>Registro histórico demonstrativo</small></div></div></div>';
    return '<button class="breadcrumb" data-go="/atendimentos/fila">← Voltar à fila geral</button>'+
      '<div class="profile"><div class="profile-header"><div class="avatar" aria-hidden="true">♟</div><div><h2>'+
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
    if(route.startsWith("/atendimentos/paciente/"))inner=patientPage(route);
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
  app.addEventListener("change",function(event){
    if(event.target.id==="filter-guides"){state.filter=event.target.value;render();}
  });
  app.addEventListener("input",function(event){
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