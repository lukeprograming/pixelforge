# Handoff

FROM: Codex CLI

TO: Product Owner

Status: APPROVED

O Product Owner autorizou integração e push em 2026-08-22 após confirmar que
o teste anterior ainda havia sido executado contra a `main` antiga.

## Root cause

- O botão Salvar era apenas um alerta e não chamava nenhuma API.
- O autosave só disparava no mouse-up/blur e não mostrava sucesso ou falha.

## Implementation

- autosave no mouse-up, blur, aba oculta e após 800 ms sem novas edições;
- indicador visível de alterações pendentes, salvando, salvo e erro;
- botão Salvar faz sincronização integral do frame;
- gerador de GIF salva primeiro o sprite aberto e o seleciona automaticamente;
- geração é abortada com erro visível se a sincronização anterior falhar;
- nova rota `PUT /api/sprites/{id}/frame/{frame}` com validação atômica;
- aviso antes de fechar a página com alterações pendentes;
- versionamento dos scripts no HTML para evitar cache antigo.

## Tests

- 9 testes de backend aprovados;
- smoke da UI cobre autosave temporizado, salvamento manual, reabertura e erro;
- rota real validada com create -> PUT frame -> GET -> delete;
- syntax checks e `git diff --check` aprovados.

## Risk

- O aviso `beforeunload` depende do comportamento padrão do navegador; navegadores
  modernos exibem sua própria mensagem em vez do texto da aplicação.
