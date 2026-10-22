# Plataforma Barquinha — Login integrado e navegação por módulos

**Branch:** `feature/plataforma-barquinha-login-navegacao`

## Funcionalidades desta versão

- Login com o mesmo **Supabase Auth** do Projetos Barquinha (mesmo projeto `tvhvwpyuobdonkqctogh`).
- Verificação da tabela `barquinha_members`, exigindo associação com status **active**.
- Opção de dispositivo confiável. Sem essa opção, a sessão usa `sessionStorage`.
- Três áreas principais: **Visão Geral**, **Projetos Barquinha** e **Atendimentos Barquinha**.
- Projetos possui subabas: **Minhas Obras, Financeiro, Estoque, Cadastro, Histórico e Acessos**.
- Projetos roda dentro da Plataforma, sob a **mesma origem**, com sessão compartilhada entre o aplicativo e o módulo de Obras.
- O arquivo original `obra-facil/index.html` **não sofre transformação ou alteração** em produção: `build.mjs` cria uma cópia adaptada somente no diretório gerado para a Plataforma.
- Os dados já registrados nas obras são recuperados pelo módulo existente, com suas políticas de acesso.
- Atendimentos continua com pacientes fictícios, fila por colunas por Guia, foto/CPF e tela de autorizações **apenas para testes**.

## Executar localmente

Na raiz do repositório:

```bash
node plataforma-barquinha/build.mjs
cd plataforma-barquinha/dist
py -m http.server 8080
```

Abra `http://localhost:8080/`. Para entrar, utilize uma **conta de teste autorizada** na tabela de membros do Projetos Barquinha. O módulo Projetos é servido de `/projetos/index.html`.

Não abra diretamente os arquivos pelo protocolo `file://`; o compartilhamento da sessão exige a mesma origem HTTP(S).

## Testes

Na raiz do repositório:

```bash
node --test plataforma-barquinha/tests/integration.test.mjs
```

O teste verifica a montagem do projeto, autenticação e associação aos membros, presença das seis subabas e isolamento do arquivo legado. Após publicar a prévia, valide o login, a navegação, o Financeiro de uma obra, a troca de módulos e o logout **sem salvar dados fictícios nas obras reais**.

## Publicação

Projeto Vercel independente: `plataforma-barquinha-preview`.

- Repositório: `WillBelchior/Aplicacoes-Ametec`.
- Raiz: repositório inteiro, para permitir a cópia da aplicação `obra-facil`.
- Comando de build: `node plataforma-barquinha/build.mjs`.
- Output Directory: `plataforma-barquinha/dist`.
- Branch de desenvolvimento: `feature/plataforma-barquinha-login-navegacao`.
- Nenhuma migração no Supabase; o login é compartilhado, mas ainda não existe banco de Atendimentos.

**Privacidade:** Não cadastre CPF, fotografia, endereços ou relatórios verdadeiros de pacientes nessa versão. O módulo de Atendimentos não possui persistência/autorização em banco e não está pronto para uso real.


## Expansão modular e domínio oficial

- **Endereço principal após a migração:** `https://obra-facil-acompanhamento.vercel.app/`, agora exibindo a Plataforma Barquinha.
- Cadastro e recuperação de senha: link interno `/projetos/index.html`, preservando o login original.
- Catálogo: `modules.js`; adiciona menus e telas reservadas sem criar novas tabelas.
- Futuros módulos: **Gestão da Igreja**, com **Financeiro da Igreja** e **Irmãos Oficiais**, marcados **Em planejamento**.
- `build.mjs` gera `dist/` com a entrada principal, o Projetos Barquinha em `projetos/index.html` e recursos necessários para manter o acesso legado.
- O antigo Service Worker do domínio de Obras é aposentado na raiz para que não continue apresentando a página antiga por cache. A rotina offline do módulo de Obras permanece isolada em `/projetos/`.
- Para dados reais de outros módulos, ainda faltam esquema de dados, políticas RLS, permissões específicas, trilha de auditoria, política de privacidade e testes.

Consulte `ARQUITETURA.md` para orientações detalhadas de ampliação. Não colocar dados de pacientes ou de irmãos oficiais nos módulos demonstrativos.
