# Procedimento de publicação — endereço único Plataforma Barquinha

Este guia existe para evitar perda de acesso, dados locais e links de recuperação. **Não executar a migração enquanto as builds da Vercel estiverem bloqueadas.**

## Alvo

- Projeto Vercel de origem: `obra-facil-acompanhamento` na equipe `ametecind-2456`.
- Domínio público que permanece: `https://obra-facil-acompanhamento.vercel.app/`.
- O domínio servirá a **Plataforma Barquinha**, e não mais o index standalone do Obras.
- Obras continuará na mesma origem, em `/projetos/index.html`, incorporado no frame da plataforma.
- Projeto de prévia independente: `plataforma-barquinha-preview`.

## Pré-requisitos

1. Normalizar a branch de release com a `main` atual e passar os testes `node --test plataforma-barquinha/tests/*.test.mjs`.
2. Executar `node plataforma-barquinha/build.mjs` com sucesso. Verificar que `dist/index.html`, `dist/projetos/index.html`, `dist/sw.js` e `dist/manifest.webmanifest` foram gerados.
3. Confirmar a integridade dos registros no Supabase, realizar backup apropriado e verificar alterações locais pendentes no navegador antigo.
4. Validar a mesma conta ativa em ambos os módulos de Projetos e o link de recuperação de senha em domínio de teste devidamente autorizado.
5. Publicar uma **prévia da mesma versão exata** no projeto independente da Plataforma e validar em navegador real: login, persistência de sessão, troca de abas, dados de obras, edição/sincronização, logout, cadastro/recuperação e layout mobile.
6. Verificar que o limite de builds da Vercel foi restabelecido e que não existem falhas de CI.

## Implantação do antigo projeto Vercel como portal

Após aprovação da prévia e merge da mudança no GitHub, atualizar **somente** o projeto Vercel `obra-facil-acompanhamento`:

- Root Directory: raiz do repositório (`null` na API).
- Framework: Other (`null`).
- Build Command: `node --test plataforma-barquinha/tests/*.test.mjs && node plataforma-barquinha/build.mjs`.
- Output Directory: `plataforma-barquinha/dist`.

Manter a mesma equipe, o mesmo projeto e o mesmo domínio. Após a build de produção passar, confirmar que `/` exibe Plataforma Barquinha e `/projetos/index.html` apresenta a aplicação original de Obras dentro da origem.

**Importante:** A troca de conteúdo **não** modifica tabelas, linhas ou permissões do Supabase. O antigo `localStorage` continuará no domínio original. O antigo service worker de `/` é substituído por outro que limpa seu cache e se desregistra para liberar a página central. Os SW e recursos do módulo de Obras ficam em `/projetos/`.

## Testes de aceite no domínio definitivo

- Visão Geral exige login e mostra Projetos, Atendimentos e Gestão da Igreja como planejamento.
- Projetos > Minhas Obras, Financeiro, Estoque, Cadastro, Histórico e Acessos abrem o **mesmo conteúdo real de Obras**.
- O financeiro do redário mantém valores corretos ao trocar entre telas.
- Login com usuário ativo e logout funcionam; usuário não aprovado não acessa o gerenciador.
- O cadastro/recuperação de senha é acessível pelo login via `/projetos/index.html`.
- Links de recuperação antigos `/?recovery=1` continuam sendo redirecionados **internamente**, sem perda de fragmentos de autenticação.
- Mobile e tablet exibem navegação e módulos sem cortes. A fila de Atendimentos preserva rolagem horizontal.
- Atendimentos aceita **somente dados fictícios em memória**. Gestão da Igreja não aceita gravações.
- Verificar aplicação instalada/PWA antiga e atualização de service worker; instruir usuário a recarregar caso veja interface em cache.

## Plano de retorno

Se houver falha após a liberação, selecionar o deployment de produção anterior em `obra-facil-acompanhamento` e fazer rollback/promote conforme Vercel. Restaurar as configurações de build do projeto se necessário. **Não realizar restauração de banco** sem dano confirmado e validação específica. O rollback do frontend não apaga alterações legítimas já salvas no Supabase.

## Estado nesta etapa

- Código modular e catálogo no GitHub.
- Deploy novo **não realizado** enquanto Vercel apresenta `api-deployments-free-per-day` e `build-rate-limit`.
- Domínio antigo permanece com o Projetos Barquinha original até implantação validada.
