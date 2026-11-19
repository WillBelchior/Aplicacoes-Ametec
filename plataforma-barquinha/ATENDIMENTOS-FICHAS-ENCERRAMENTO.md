# Atendimentos Barquinha — Fichas, cadastro remoto e encerramento

Implementação adicional, sem substituir nem alterar o módulo Projetos Barquinha.

## Cadastros de pacientes

- Guia pode ser selecionado no cadastro e fica como Guia padrão do paciente.
- Na chegada, buscar o paciente digitando o nome e escolhendo a sugestão, com Guia e prioridade preenchidos automaticamente.
- Quando a recepção altera o Guia da chegada, o novo vínculo é salvo como Guia padrão para o próximo atendimento.
- Data de nascimento calcula a idade na tela e gera prioridade **Idoso a partir dos 60 anos completos**, independentemente de sexo. O banco também confere a classificação ao emitir a ficha.
- Cadastro na modalidade **À distância** permite apenas nome e endereço; nascimento, CPF, telefone, foto e Guia são opcionais.
- **Cadastro à distância não é autorização para realizar atendimento remoto**. A autorização do Presidente continua pendente de fluxo próprio; inserções remotas ou após 17h são bloqueadas tanto no cliente quanto pelo banco.
- Qualquer paciente autorizado pode ter seus dados cadastrais editados pela recepção, incluindo Guia, endereço e nova foto.
- Foto por arquivo ou câmera do aparelho (requer permissão do navegador e HTTPS); as imagens são compactadas e salvas em bucket privado.
- Fotos capturadas não são reutilizadas ao mudar de paciente; uma fotografia descartada deixa de ser usada na próxima ficha.

## Fichas por Guia

- A sequência global `ordem` continua no banco como histórico técnico de chegada.
- A ficha visível é calculada por **data + Guia + tipo** e gravada em `ficha_tipo` e `ficha_numero`.
- Normais: `01, 02, 03...`; prioritários: `P01, P02, P03...`.
- Um Guia pode ter `01` e `P01` simultaneamente. Outro Guia inicia suas próprias sequências em `01` e `P01`.
- Banco serializa emissões simultâneas com advisory transaction lock e protege a unicidade com índice único.
- Os atendimentos anteriores recebem fichas pela ordem histórica, sem excluir pacientes ou eventos.

## Fila e expediente

- Status editável no cartão da Fila Geral: Aguardando, Chamado, Em atendimento, Concluído, Não compareceu e Desistente.
- Históricos com status antigo `Cancelado` continuam consultáveis; o status antigo não é exibido como opção para novos registros.
- A fila diária mantém todas as fichas da data independentemente do estado, e apresenta prioritários destacados em vermelho.
- Botão **Finalizar Atendimentos**, exclusivo da recepção, registra data/hora e usuário.
- Após finalizar, o servidor bloqueia novas chegadas e mudanças de status para a data encerrada.
- A lista imprimível é emitida somente após o encerramento, com as colunas Ordem de Atendimento, Nome Paciente, Guia e Situação; subtotal após cada Guia, total geral e campo para assinatura do(a) Recepcionista com a data.
- Usar **Imprimir ou salvar a lista em PDF** via diálogo de impressão do navegador. Não é gerado arquivo PDF permanente no banco.

## Segurança, integridade e publicação

- Migrar as tabelas separadas de Atendimentos com:
  - `migrations/20261119_fichas_e_cadastros.sql`
  - `migrations/20261119_autorizacao_presidente.sql`
- As duas migrações foram aplicadas ao Supabase existente em 19/11/2026.
- Antes/depois: 37 pacientes, 5 Guias, 38 visitas e 40 eventos. Foram atribuídas 38 fichas, sem números duplicados. Nenhuma exclusão.
- O acesso ao módulo exige membro ativo e permissão separada; operações de gravação obedecem à RLS.
- O banco impede atendimentos remotos ou novos registros de chegada após 17h, até que o fluxo de aprovação presidencial exista.
- Nenhum dado sensível real deve ser colocado em capturas de telas ou resultados de testes.
- GitHub Actions executa `node --test plataforma-barquinha/tests/*.test.mjs` e `node plataforma-barquinha/build.mjs`.

**Estado da publicação:** o frontend nesta ramificação ainda precisa ser publicado na Plataforma. A API da Vercel respondeu `api-deployments-free-per-day` (limite diário de implantações). O banco já tem as migrações compatíveis, mas não considerar as novas telas ativas enquanto o deployment da mesma revisão não estiver READY no domínio da Plataforma.
