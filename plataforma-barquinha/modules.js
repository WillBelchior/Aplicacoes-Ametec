"use strict";
/* Catálogo declarativo: a Plataforma renderiza a navegação por este registro.
   Status e permissionKey descrevem arquitetura futura, NÃO concedem acesso.
   Autorização de dados deverá ocorrer no Supabase via RLS para cada módulo. */
(() => {
  const modules = [
    {
      id:"inicio", name:"Visão Geral", shortName:"Início", icon:"⌂", route:"/inicio",
      status:"active", group:"platform", permissionKey:"platform.view",
      description:"Painel principal e acesso a todos os módulos da instituição."
    },
    {
      id:"projetos", name:"Projetos Barquinha", shortName:"Projetos", icon:"▤",
      route:"/projetos/obras", status:"active", group:"management",
      permissionKey:"projects.view",
      description:"Obras, materiais, financeiro, estoque, contatos, histórico e acessos.",
      sections:[
        {id:"obras", route:"/projetos/obras", title:"Minhas Obras"},
        {id:"financeiro", route:"/projetos/financeiro", title:"Financeiro"},
        {id:"estoque", route:"/projetos/estoque", title:"Estoque"},
        {id:"cadastro", route:"/projetos/cadastro", title:"Cadastro"},
        {id:"historico", route:"/projetos/historico", title:"Histórico"},
        {id:"acessos", route:"/projetos/acessos", title:"Acessos"}
      ]
    },
    {
      id:"atendimentos", name:"Atendimentos Barquinha", shortName:"Atendimentos", icon:"☷",
      route:"/atendimentos/fila", status:"demo", group:"management",
      permissionKey:"attendance.view",
      description:"Fila por Guia, fichas, autorizações e expediente. Somente dados fictícios."
    },
    {
      id:"igreja", name:"Gestão da Igreja", shortName:"Igreja", icon:"♧",
      route:"/igreja", status:"planned", group:"planned",
      permissionKey:"church.view",
      description:"Área reservada para gestão financeira e administrativa da instituição.",
      sections:[
        {id:"financeiro", route:"/igreja/financeiro", title:"Financeiro da Igreja",
         description:"Contribuições, receitas, despesas, prestação de contas e relatórios.", status:"planned"},
        {id:"irmaos", route:"/igreja/irmaos", title:"Irmãos Oficiais",
         description:"Cadastro de irmãos oficiais e vínculos institucionais, com acesso restrito.", status:"planned"}
      ]
    }
  ];
  const byId=id=>modules.find(m=>m.id===id)||null;
  const fromRoute=route=>modules.find(m=>route===m.route || (m.id!=="inicio"&&route.startsWith("/"+m.id+"/")) || (m.id==="igreja"&&route==="/igreja"))||null;
  window.BarquinhaRegistry=Object.freeze({modules:Object.freeze(modules),byId,fromRoute});
})();
