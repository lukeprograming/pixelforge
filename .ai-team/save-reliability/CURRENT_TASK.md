# Current task

Owner: Codex CLI

Reviewer: Product Owner

Status: APPROVED_FOR_MERGE

## Objective

Corrigir o autosave e transformar o botão Salvar em uma ação real e verificável.

## Scope

- autosave no mouse-up, pausa do traço, blur e aba oculta;
- indicador visual de estado;
- botão Salvar sincroniza integralmente o frame local;
- validação atômica do frame no backend;
- proteção contra fechar a página com alterações pendentes.

## Risks

- não reintroduzir uma gravação integral a cada posição do mouse;
- preservar a ordem dos traços já implementada;
- impedir matriz parcial ou índices de paleta inválidos.
