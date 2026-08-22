# Efeitos sonoros locais com ElevenLabs

O PixelForge chama o endpoint oficial de Sound Effects somente pelo backend local. A chave nunca é enviada ao JavaScript.

## Configuração da chave

Na raiz do PixelForge:

```bash
cp .env.example .env
```

Abra `pixelforge/.env` e substitua o valor:

```dotenv
ELEVENLABS_API_KEY=sua_chave_real_aqui
```

Reinicie o PixelForge. O botão `🔊 Efeitos` mostrará `API local configurada` quando a variável estiver disponível.

O `.env`:

- está ignorado pelo Git;
- é excluído do ZIP criado pelo botão `Projeto (.zip)`;
- não possui rota de leitura ou escrita no frontend;
- não deve ser colado em chats, issues, commits ou screenshots.

## Uso

1. Abra `🔊 Efeitos`.
2. Dê um nome curto ao arquivo.
3. Descreva o efeito em até 450 caracteres.
4. Escolha duração entre 0,5 e 30 segundos, influência e loop.
5. Clique uma única vez em `Gerar efeito` e aguarde.
6. Ouça no próprio modal ou baixe o MP3.

Cada clique realiza uma geração faturada. Os arquivos ficam em `backend/data/audio_exports/`, diretório local ignorado pelo Git.

## API local

- `GET /api/audio/status` — informa apenas se a chave foi configurada.
- `POST /api/audio/sound-effects` — gera e salva um MP3.
- `GET /api/audio/files/{filename}` — reproduz ou baixa uma geração local.

Exemplo de payload:

```json
{
  "label": "healer-armor-equip",
  "text": "short celestial healing chime, crystalline shimmer, clean game one-shot",
  "duration_seconds": 2.0,
  "prompt_influence": 0.3,
  "loop": false
}
```
