# Plataforma Barquinha — Atendimentos (MVP de homologação)

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
