# PixelForge

Editor de pixel art (HTML/CSS/JS + backend FastAPI) com foco em sprites
pequenos e precisos (ex: 40×40 até 128×128, estilo Terraria/Calamity),
paleta limitada a 30 cores por padrão (destravável por sprite), export
PNG com fundo transparente, e uma API por coordenada documentada para
uso por agentes de IA (`docs/AGENT_API.md`).

## Rodar localmente

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt --break-system-packages
uvicorn app.main:app --reload --port 8000
```

Abra `http://localhost:8000` — o editor e a API rodam no mesmo
processo.

### ElevenLabs — efeitos sonoros

Copie `.env.example` para `.env`, coloque sua chave em
`ELEVENLABS_API_KEY` e reinicie o servidor. Depois use o botão
`🔊 Efeitos`. A chave permanece no backend local e é excluída do Git e
do ZIP do projeto. Instruções completas em `docs/ELEVENLABS_SFX.md`.

## Estrutura

```
pixelforge/
  backend/
    app/
      main.py         # rotas da API + serve o frontend estático
      models.py        # Sprite (palette_locked), Frame, edits (Pydantic)
      storage.py        # persistência simples em JSON (1 arquivo/sprite)
      png_export.py      # export PNG, analyze(), matriz .txt import/export,
                          # verificador de downscale (analyze_pixel_grid)
    data/
      sprites/          # sprites salvos (JSON)
      exports/            # PNGs exportados
  frontend/
    index.html
    css/style.css
    js/
      api.js            # chamadas fetch() para o backend
      palette.js          # paleta (30 cores por padrão, destravável)
      canvas.js             # render do grid + camada de referência
      app.js                  # ferramentas, undo, espelho, export/import
    tests/
      paint_ui_smoke.js       # smoke de gestos e persistência da UI
  docs/
    AGENT_API.md         # documentação da API para agentes
  deploy/
    nginx-forgegrid.conf   # config pronta (inativa) pro domínio próprio
```

## Ferramentas do editor

- Lápis (tamanho ajustável 1-8px), balde (flood fill), conta-gotas,
  borracha normal e borracha de cor (apaga só a região contígua da cor
  clicada, igual o balde)
- Ferramenta de máscara (trava por cor ou por pixel), pra proteger
  áreas já finalizadas de edições acidentais
- Espelho no eixo X (bom para armaduras/personagens simétricos)
- Trava de eixo no arraste ("mouse lock") pra linhas retas
- Overlay de grade visual (espaçamento 1-8px)
- Zoom só visual — os dados nunca mudam de resolução
- Paleta padrão de 30 cores pré-carregada em sprites novos; contador de
  cores usadas; checkbox "Travar em 30 cores" pra destravar o limite
  por sprite quando necessário (ex: importar referência rica em cor)
- Undo/redo (pilha de snapshots)
- Salvamento manual é o padrão: os traços ficam locais até o botão Salvar,
  que sincroniza integralmente o frame atual; alterações pendentes ativam o
  aviso nativo do navegador ao fechar ou recarregar a página
- Autosave é opcional e fica desligado por padrão; quando ativado, persiste um
  lote no mouse-up ou após 800 ms sem novas edições
- O estado pendente, salvando, salvo ou erro aparece ao lado do botão Salvar
- Modo Animated: grade 2D de frames com duplicação em qualquer direção
  (esquerda/direita/cima/baixo), separado do sprite estático de origem
- Camada de referência (decalque): importa uma imagem, exibida por
  baixo do desenho com opacidade ajustável; encaixa **proporcionalmente**
  no canvas pelo maior lado (contain-fit), sem distorcer; conta-gotas e
  extração de paleta/contorno leem direto dela
- Verificador de downscale: ao carregar uma referência, mostra quais
  tamanhos de bloco (1×1 até 32×32) dividem a imagem sem sobra, pra
  escolher um fator de redução que encaixa exato no grid
- Export PNG em 1×, 4×, 8×, 16× (nearest-neighbor, sem blur)
- Export/import da matriz de pixels como `.txt` (cor hex por célula, `0`
  onde é transparente) — permite editar a arte fora do app e reimportar,
  ou levar pra outro sprite
- Botão "Analisar sprite" — mostra contagem de cores, bounding box e
  simetria, útil pro seu estudo de padrões do Terraria/Calamity
- Gerador local de efeitos sonoros ElevenLabs com prompt, duração,
  influência, loop, preview e download MP3; a chave nunca chega ao navegador

## Testes

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests -v
node frontend/tests/paint_ui_smoke.js
```

O smoke da UI carrega o JavaScript real do editor e cobre arraste longo,
espelho, máscara, fill, lote único por gesto, autosave temporizado, botão
Salvar e reabertura do sprite persistido.

## Próximos passos sugeridos

- Camadas (layers) de verdade além de frames (composição com
  visibilidade/opacidade/reordenação por camada)
- Onion skin entre frames pra animação
- Aplicar de fato o downscale (média de blocos NxN) sugerido pelo
  verificador de divisibilidade da referência, não só analisar
- HTTPS + domínio próprio no VPS (ver `STATUS.md` e
  `deploy/nginx-forgegrid.conf`)
