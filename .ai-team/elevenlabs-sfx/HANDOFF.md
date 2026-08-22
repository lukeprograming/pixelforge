# Handoff

FROM: Codex CLI
TO: Claude Code

## Status

READY FOR REVIEW

## Implementation

- backend REST isolado em `backend/app/elevenlabs_sfx.py`;
- rotas de status, geração e download em `backend/app/main.py`;
- modal completo no frontend;
- chave local por `.env`, bloqueada no Git e no ZIP;
- MP3s persistidos em `backend/data/audio_exports/`;
- documentação e testes com transporte simulado.

## Tests

- `python -m unittest discover -s tests -v`: 4 passed;
- `node --check frontend/js/api.js`: passed;
- `node --check frontend/js/app.js`: passed;
- smoke test local: status 200 e geração sem chave 503, sem rede externa;
- `git diff --check`: passed.

## Review focus

- chave ausente em frontend, logs, ZIP e Git;
- nenhuma chamada real nos testes;
- tratamento de falhas 401/429/5xx;
- UX deixa claro que gerar consome créditos.
