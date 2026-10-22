import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
function extract(from,to){
  const a=html.indexOf(from),b=html.indexOf(to,a+from.length);
  assert.ok(a>=0&&b>a,"Trecho não encontrado: "+from);
  return html.slice(a,b);
}
const financeLogic=[
  extract("function stockNumber(v){","function stockNumberLabel("),
  extract("function isServiceMaterial(item){","function materialPaymentBadge("),
  extract("function materialFinanceTotals(p){","function financeMetric("),
  extract("function financeMetric(","function globalFinanceView("),
  extract("function projectFinanceView(){","/* Cota lógica"),
  extract("function dashboard(){","/* Quadro visual:")
].join("\n");
const makeProject=(materiais=[],financeiro=[],etapas=[])=>({
  nome:"Obra demonstrativa",
  payload:{materiais,financeiro,etapas,fotos:[],diario:[]}
});
function run(project) {
  const ctx={
    db:project.payload,
    currentProject:()=>project,
    stats:()=>({progress:50,pagos:0,pendentes:0}), // prova que números antigos são ignorados
    num:value=>Number(value)||0,
    money:value=>Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}),
    esc:value=>String(value??""),
    listing:()=>"",
    isPresident:()=>false
  };
  vm.createContext(ctx);
  vm.runInContext(financeLogic,ctx);
  const panel=ctx.dashboard();
  const financial=ctx.projectFinanceView();
  const metrics=panel.match(/<div class="simple-metrics"[^>]*>([\s\S]*?)<div class="cols">/);
  assert.ok(metrics,"Cards do painel ausentes");
  const cards=[...metrics[1].matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map(m=>m[1]);
  return {totals:ctx.financeTotals(project),cards,panel,financial};
}
const money=value=>Number(value).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

test("Painel e Financeiro mostram os mesmos pendentes e total previsto",()=>{
  const p=makeProject(
    [
      {unidade:"un",previsto:"2",valor:"100",valorPago:"50"},
      {unidade:"Serviço",valor:"300",valorPago:"100"}
    ],
    [{valor:90,status:"Pago"},{valor:60,status:"Pendente"},{valor:50,status:"Outro"}],
    [{nome:"Base",status:"Concluído",progresso:100},{nome:"Colunas",status:"Pendente",progresso:0}]
  );
  const {totals,cards,financial}=run(p);
  assert.equal(totals.materials.due,350);
  assert.equal(totals.pending,410);
  assert.equal(totals.total,700);
  assert.deepEqual(cards,[money(350),money(410),money(700),"1 / 2"]);
  assert.ok(financial.includes(money(totals.pending)));
  assert.ok(financial.includes(money(totals.total)));
  assert.ok(financial.includes(money(totals.materials.due)));
});

test("Obra sem registros financeiros mostra zero, sem dados de outras obras",()=>{
  const {cards}=run(makeProject());
  assert.deepEqual(cards,[money(0),money(0),money(0),"0 / 0"]);
});

test("Dados calculados sempre pertencem à obra selecionada",()=>{
  const a=run(makeProject([{unidade:"un",previsto:3,valor:10,valorPago:0}],[{status:"Pendente",valor:19}]));
  const b=run(makeProject([{unidade:"serviço",valor:400,valorPago:400}]));
  assert.deepEqual(a.cards.slice(0,3),[money(30),money(49),money(49)]);
  assert.deepEqual(b.cards.slice(0,3),[money(0),money(0),money(400)]);
});

test("Quatro cards com quebra responsiva para tablet e celular",()=>{
  assert.match(html,/\.simple-metrics\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(html,/@media\(max-width:1100px\)\{\.simple-metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html,/@media\(max-width:370px\)\{\.simple-metrics\{grid-template-columns:minmax\(0,1fr\)/);
});
