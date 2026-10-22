import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const style = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const markup = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function setup() {
  const events = {};
  const windows = {};
  const app = {
    innerHTML: "",
    addEventListener(name, fn) { events[name] = fn; }
  };
  const document = {
    title: "",
    getElementById(id) { return id === "app" ? app : null; }
  };
  const location = {hash: "#/inicio"};
  const window = {
    addEventListener(name, fn) { windows[name] = fn; },
    scrollTo() {}
  };
  new Function("document", "window", "location", src)(document, window, location);
  return {
    app, document, events, location,
    route(hash) { location.hash = "#" + hash; windows.hashchange(); },
    click(path) {
      events.click({target: {
        closest(selector) {
          return selector === "[data-go]" ? {getAttribute: () => path} : null;
        }
      }});
      windows.hashchange();
    }
  };
}

test("shell references local static assets", () => {
  assert.match(markup, /href="\.\/styles\.css"/);
  assert.match(markup, /src="\.\/app\.js"/);
});

test("foundation never invokes cloud services or stores personal data", () => {
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|localStorage|indexedDB|service_role/);
});

test("home includes both modules", () => {
  const ui = setup();
  assert.match(ui.app.innerHTML, /Projetos Barquinha/);
  assert.match(ui.app.innerHTML, /Atendimentos Barquinha/);
});

test("queue cards are clickable and identifiable by Guide", () => {
  const ui = setup();
  ui.route("/atendimentos/fila");
  assert.equal((ui.app.innerHTML.match(/class="queue-card"/g) || []).length, 6);
  assert.match(ui.app.innerHTML, /data-go="\/atendimentos\/paciente\/maria\/at-001"/);
  assert.match(style, /guide-rail\s*\{[^}]*width:\s*12px/);
  ui.click("/atendimentos/paciente/maria/at-001");
  assert.match(ui.app.innerHTML, /Maria Silva/);
  assert.match(ui.app.innerHTML, /Guia João/);
});

test("Guide filter does not mutate or duplicate the queue", () => {
  const ui = setup();
  ui.route("/atendimentos/fila");
  ui.events.change({target: {id:"filter-guides",value:"joao"}});
  assert.equal((ui.app.innerHTML.match(/class="queue-card"/g) || []).length, 2);
  ui.events.change({target: {id:"filter-guides",value:"todos"}});
  assert.equal((ui.app.innerHTML.match(/class="queue-card"/g) || []).length, 6);
});

test("authorizations are visibly separated from regular queue", () => {
  const ui = setup();
  ui.route("/atendimentos/autorizacoes");
  assert.match(ui.app.innerHTML, /Aguardando autorização/);
  assert.match(ui.app.innerHTML, /Atendimento não autorizado/);
});

test("existing Projects module is linked without changing its code", () => {
  const ui = setup();
  ui.route("/projetos");
  assert.match(ui.app.innerHTML, /\.\.\/obra-facil\/index\.html/);
});

test("daily queue is arranged as one column per Guide", () => {
  const ui=setup();
  ui.route("/atendimentos/fila");
  assert.equal((ui.app.innerHTML.match(/class="queue-guide-column"/g)||[]).length,3);
  assert.match(ui.app.innerHTML,/Fila do Guia João/);
  assert.match(ui.app.innerHTML,/Fila do Guia Pedro/);
  assert.match(ui.app.innerHTML,/Fila do Guia Antônio/);
  assert.match(style,/queue-board-scroll\s*\{[^}]*overflow-x:auto/);
  ui.events.change({target:{id:"filter-guides",value:"joao"}});
  assert.equal((ui.app.innerHTML.match(/class="queue-guide-column"/g)||[]).length,1);
});

test("daily queue offers a patient registration form", () => {
  const ui=setup();
  ui.route("/atendimentos/fila");
  assert.match(ui.app.innerHTML,/data-go="\/atendimentos\/novo-paciente"/);
  ui.click("/atendimentos/novo-paciente");
  assert.match(ui.app.innerHTML,/id="new-patient-form"/);
  assert.match(ui.app.innerHTML,/name="nome"/);
  assert.match(ui.app.innerHTML,/name="nascimento"/);
  assert.match(ui.app.innerHTML,/name="telefone"/);
});

test("demo registration creates a patient but no queue attendance", () => {
  const ui=setup();
  ui.route("/atendimentos/novo-paciente");
  for(const [field,value] of Object.entries({
    nome:"Pessoa Demonstrativa",nascimento:"2000-01-05",telefone:"(85) 95555-1010",encaminhamento:"Teste"
  }))ui.events.input({target:{id:"",dataset:{patientField:field},value}});
  let prevented=false;
  ui.events.submit({target:{id:"new-patient-form"},preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(ui.location.hash,"#/atendimentos/paciente/demo-paciente-1");
  ui.route("/atendimentos/paciente/demo-paciente-1");
  assert.match(ui.app.innerHTML,/Pessoa Demonstrativa/);
  assert.match(ui.app.innerHTML,/Paciente cadastrado nesta demonstração/);
  ui.route("/atendimentos/fila");
  assert.equal((ui.app.innerHTML.match(/class="queue-card"/g)||[]).length,6);
  ui.route("/atendimentos/pacientes");
  assert.match(ui.app.innerHTML,/Pessoa Demonstrativa/);
});

test("duplicate patient warning prevents another demo record", () => {
  const ui=setup();
  ui.route("/atendimentos/novo-paciente");
  for(const [field,value] of Object.entries({
    nome:"Maria Silva",nascimento:"1959-03-14",telefone:"(85) 97777-5555"
  }))ui.events.input({target:{id:"",dataset:{patientField:field},value}});
  ui.events.submit({target:{id:"new-patient-form"},preventDefault(){}});
  assert.match(ui.app.innerHTML,/Possível cadastro duplicado/);
  assert.match(ui.app.innerHTML,/Ver cadastro existente/);
  assert.equal(ui.location.hash,"#/atendimentos/novo-paciente");
});


test("form offers photo upload and CPF with required format", () => {
  const ui=setup();
  ui.route("/atendimentos/novo-paciente");
  assert.match(ui.app.innerHTML,/name="cpf"/);
  assert.match(ui.app.innerHTML,/id="patient-photo"/);
  assert.match(ui.app.innerHTML,/accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(style,/queue-board-scroll\s*\{[^}]*overflow-x:auto/);
  assert.match(style,/padding:3px 24px 12px 2px/);
});

test("rejects invalid CPF and accepts valid demo CPF", () => {
  const ui=setup();
  ui.route("/atendimentos/novo-paciente");
  const feed=(key,value)=>ui.events.input({target:{id:"",dataset:{patientField:key},value}});
  feed("nome","Pessoa Exemplo CPF");
  feed("nascimento","2000-01-02");
  feed("cpf","123.456.789-00");
  ui.events.submit({target:{id:"new-patient-form"},preventDefault(){}});
  assert.match(ui.app.innerHTML,/CPF inválido/);
  feed("cpf","529.982.247-25");
  ui.events.submit({target:{id:"new-patient-form"},preventDefault(){}});
  assert.equal(ui.location.hash,"#/atendimentos/paciente/demo-paciente-1");
  ui.route("/atendimentos/paciente/demo-paciente-1");
  assert.match(ui.app.innerHTML,/\*\*\*\.\*\*\*\.\*\*\*-25/);
  assert.doesNotMatch(ui.app.innerHTML,/529\.982\.247-25/);
});

test("CPF duplicate prevents a second patient record", () => {
  const ui=setup();
  ui.route("/atendimentos/novo-paciente");
  const submit=(name,dob,cpf)=>{
    for(const [key,value] of Object.entries({nome:name,nascimento:dob,cpf})){
      ui.events.input({target:{id:"",dataset:{patientField:key},value}});
    }
    ui.events.submit({target:{id:"new-patient-form"},preventDefault(){}});
  };
  submit("Paciente Um","1990-05-01","52998224725");
  ui.route("/atendimentos/novo-paciente");
  submit("Paciente Dois","1995-06-12","52998224725");
  assert.match(ui.app.innerHTML,/Possível cadastro duplicado/);
  assert.equal(ui.location.hash,"#/atendimentos/novo-paciente");
});
