# Plataforma Barquinha — Etapa 1 (fundação visual)

**Branch de desenvolvimento:** `feature/plataforma-barquinha-fundacao`.

Esta pasta contém uma **entrada visual isolada** para os módulos **Projetos Barquinha** e **Atendimentos Barquinha**. Todo conteúdo de Atendimentos é demonstrativo, fictício e fica somente na memória da página.

## Ver no computador, sem instalar dependências

Abra um terminal **na raiz do repositório** e execute:

```bash
python -m http.server 8080
```

Abra `http://localhost:8080/plataforma-barquinha/`.

No celular conectado à mesma rede, o endereço será `http://IP-DO-COMPUTADOR:8080/plataforma-barquinha/`, desde que o firewall permita conexões ao servidor local. Essa visualização via rede ainda **não** é uma PWA offline.

## O que existe

- Painel inicial unificado com módulos Projetos e Atendimentos.
- Link relativo ao módulo legado `../obra-facil/index.html` (funciona quando a raiz completa do repositório é servida).
- Fila geral organizada **em colunas por Guia**, com faixas coloridas de 12 px, filtros e cartões clicáveis. Em celulares, as colunas rolam horizontalmente na própria área da fila.
- Botão **+ Cadastrar paciente** no Atendimento do Dia. O formulário de cadastro é demonstrativo e apenas na memória, com verificação de nome/data de nascimento e telefone para possíveis duplicidades.
- O cadastro de paciente é separado do registro da chegada e **não** cria atendimento automaticamente.
- Ficha demonstrativa por paciente e destaque para o atendimento selecionado.
- Telas de pacientes, Guias, autorizações e expediente, com dados fictícios.
- Navegação mobile e desktop, sem bibliotecas externas e sem build.

## O que NÃO existe ainda

- Login único; autenticação, armazenamento/sincronização offline, gravação **persistente**, autorização, encerramento do dia e banco de Atendimentos.
- Integração de cadastros entre Projetos e Atendimentos.
- Migrações, tabelas ou mudanças no Supabase.
- Publicação em Vercel ou merge com main.

Não cadastrar pacientes reais aqui. O módulo existente de Obras continua como antes e mantém sua própria autenticação.

## Testes automatizados (Node.js 18+)

Na raiz do repositório:

```bash
node --test plataforma-barquinha/tests/smoke.test.mjs
```

O arquivo cobre 11 cenários de navegação, cartões de pacientes, colunas/filtro de Guias, cadastro temporário, prevenção de duplicidade, central de autorizações e ausência de gravações externas nesta etapa.

## Testes mínimos

1. Abra a página inicial e selecione Atendimentos.
2. Verifique as três colunas de Guias, rolando horizontalmente no celular, e teste o filtro de Guia.
3. Clique em **+ Cadastrar paciente**, inclua apenas dados fictícios e confira a ficha recém-criada e a aba Pacientes. Atualizar a página descarta o registro.
4. Tente cadastrar novamente o mesmo nome e nascimento: deve mostrar alerta de possível duplicidade.
5. Abra um cartão da fila e alterne Dados / Materiais / Histórico.
6. Volte para a fila, abra Pacientes e pesquise por nome.
7. Abra Guias, Autorizações e Expediente.
8. Abra Projetos e siga o link para `obra-facil/index.html`.
9. Repita em tela estreita de celular; confirme que só a área das colunas role horizontalmente.
10. Verifique que o Supabase continua sem tabelas de Atendimentos.

### Próxima fase

Desenvolver autenticação e autorização por módulo, banco de Atendimentos com RLS e integração gradual após validação. Criar ambiente de testes antes de qualquer migração em produção.
