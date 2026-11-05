import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";

const source=readFileSync(new URL("../attendance-live.js",import.meta.url),"utf8");
const authSource=readFileSync(new URL("../auth.js",import.meta.url),"utf8");
const decode=s=>Uint8Array.from(Buffer.from(s,"base64"));

test("Atendimentos em domínio independente usa sessão da aba",()=>{
  assert.match(authSource,/const attendanceStandalone=/);
  assert.match(authSource,/const trusted=!attendanceStandalone&&/);
  assert.match(authSource,/makeClient\(!attendanceStandalone&&/);
  assert.match(authSource,/localStorage.removeItem\(TRUSTED_KEY\)/);
});
test("Cópia do módulo é criptografada com PBKDF2 e AES-GCM e pode ser aberta com a senha",async()=>{
  const tables={
    barquinha_attendance_guides:[{id:"guide-1",nome:"Guia Teste"}],
    barquinha_attendance_patients:[{id:"patient-1",nome:"Pessoa Teste",foto_path:null}],
    barquinha_attendance_visits:[{id:"visit-1",patient_id:"patient-1",guide_id:"guide-1",status:"Aguardando"}],
    barquinha_attendance_events:[{id:1,visit_id:"visit-1",next_status:"Aguardando"}]
  };
  const client={
    from(table){
      const query={
        select(){return query;},eq(){return query;},order(){return query;},
        limit(){return Promise.resolve({data:tables[table]||[],error:null});},
        maybeSingle(){return Promise.resolve({data:{user_id:"test-user",access_role:"recepcao",enabled:true},error:null});},
        range(start,end){return Promise.resolve({data:(tables[table]||[]).slice(start,end+1),error:null});},
        then(resolve,reject){return Promise.resolve({data:tables[table]||[],error:null}).then(resolve,reject);}
      };
      return query;
    }
  };
  const mockWindow={PlatformAuth:{user:{id:"test-user"},client},isSecureContext:true};
  const location={hostname:"atendimentos-barquinha.vercel.app",hash:"#/atendimentos/expediente"};
  let blob;
  const MockURL={createObjectURL(b){blob=b;return "blob:backup";},revokeObjectURL(){}};
  const document={body:{appendChild(){}},createElement(){return {click(){this.didClick=true;},remove(){}}}};
  const MockFormData=class{constructor(form){this.data=form.data;}get(key){return this.data[key];}};
  const factory=new Function("window","document","location","queueMicrotask","crypto","Blob","URL","btoa","FormData","setTimeout",source);
  factory(mockWindow,document,location,queueMicrotask,webcrypto,Blob,MockURL,btoa,MockFormData,()=>{});
  const module=mockWindow.AttendanceLive;
  module.connect(()=>{},()=>{});
  module.page("/atendimentos/fila","");
  for(let i=0;i<25;i++)await Promise.resolve();
  const operations=module.page("/atendimentos/expediente","");
  assert.match(operations,/Baixar cópia criptografada/);
  const submit={disabled:false,textContent:"",isConnected:true};
  const form={id:"live-backup-form",data:{backup_pass:"senha-de-teste-com-22-caracteres",backup_confirm:"senha-de-teste-com-22-caracteres"},
    querySelector(){return submit;},reset(){this.resetWasCalled=true;}};
  assert.equal(module.handleSubmit({target:form,preventDefault(){}}),true);
  for(let i=0;i<80&&!blob;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(blob,"download should produce a Blob");
  const encrypted=JSON.parse(await blob.text());
  assert.equal(encrypted.kind,"barquinha-attendance-encrypted-backup");
  assert.equal(encrypted.cipher,"AES-256-GCM");
  assert.equal(encrypted.iterations,310000);
  assert.ok(!JSON.stringify(encrypted).includes("Pessoa Teste"),"plaintext personal data must not be exported");
  const baseKey=await webcrypto.subtle.importKey("raw",new TextEncoder().encode(form.data.backup_pass),"PBKDF2",false,["deriveKey"]);
  const aesKey=await webcrypto.subtle.deriveKey({name:"PBKDF2",salt:decode(encrypted.salt),iterations:encrypted.iterations,hash:"SHA-256"},baseKey,{name:"AES-GCM",length:256},false,["decrypt"]);
  const decrypted=await webcrypto.subtle.decrypt({name:"AES-GCM",iv:decode(encrypted.iv)},aesKey,decode(encrypted.data));
  const payload=JSON.parse(new TextDecoder().decode(decrypted));
  assert.equal(payload.kind,"barquinha-attendance-module-snapshot");
  assert.equal(payload.tables.barquinha_attendance_patients[0].nome,"Pessoa Teste");
  assert.equal(payload.tables.barquinha_attendance_events[0].next_status,"Aguardando");
  assert.deepEqual(payload.photos,[]);
  assert.ok(form.resetWasCalled);
});
