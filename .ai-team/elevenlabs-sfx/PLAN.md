# Implementation Plan

1. Isolar a integração do provedor em `backend/app/elevenlabs_sfx.py`.
2. Ler a chave somente de `.env`/variável de ambiente e excluir segredos e áudios dos exports Git/ZIP.
3. Expor rotas locais para status, geração e download.
4. Adicionar modal de efeitos sonoros ao frontend existente.
5. Cobrir serialização, segurança de nomes, erros externos e persistência com mocks.
6. Validar backend, frontend estático e documentação sem realizar geração faturada.
