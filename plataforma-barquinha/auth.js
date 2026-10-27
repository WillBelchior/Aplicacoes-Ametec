"use strict";
/* Autenticação compartilhada com Projetos Barquinha.
   Usa o mesmo Supabase e a mesma chave de armazenamento; os dados de Atendimentos
   permanecem fictícios e nunca são consultados no banco nesta fase. */
(() => {
  const URL="https://tvhvwpyuobdonkqctogh.supabase.co";
  const KEY="sb_publishable_itdqm8sjFzvPl4YJzlbe1g_Md2JKZ_U";
  const STORAGE_KEY="barquinha-auth-v1";
  const TRUSTED_KEY="barquinha-device-trusted-v1";
  let client=null,user=null,profile=null,kind=null,error="",busy=false;
  let renderCallback=()=>{};
  const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const notify=()=>renderCallback();
  function makeClient(mode){
    if(!window.supabase?.createClient)throw Error("Biblioteca Supabase indisponível. Verifique a internet.");
    const storage=mode==="local"?localStorage:sessionStorage;
    window.__barquinhaPlatformAuthKind=mode;
    kind=mode;
    return window.supabase.createClient(URL,KEY,{auth:{
      persistSession:true,autoRefreshToken:true,storage,storageKey:STORAGE_KEY,
      detectSessionInUrl:false
    }});
  }
  async function verify(u){
    const {data,error:membershipError}=await client.from("barquinha_members")
      .select("status,display_name,user_id").eq("user_id",u.id).maybeSingle();
    if(membershipError)throw Error("Falha ao validar acesso: "+membershipError.message);
    if(data?.status!=="active")
      throw Error(data?.status==="revoked"?"Este usuário não tem mais acesso.":"Cadastro ainda não autorizado no Projetos Barquinha.");
    user=u;profile=data;return true;
  }
  async function init(cb){
    renderCallback=cb;
    try {
      client=makeClient(localStorage.getItem(TRUSTED_KEY)==="yes"?"local":"session");
      const {data,error:authError}=await client.auth.getUser();
      if(!authError&&data?.user){try{await verify(data.user);}catch(e){error=e.message;}}
    }catch(e){error="Não foi possível verificar a sessão: "+e.message;}
    notify();
  }
  async function login(form){
    if(busy)return;
    const data=new FormData(form);
    const email=String(data.get("email")||"").trim();
    const password=String(data.get("password")||"");
    const trusted=data.get("trusted")==="on";
    if(!email||!password){error="Informe e-mail e senha.";notify();return;}
    busy=true;error="";notify();
    try{
      const mode=trusted?"local":"session";
      if(client){try{await client.auth.signOut({scope:"local"});}catch(e){}}
      try{localStorage.removeItem(STORAGE_KEY);sessionStorage.removeItem(STORAGE_KEY);}catch(e){}
      client=makeClient(mode);
      const result=await client.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
      if(!result.data?.user)throw Error("Não foi possível autenticar este usuário.");
      try{await verify(result.data.user);}catch(e){
        await client.auth.signOut({scope:"local"});
        throw e;
      }
      if(trusted)localStorage.setItem(TRUSTED_KEY,"yes");
      else localStorage.removeItem(TRUSTED_KEY);
    }catch(e){user=null;profile=null;error="Não foi possível entrar: "+(e.message||e);}
    finally{busy=false;notify();}
  }
  async function logout(){
    if(!confirm("Deseja sair da Plataforma Barquinha neste aparelho?"))return;
    try{await client?.auth.signOut({scope:"local"});}catch(e){}
    try{localStorage.removeItem(TRUSTED_KEY);localStorage.removeItem(STORAGE_KEY);sessionStorage.removeItem(STORAGE_KEY);}catch(e){}
    user=null;profile=null;kind=null;window.__barquinhaPlatformAuthKind=null;
    error="";notify();
  }
  function gateHTML(){
    return '<div class="platform-login"><form class="login-box" id="platform-login-form">'+
      '<div class="login-symbol" aria-hidden="true">⚓</div><div class="eyebrow">ACESSO INSTITUCIONAL</div>'+
      '<h1>Plataforma Barquinha</h1><p>Entre com o mesmo e-mail e senha do Projetos Barquinha.</p>'+
      '<label>E-mail<input name="email" type="email" required autocomplete="username" maxlength="255" placeholder="seu@email.com"></label>'+
      '<label>Senha<input name="password" type="password" required minlength="6" autocomplete="current-password"></label>'+
      '<label class="login-trusted"><input name="trusted" type="checkbox"><span>Confiar neste aparelho e manter conectado</span></label>'+
      (error?'<div class="form-error" role="alert">'+escape(error)+'</div>':"")+
      '<button type="submit" class="button" '+(busy?"disabled":"")+'>'+(busy?"Verificando…":"Entrar na plataforma")+'</button>'+
      '<p class="login-help">Para criar uma conta ou recuperar a senha, abra <a href="/projetos/index.html">Cadastro de usuário e recuperação de senha</a>.</p>'+
      '<small>Atendimentos é demonstrativo. Não utilize dados reais de pacientes.</small></form></div>';
  }
  window.PlatformAuth={
    init,login,logout,gateHTML,
    get user(){return user;},
    get profile(){return profile;},
    get kind(){return kind;}
  };
})();
