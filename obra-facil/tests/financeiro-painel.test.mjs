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
  return {totals:ctx.financeTotals(project),categories:ctx.serviceMaterialCategoryTotals(project),cards,panel,financial};
}
const money=value=>Number(value).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

test("Visão Geral separa serviços e materiais e preserva o total financeiro",()=>{
  const p=makeProject(
    [
      {unidade:"un",previsto:"2",valor:"100",valorPago:"50"},
      {unidade:"Serviço",valor:"300",valorPago:"100"}
    ],
    [{valor:90,status:"Pago"},{valor:60,status:"Pendente"},{valor:50,status:"Outro"}],
    [{nome:"Base",status:"Concluído",progresso:100},{nome:"Colunas",status:"Pendente",progresso:0}]
  );
  const {totals,categories,cards,panel,financial}=run(p);
  assert.equal(totals.materials.due,350);
  assert.equal(totals.pending,410);
  assert.equal(totals.total,700);
  assert.equal(categories.services.planned,300);
  assert.equal(categories.services.due,200);
  assert.equal(categories.materials.planned,200);
  assert.equal(categories.materials.due,150);
  assert.equal(categories.services.planned+categories.materials.planned,totals.materials.planned);
  assert.equal(categories.services.due+categories.materials.due,totals.materials.due);
  assert.deepEqual(cards,[money(300),money(200),money(700),"1 / 2"]);
  assert.match(panel,/Serviços<\/span><strong>/);
  assert.match(panel,/Materiais<\/span><strong>/);
  assert.match(panel,/A pagar: R\$\s*200,00/);
  assert.match(panel,/A pagar: R\$\s*150,00/);
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
  assert.deepEqual(a.cards.slice(0,3),[money(0),money(30),money(49)]);
  assert.deepEqual(b.cards.slice(0,3),[money(400),money(0),money(400)]);
});

test("Quatro cards com quebra responsiva para tablet e celular",()=>{
  assert.match(html,/\.simple-metrics\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(html,/@media\(max-width:1100px\)\{\.simple-metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html,/@media\(max-width:370px\)\{\.simple-metrics\{grid-template-columns:minmax\(0,1fr\)/);
});

test("Serviços com pagamento parcial e materiais pagos permanecem em categorias diferentes",()=>{
  const p=makeProject([
    {unidade:"SERVICO",valor:"1000",valorPago:"450"},
    {unidade:"UN",previsto:"5",valor:"200",valorPago:"1000"},
    {unidade:"serviço",valor:"50",valorPago:"0"}
  ]);
  const {categories,cards,totals,panel}=run(p);
  assert.equal(categories.services.planned,1050);
  assert.equal(categories.services.due,600);
  assert.equal(categories.materials.planned,1000);
  assert.equal(categories.materials.due,0);
  assert.equal(totals.materials.planned,2050);
  assert.equal(totals.materials.due,600);
  assert.deepEqual(cards.slice(0,3),[money(1050),money(1000),money(2050)]);
  assert.match(panel,/A pagar: R\$\s*600,00/);
  assert.match(panel,/A pagar: R\$\s*0,00/);
});
