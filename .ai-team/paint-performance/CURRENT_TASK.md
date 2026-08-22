# Current task

Owner: Codex CLI

Reviewer: Claude Code

Status: READY_FOR_REVIEW

## Objective

Eliminar o delay de desenho causado por uma gravação JSON completa a cada carimbo
do pincel.

## Scope

- JSON compacto no armazenamento;
- acumular regiões durante o gesto;
- aplicar e persistir o lote uma vez no mouse-up;
- redesenhar somente as regiões tocadas durante o arraste;
- preservar edição otimista, espelho, máscara e fill.

## Out of scope

- banco de dados;
- autenticação;
- redesign da UI;
- mudanças no projeto Terraria.
