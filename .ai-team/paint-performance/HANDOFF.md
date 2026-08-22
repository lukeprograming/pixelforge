# Handoff

FROM: Codex CLI

TO: Claude Code

Status: READY_FOR_REVIEW

Revisar principalmente atomicidade do endpoint `/stroke`, ordenação de traços
consecutivos no frontend e comportamento do mouse-up fora do canvas.

## Implementation

- JSON persistido sem indentação, mantendo arquivo temporário + `os.replace`;
- novo `PATCH /api/sprites/{id}/stroke`, com validação integral antes de mutar;
- pincel, borracha, espelho, máscara e fill acumulam regiões até mouse-up;
- saves são enfileirados para preservar ordem e recebem uma tentativa extra;
- redraw parcial no arraste, sem varrer o canvas inteiro por carimbo.

## Tests

- `python -m unittest discover -s backend/tests -v`: 7 passed;
- `node --check frontend/js/api.js`: passou;
- `node --check frontend/js/app.js`: passou;
- `node --check frontend/js/canvas.js`: passou;
- `node --check frontend/tests/paint_ui_smoke.js`: passou;
- `node frontend/tests/paint_ui_smoke.js`: arraste longo, espelho, máscara,
  fill, lote único e reabertura persistida passaram;
- API real: create -> stroke(3 regiões) -> get -> delete passou;
- benchmark 512x512: JSON 3,42 MB -> 0,53 MB e 9,6 ms -> 2,4 ms.

## Risks

- O Firefox headless do container não gerou screenshot; não houve inspeção visual
  automatizada. A lógica real dos gestos da UI está coberta pelo novo smoke test.
- Undo/redo e ferramentas programáticas antigas continuam usando `/pixel`; ficaram
  fora do gargalo delegado desta rodada.
