# Pacote 02 — Atendimentos Barquinha (não publicado)

## Melhorias incluídas

1. Remover foto no formulário de edição; mantém paciente e histórico, limpa referência no banco e exclui arquivo do armazenamento privado.
2. Chegada com três modalidades: presencial, à distância e trabalhador da casa. Não há autorização especial para modalidade remota; a restrição de chegada após 17h permanece.
3. Busca inteligente por nome ou CPF (resultados mostram apenas nomes). Ao selecionar, sugere Guia padrão e prioridade, mas ambos permanecem editáveis.
4. Fila Geral comporta até seis colunas, incluindo Triagem; rolagem horizontal a partir da sétima.
5. Iniciar/Finalizar Atendimentos na Fila Geral. Chegadas bloqueadas até a abertura do dia. Tempo do expediente e de cada atendimento calculados pelo servidor e visíveis nos relatórios; cronômetros atualizados sem consultas extras à API.
6. Histórico com tabela visual semelhante à Fila: Guia por cor, ficha prioritária vermelha, status e tempo. Exportação Excel (.xlsx) real, local, sem serviços externos; colunas com subtotais por Guia e total geral.
7. Guias exibem apenas Ativo/Inativo no resumo. Subcategoria de trabalhadores vinculados (nome, função e situação), sem criar logins.
8. Edição dos registros de chegada (paciente, Guia, modalidade, prioridade e situação). Exclusão lógica com motivo e auditoria preservada. Não conta em fila e relatório oficial; ver exclusões por filtro de auditoria.
9. Última data de atendimento exibida abaixo da idade na ficha do paciente.

## Segurança, compatibilidade e publicação

- Não houve exclusão de dados da instituição. Projetos Barquinha permanece intocado.
- Alterações sujeitas à autorização da recepção e administração, com RLS e funções verificadas no servidor.
- Permissão para atendimento remoto independe de aprovação presidencial, mas chegadas após 17h continuam exigindo autorização separada.
- O XLSX é exportação; importação de dados de planilhas não foi ativada por necessitar de tratamento de duplicidades.
- A migração de banco ainda NÃO foi aplicada. Isso evita bloquear a versão pública atual, que não possui o botão Iniciar Atendimentos.
- Roteiro para publicação consolidada: (1) testes automatizados e compilação; (2) backup do Supabase; (3) janela sem recepção ativa; (4) aplicar migration 20261122_pacote_02_fluxo_turno_relatorios.sql; (5) publicar a revisão no projeto existente na Vercel; (6) conferir status READY, domínio e testes reais de usuário autorizado.
- Se falhar antes da migração, manter a versão atual. Se falhar depois da migração, não usar a interface antiga para registrar chegadas até corrigir ou reverter a exigência do turno. Nunca apagar dados como alternativa de rollback.

## Testes de aceitação antes da publicação

Iniciar turno; consultar paciente por CPF e nome; selecionar Guia; registrar modalidade à distância; mudar situação para Em atendimento e Concluído; verificar tempos; corrigir ficha; excluir registro de teste e confirmar trilha de auditoria; vincular trabalhador; remover foto de teste; exportar XLSX; encerrar turno; conferir totais e assinatura em relatório. Usar apenas dados fictícios no ambiente de teste.

## Arquivos

- Branch: feature/barquinha-atendimentos-pacote-2-20261122
- Migração staged: plataforma-barquinha/migrations/20261122_pacote_02_fluxo_turno_relatorios.sql
- XLSX local: plataforma-barquinha/attendance-xlsx.js
- Testes: plataforma-barquinha/tests/attendance-package02.test.mjs
