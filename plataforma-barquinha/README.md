# Atendimentos Barquinha — Operação oficial

**Endereço oficial:** https://atendimentos-barquinha.vercel.app/  
**Projetos Barquinha permanece independente:** https://obra-facil-acompanhamento.vercel.app/

A aplicação do Atendimentos foi publicada em projeto próprio na Vercel, com login institucional, tabelas próprias no Supabase, RLS, filas por Guia, cadastro de pacientes, chegadas e histórico. Não possui arquivos da aplicação Projetos dentro da build independente.

## Procedimento antes da primeira utilização com pessoas reais

- A instituição deve definir o controlador dos dados, a finalidade do cadastro, a base legal aplicável, a comunicação de privacidade, a política de retenção e o tratamento de dados potencialmente sensíveis (p. ex. religião ou saúde), conforme LGPD.
- Usar contas individuais, não compartilhar credenciais; somente membros ativos com autorização própria em `barquinha_attendance_access` têm acesso. No domínio Atendimentos a sessão fica no navegador até que a aba seja encerrada, sem a opção de confiar permanentemente no dispositivo.
- Fazer um teste completo com registros **fictícios**: cadastrar Guia, cadastrar paciente, adicionar chegada, mudar situação, consultar histórico, atualizar a página e confirmar persistência; testar upload e consulta da fotografia.
- Abrir **Expediente → Cópia de segurança** e testar o download criptografado com senha forte. Conservar a senha separada do arquivo. Essa cópia é complementar e sua restauração exige apoio técnico.
- Preparar backup completo regular do banco Supabase e do Storage fora da plataforma; o plano Free não oferece backups automáticos. Testar periodicamente o procedimento de restauração.

## Rotina de cada expediente (eventos a cada 15 dias ou mais)

1. **Na véspera:** confirmar que o Supabase está ativo, abrir Atendimentos, conferir filas e Guias e baixar cópia criptografada.
2. **No início:** confirmar login das pessoas autorizadas, registrar e acompanhar a fila por Guia.
3. **Durante:** não registrar lançamentos enquanto houver erro de conexão; seguir procedimento físico sob controle de acesso até o serviço voltar, evitando registros duplicados na retomada.
4. **Ao terminar:** revisar pendências e situações, baixar nova cópia criptografada e guardá-la em local institucional protegido.
5. **Se o banco estiver pausado:** reativar pelo painel Supabase e testar conexão antes de voltar aos lançamentos. O Free pode ser pausado por inatividade e não garante operação contínua.

## Limites atuais

- Expediente contém painel de orientação/backup, **não** abertura e encerramento formal automático.
- Autorizações especiais, devoluções de materiais e controle fino por Guia permanecem para etapa futura.
- A cópia criptografada exporta tabelas e fotografias de Atendimentos, **não** banco completo, contas Auth, projetos ou configurações de outros módulos.
- Não existe rotina automatizada de restauração, nem backup externo automatizado. A organização deve assegurar backups adequados antes do uso continuado.
- Uma implantação READY e testes automatizados não substituem um teste de ponta a ponta em navegador autenticado nem aprovação interna do tratamento de dados pessoais.

---


**Branch de desenvolvimento:** `feature/barquinha-plataforma-modular-portal`  
**Publicação:** projeto Vercel separado `plataforma-barquinha-preview`; o endereço oficial de Projetos não é alterado.

## Fluxo funcional preparado

1. Entrar com a conta existente da Plataforma Barquinha.
2. Abrir **Atendimentos → Guias** e cadastrar o primeiro Guia (nome e cor).
3. Abrir **Pacientes → Cadastrar paciente**: nome e nascimento obrigatórios; telefone, CPF, encaminhamento e fotografia opcionais.
4. Abrir **Fila geral → Registrar chegada**, escolher paciente, Guia, modalidade e prioridade.
5. Abrir o cartão do atendimento e alterar a situação: Aguardando, Chamado, Em atendimento, Concluído, Não compareceu ou Cancelado.
6. Abrir **Pacientes → Ficha → Histórico** para conferir os atendimentos anteriores e as alterações de situação.

O mesmo paciente pode ter atendimentos em Guias diferentes no mesmo dia. Os atendimentos encerrados saem da fila do dia e permanecem no histórico. As filas são apresentadas em colunas por Guia, com rolagem horizontal em celulares.

## Estrutura do banco

O arquivo `schema-atendimentos.sql` foi aplicado ao Supabase existente com o nome de migração `barquinha_attendance_mvp_isolated_access_rls_audit`.

Tabelas novas:
- `barquinha_attendance_access`: permissão de acesso ao módulo, separada da autorização geral;
- `barquinha_attendance_patients`: cadastro único, incluindo CPF opcional e caminho privado da foto;
- `barquinha_attendance_guides`: Guias;
- `barquinha_attendance_visits`: atendimentos por data, Guia, prioridade e situação;
- `barquinha_attendance_events`: auditoria de criação e alterações de situação.

O bucket privado `barquinha-attendance-photos` aceita apenas JPG de até 2 MB. O armazenamento de Fotos e as tabelas das obras não foram alterados.

**Segurança:** RLS está habilitada para todas as tabelas de Atendimentos. Somente contas autorizadas em `barquinha_attendance_access`, que também sejam membros ativos da Plataforma, podem consultar dados. Os dois usuários que já estavam ativos foram autorizados inicialmente com papel `recepcao`. Novos usuários **não** recebem acesso automaticamente. Permissões de visualização por Guia poderão ser implementadas futuramente, como definido.

A interface **não armazena dados pessoais no localStorage**, não carrega dados fictícios como registros reais e usa URLs temporárias para fotografias.

## Testes

```bash
node --test plataforma-barquinha/tests/*.test.mjs
node plataforma-barquinha/build.mjs
```

A implantação de teste da Vercel executa os testes e o build antes de publicar. Um teste do Supabase com transação temporária verificou: criação de Guia, paciente, atendimento, mudança de situação e dois eventos de auditoria; todas as alterações foram revertidas com `ROLLBACK`.

## Cuidados da homologação

A versão ainda **não deve receber dados pessoais reais** sem validação da organização e documentação de finalidade, base legal, retenção, acesso e consentimentos/canais de informação compatíveis com a LGPD.

Pendências de próximas etapas:
- Autorizações especiais, expediente, materiais e devoluções;
- Criação/remoção de permissões de usuários pela interface;
- Restrição opcional da visualização a Guias específicos;
- Edição de cadastros, exclusão/retenção e gestão de fotografias;
- Consulta paginada, atualização colaborativa em tempo real, notificações e contingência offline;
- Testes completos com navegador e dispositivos móveis, recuperação de conta e revisão LGPD.

**Preservação de Projetos:** dentro da prévia, a navegação de Projetos fica somente com link para o site oficial, evitando editar obras reais por uma versão de desenvolvimento antiga. Nenhum deploy do domínio principal é realizado nesta fase.
