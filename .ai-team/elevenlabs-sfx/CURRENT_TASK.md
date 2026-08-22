# Current Task

## Feature

Gerador local de efeitos sonoros via ElevenLabs no PixelForge.

## Objective

Permitir gerar, ouvir e baixar um efeito sonoro a partir de um prompt sem expor a chave da API ao navegador ou ao Git.

## Owner

Codex CLI

## Reviewer

Claude Code

## Status

READY FOR REVIEW

## Scope

- configuração local por `ELEVENLABS_API_KEY`;
- chamada backend ao endpoint de Sound Effects;
- controles de prompt, duração, influência e loop;
- preview e download do MP3 gerado;
- persistência local dos resultados;
- testes que não chamam a API real nem consomem créditos.

## Out of scope

- text-to-speech, música e clonagem de voz;
- envio da chave ao frontend;
- deploy ou configuração da chave na VPS;
- geração automática de áudio durante testes.
