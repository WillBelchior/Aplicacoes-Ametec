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