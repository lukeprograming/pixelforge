# Decisions

## 2026-08-22 — Chave exclusivamente no backend

A chave será lida de `pixelforge/.env` como `ELEVENLABS_API_KEY`. O frontend recebe somente `configured: true/false`; não existe rota para gravar ou recuperar a chave.

## 2026-08-22 — REST direto e saída MP3 compatível

A integração usará o endpoint oficial `POST /v1/sound-generation` e `mp3_44100_128`. O cliente oficial não será adicionado: a biblioteca padrão do Python basta para uma única chamada HTTP e reduz dependências.

## 2026-08-22 — Testes sem créditos

Toda resposta externa será simulada nos testes. Uma geração real só ocorre por ação explícita do usuário na interface.

