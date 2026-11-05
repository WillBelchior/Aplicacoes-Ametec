# Plataforma Barquinha — Arquitetura preparada para expansão

## Estado atual

A Plataforma Barquinha é a **porta de entrada comum** da instituição. O catálogo de módulos, em `plataforma-barquinha/modules.js`, alimenta os menus, a Visão Geral e as telas reservadas.

| Módulo | Estado | Armazenamento |
| --- | --- | --- |
| Projetos Barquinha | Em funcionamento | Tabelas existentes `barquinha_*` no Supabase |
| Atendimentos Barquinha | MVP de homologação | Tabelas isoladas `barquinha_attendance_*` com RLS; não usar dados reais até aceite |
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

Acesso único (SSO) não equivale a permissão única. Projetos continua utilizando `barquinha_members`. Atendimentos utiliza adicionalmente a tabela `barquinha_attendance_access`, associada a membros ativos, com RLS para pacientes, Guias, atendimentos, eventos e fotos privadas. Nenhum usuário novo recebe acesso a Atendimentos automaticamente. A futura Gestão da Igreja exigirá suas próprias permissões e políticas.

### Financeiro da Igreja — proposta de domínio futuro

Projetar **categorias, contas/caixa, lançamentos de receita/despesa, competências, comprovantes privados, transferências, conciliação, contas a pagar/receber, aprovações e relatórios**. Valores devem usar `numeric(14,2)` no PostgreSQL e identificadores UUID; sem alterar a contabilidade das Obras. Os vínculos com Irmãos Oficiais devem ser explícitos, necessários e protegidos, nunca obrigatórios para todo lançamento.

### Continuidade dos endereços e dos dados locais

- Endereço principal atual: `https://obra-facil-acompanhamento.vercel.app/`, preservado para Projetos. A migração definitiva para o portal ainda não foi realizada.
- O portal possui uma cópia incorporada de Projetos na build, mas na prévia de Atendimentos esse acesso é substituído por um link para o aplicativo oficial, evitando alterações por código desatualizado.
- O projeto Vercel independente `plataforma-barquinha-preview` é o ambiente de homologação, com deployments separados e testes automáticos.
- A migração planejada do domínio oficial, quando aprovada, preservará a origem e o armazenamento anterior; essa substituição ainda não foi executada.
- Um service worker antigo da raiz é substituído por um script que desativa o cache antigo. O service worker legado da área `/projetos/` permanece isolado naquela pasta.
- Links antigos de recuperação `/?recovery=1` e com fragmento `type=recovery` são encaminhados no navegador para `/projetos/index.html` mantendo os parâmetros; a recuperação permanece no módulo legado.
- O formulário antigo de cadastro/recuperação está disponível pelo link interno `/projetos/index.html` a partir do login central.
- A operação offline de Projetos ainda pertence ao módulo legado e não implica suporte offline dos demais módulos.

### Cuidados antes de incorporar outros módulos

Atendimentos já possui schema isolado, RLS, bucket privado e testes de banco. A aplicação está em **homologação**, não em produção: use somente pacientes fictícios até a revisão de LGPD, retenção, rotinas de backup e testes completos em navegadores. Gestão da Igreja permanece apenas planejada.
