# Plataforma Barquinha — Arquitetura preparada para expansão

## Estado atual

A Plataforma Barquinha é a **porta de entrada comum** da instituição. O catálogo de módulos, em `plataforma-barquinha/modules.js`, alimenta os menus, a Visão Geral e as telas reservadas.

| Módulo | Estado | Armazenamento |
| --- | --- | --- |
| Projetos Barquinha | Em funcionamento | Tabelas existentes `barquinha_*` no Supabase |
| Atendimentos Barquinha | Demonstração | Dados fictícios, somente em memória |
| Gestão da Igreja | Planejamento | Nenhum dado/tabela criado |
| Financeiro da Igreja | Planejamento (subárea) | Nenhum dado/tabela criado |
| Irmãos Oficiais | Planejamento (subárea) | Nenhum dado/tabela criado |

### Para inserir novos módulos

1. Acrescentar um registro em `modules.js` com `id` único, `route`, `status`, `permissionKey`, rótulos e seções. O menu e a Visão Geral não devem duplicar estes metadados.
2. Criar um diretório isolado `modules/<nome>` com páginas, testes e serviço de dados.
3. Implementar a rota real e seu estado de carregamento/erro no roteador principal. Módulos em `planned` apresentam apenas informações; não expõem ações de gravação.
4. Criar migrações SQL revisadas no ambiente de desenvolvimento e com backup. Não reaproveitar tabelas de outros módulos sem definir contratos de leitura estritamente necessários.
5. Definir quem pode consultar, criar, editar, aprovar e excluir no novo domínio. Aplicar Supabase Row Level Security, e verificar autorização no servidor; nunca confiar só no menu, na rota ou nos campos `permissionKey`.
6. Implementar audit trail para registros administrativos e financeiros: autor, horário, valores anterior/novo quando cabível e motivo de edição.
7. Testar fluxos em desktop/mobile, offline/reconexão, recuperação de senha, proteção de dados e migração antes de ativar `status:"active"`.

### Pessoas: identidades separadas e consentimento

O cadastro de **Irmãos Oficiais** pode identificar pertencimento religioso. Deve ter finalidade definida, base legal adequada, minimização de dados, retenção, política de acesso e auditoria. Não inferir filiação religiosa de pacientes nem cruzar tabelas de Atendimentos automaticamente.

Separações recomendadas para fase futura:
- **Contatos de Obras**: participantes e prestadores ligados a obras.
- **Pacientes**: prontuários/atendimentos sensíveis, restritos aos trabalhadores autorizados.
- **Irmãos Oficiais**: cadastro institucional, restrito à administração autorizada.
- **Usuários de login**: `auth.users` identifica conta. Pertencer ao sistema não significa acesso a todos os módulos.

Acesso único (SSO) não equivale a permissão única. Atualmente Projetos utiliza sua autorização legada `barquinha_members`. Antes de colocar Atendimentos ou Igreja em produção, criar `platform_module_memberships` (nome ilustrativo), roles por módulo, políticas RLS e testes de autorização. **Essa tabela ainda NÃO existe.**

### Financeiro da Igreja — proposta de domínio futuro

Projetar **categorias, contas/caixa, lançamentos de receita/despesa, competências, comprovantes privados, transferências, conciliação, contas a pagar/receber, aprovações e relatórios**. Valores devem usar `numeric(14,2)` no PostgreSQL e identificadores UUID; sem alterar a contabilidade das Obras. Os vínculos com Irmãos Oficiais devem ser explícitos, necessários e protegidos, nunca obrigatórios para todo lançamento.

### Continuidade dos endereços e dos dados locais

- Endereço principal: `https://obra-facil-acompanhamento.vercel.app/`, agora abrindo a Plataforma Barquinha.
- O legado de Obras permanece integrado na mesma origem em `/projetos/index.html`.
- A aplicação separada `plataforma-barquinha-preview.vercel.app` continua disponível como ambiente de teste.
- O login e o armazenamento anterior da origem `obra-facil-acompanhamento.vercel.app` são preservados pela troca **de conteúdo do mesmo domínio**, sem redirecionamento entre domínios.
- Um service worker antigo da raiz é substituído por um script que desativa o cache antigo. O service worker legado da área `/projetos/` permanece isolado naquela pasta.
- Links antigos de recuperação `/?recovery=1` e com fragmento `type=recovery` são encaminhados no navegador para `/projetos/index.html` mantendo os parâmetros; a recuperação permanece no módulo legado.
- O formulário antigo de cadastro/recuperação está disponível pelo link interno `/projetos/index.html` a partir do login central.
- A operação offline de Projetos ainda pertence ao módulo legado e não implica suporte offline dos demais módulos.

### Cuidados antes de incorporar outros módulos

Nenhuma nova tabela, RLS, bucket ou migração de dados foi executada nesta etapa. Só `Projetos` usa registros verdadeiros. Ações de `Atendimentos` e `Igreja` não devem receber dados reais até a preparação da segurança e da persistência.
