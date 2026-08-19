# PixelForge — API para agentes de IA

Este documento descreve como um agente (Claude Code, Codex etc.) deve
usar a API do PixelForge para ler, editar e exportar sprites pixel art
por coordenada, sem precisar "ver" a imagem.

Base URL local: `http://localhost:8000`

## Conceitos

- **Canvas**: matriz `pixels[y][x]`, origem `(0,0)` no canto superior
  esquerdo, eixo Y cresce para baixo. Cada célula é um número inteiro:
  o **índice da paleta** (`0..N-1`) ou `-1` para transparente.
- **Paleta**: lista de cores em hex `#RRGGBBAA`, limite de **30 cores**
  por sprite. A cor de um pixel nunca é armazenada solta — sempre via
  índice. Isso é o que garante o limite de cores do projeto.
- **Frame**: um sprite tem 1+ frames (para animação). A maioria das
  operações aceita `frame` (padrão `0`).
- **1 pixel do array = 1 pixel do PNG exportado.** Não existe upscale
  escondido nos dados; o `scale` do export é só multiplicação de
  pixels quadrados (nearest-neighbor), nunca suavização.

## Fluxo típico de um agente

1. `POST /api/sprites` — cria um sprite vazio com dimensões conhecidas
   (ex: 40×40, como referência do padrão de armadura do Terraria).
2. `POST /api/sprites/{id}/palette` — define a paleta (até 30 cores)
   com base no estudo de referência (ex: cores extraídas de um sprite
   do Calamity).
3. `PATCH /api/sprites/{id}/pixel` ou `.../region` — desenha por
   coordenada.
4. `GET /api/sprites/{id}/analyze` — confere o resultado (contagem de
   cores, bounding box real, simetria) sem precisar interpretar a
   imagem visualmente.
5. `GET /api/sprites/{id}/export.png` — gera o PNG final com fundo
   transparente.

## Endpoints

### Criar sprite
```
POST /api/sprites
{
  "id": "armor_test_01",
  "width": 40,
  "height": 40,
  "palette": ["#1a1a1aff", "#e8d9b0ff"]   // opcional, pode ser [] e setar depois
}
```
Retorna o `Sprite` completo, com um `frame_0` todo transparente
(`-1` em toda a matriz).

### Ler sprite
```
GET /api/sprites/{id}
```
Retorna `{ id, width, height, palette, frames, tags, created_at, updated_at }`.

### Editar 1 pixel
```
PATCH /api/sprites/{id}/pixel
{ "x": 12, "y": 4, "palette_index": 2, "frame": 0 }
```
Use `palette_index: -1` para apagar (deixar transparente).

### Editar uma região retangular (bloco sólido)
```
PATCH /api/sprites/{id}/region
{ "x0": 4, "y0": 4, "x1": 10, "y1": 6, "palette_index": 1, "frame": 0 }
```
Preenche todo o retângulo `[x0..x1] × [y0..y1]` (inclusive) com a
mesma cor. Útil para bases sólidas antes de refinar pixel a pixel.
**Não** é flood fill — para formas irregulares, edite pixel a pixel.

### Atualizar paleta
```
POST /api/sprites/{id}/palette
{ "palette": ["#000000ff", "#ffffffff", "#ff2244ff"] }
```
Máximo 30 cores. Trocar a paleta não altera os índices já pintados —
se um índice antigo deixar de existir, o pixel correspondente vira
"índice inválido" e é tratado como transparente no export.

### Ler um frame específico
```
GET /api/sprites/{id}/frame/{frame_index}
```

### Adicionar frame (animação)
```
POST /api/sprites/{id}/frame?name=walk_01
```

### Analisar sprite (leitura estruturada, sem visão)
```
GET /api/sprites/{id}/analyze?frame=0
```
Retorna:
```json
{
  "sprite_id": "armor_test_01",
  "frame": 0,
  "canvas_size": { "width": 40, "height": 40 },
  "colors_used": 6,
  "palette_size": 8,
  "bounding_box": { "x0": 8, "y0": 3, "x1": 31, "y1": 36 },
  "coverage_ratio": 0.52,
  "symmetric_horizontal": true,
  "symmetric_vertical": false
}
```
Use isso para comparar um sprite em progresso contra o padrão
esperado (ex: "sprites de armadura do Terraria costumam ser
simétricos no eixo horizontal e ocupar ~50-60% do canvas").

### Ler matriz de cores (X/Y, hex ou 0)
```
GET /api/sprites/{id}/matrix?frame=0
```
Retorna a mesma matriz `[y][x]` do frame, mas já resolvida pra cor: cada
célula é a cor hex da paleta (`#RRGGBBAA`) onde há pixel pintado, ou `0`
onde está transparente (inclui índice inválido). Útil quando o agente
quer a cor direto, sem precisar cruzar `pixels` com `palette` na mão.
```json
{
  "sprite_id": "armor_test_01",
  "frame": 0,
  "width": 4,
  "height": 2,
  "matrix": [
    ["#1a1a1aff", "#1a1a1aff", 0, 0],
    [0, "#e8d9b0ff", "#e8d9b0ff", 0]
  ]
}
```

### Exportar matriz de cores em .txt
```
GET /api/sprites/{id}/export.txt?frame=0
```
Mesmo dado do `/matrix` acima, mas como arquivo de texto pra download
(`Content-Disposition: attachment`) em vez de JSON: uma linha por linha
Y do frame, células separadas por vírgula, cor hex `#RRGGBBAA` ou `0`
onde é transparente. Sem cabeçalho, sem espaços. Exemplo (frame 4×2):
```
#1a1a1aff,#1a1a1aff,0,0
0,#e8d9b0ff,#e8d9b0ff,0
```
No editor, o botão "Exportar Matriz (.txt)" no topbar baixa esse mesmo
arquivo para o frame ativo. Use o endpoint `/matrix` (JSON) quando for
consumir o dado programaticamente; use `/export.txt` quando o objetivo
for gerar um arquivo pra anexar/compartilhar.

### Exportar PNG
```
GET /api/sprites/{id}/export.png?frame=0&scale=8
```
- `scale=1` → PNG do tamanho exato do canvas (ex: 40×40), fundo
  transparente. Ideal para uso in-game.
- `scale=8`/`16` → PNG ampliado com nearest-neighbor (pixels quadrados
  nítidos), útil só para inspeção visual, não para o asset final.

## Boas práticas para o agente

- Sempre confira `width`/`height` do sprite antes de mandar
  coordenadas — `x`/`y` fora do canvas retornam erro 400.
- Prefira `region` para preencher blocos grandes e uniformes (economiza
  chamadas), e `pixel` para detalhe/contorno.
- Depois de um lote de edições, chame `analyze` para validar simetria
  e cobertura antes de exportar — é mais barato corrigir por dado
  estruturado do que por inspeção visual do PNG.
- Ao estudar um sprite de referência (ex: um PNG do Terraria/Calamity
  já existente), extraia a paleta e as dimensões primeiro, e replique
  esses mesmos limites no sprite novo — é isso que faz o resultado
  "parecer" do mesmo jogo.
