# PixelForge

Editor de pixel art (HTML/CSS/JS + backend FastAPI) com foco em sprites
pequenos e precisos (ex: 40×40 até 128×128, estilo Terraria/Calamity),
paleta limitada (máx. 30 cores), export PNG com fundo transparente, e
uma API por coordenada documentada para uso por agentes de IA
(`docs/AGENT_API.md`).

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

## Estrutura

```
pixelforge/
  backend/
    app/
      main.py         # rotas da API + serve o frontend estático
      models.py        # Sprite, Frame, edits (Pydantic)
      storage.py        # persistência simples em JSON (1 arquivo/sprite)
      png_export.py      # export PNG (nearest-neighbor) + analyze()
    data/
      sprites/          # sprites salvos (JSON)
      exports/            # PNGs exportados
  frontend/
    index.html
    css/style.css
    js/
      api.js            # chamadas fetch() para o backend
      palette.js          # paleta (máx 30 cores)
      canvas.js             # render do grid + captura de mouse
      app.js                  # ferramentas, undo, espelho, export
  docs/
    AGENT_API.md         # documentação da API para agentes
```

## Ferramentas do editor (v0)

- Lápis (1px), balde (flood fill), conta-gotas, borracha
- Espelho no eixo X (bom para armaduras/personagens simétricos)
- Zoom só visual — os dados nunca mudam de resolução
- Paleta restrita, com contador de cores usadas
- Undo simples (pilha de snapshots)
- Export PNG em 1×, 4×, 8×, 16× (nearest-neighbor, sem blur)
- Botão "Analisar sprite" — mostra contagem de cores, bounding box e
  simetria, útil pro seu estudo de padrões do Terraria/Calamity

## Próximos passos sugeridos

- Importar um PNG de referência (Terraria/Calamity) e extrair paleta +
  dimensões automaticamente (dá pra plugar em `png_export.py`)
- Camadas (layers) além de frames
- Onion skin entre frames pra animação
- Deploy no VPS: `uvicorn` atrás de Nginx/Caddy com HTTPS, mesma pasta
  serve front + API
