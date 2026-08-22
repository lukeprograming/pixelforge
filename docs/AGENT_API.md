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
  por sprite **por padrão**. A cor de um pixel nunca é armazenada solta —
  sempre via índice. Cada sprite tem um campo `palette_locked` (padrão
  `true`) que aplica esse limite; com `palette_locked: false` a paleta
  aceita quantas cores forem necessárias (ver seção "Travar/destravar
  limite de 30 cores" abaixo).
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
  "palette": ["#1a1a1aff", "#e8d9b0ff"],   // opcional, pode ser [] e setar depois
  "palette_locked": true                    // opcional, padrão true (ver seção de paleta)
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

### Aplicar um traço em lote
```
PATCH /api/sprites/{id}/stroke
{
  "frame": 0,
  "regions": [
    { "x0": 4, "y0": 4, "x1": 8, "y1": 6, "palette_index": 1 },
    { "x0": 9, "y0": 5, "x1": 12, "y1": 7, "palette_index": 1 }
  ]
}
```
Valida todas as regiões antes de alterar o frame, aplica na ordem recebida e
persiste o sprite uma única vez. Use este endpoint para gestos compostos ou
edições em lote: ele evita uma serialização completa do sprite por região e
retorna apenas um ACK leve, não a matriz inteira.

### Atualizar paleta
```
POST /api/sprites/{id}/palette
{ "palette": ["#000000ff", "#ffffffff", "#ff2244ff"], "locked": true }
```
`locked` é opcional — omitido, mantém o `palette_locked` atual do
sprite; se vier, sobrescreve. Com o sprite travado (`locked: true` ou
omitido num sprite já travado), a paleta não pode passar de 30 cores
(`400` se passar). Trocar a paleta não altera os índices já pintados —
se um índice antigo deixar de existir, o pixel correspondente vira
"índice inválido" e é tratado como transparente no export.

### Travar/destravar limite de 30 cores
```
PATCH /api/sprites/{id}/palette-lock
{ "locked": false }
```
Liga/desliga o `palette_locked` do sprite sem mexer na paleta em si.
`400` ao tentar travar (`locked: true`) um sprite cuja paleta já tem
mais de 30 cores — reduza a paleta primeiro (via `/palette`) ou deixe
destravado. No editor, o checkbox "Travar em 30 cores" ao lado da
paleta faz o mesmo toggle.

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

### Importar sprite a partir de uma matriz .txt
```
POST /api/sprites/import-txt
Content-Type: multipart/form-data
  id: novo_sprite_id
  file: matriz.txt
  locked: true   // opcional, padrão true
```
Caminho inverso do `/export.txt`: recebe um `.txt` no mesmo formato
(uma linha por linha Y, células separadas por vírgula, cor hex
`#RRGGBB`/`#RRGGBBAA` ou `0` pra transparente) e cria um sprite novo na
hora — largura/altura vêm do tamanho da matriz, e a paleta é deduzida
automaticamente das cores únicas usadas (na ordem em que aparecem).

**Auto-ajuste pro quadrado:** se a matriz não vier quadrada (ex: 60
colunas × 40 linhas), o sprite final vira `max(largura, altura)` dos
dois lados (60×60 no exemplo), com a arte original **centralizada** e
o restante preenchido com `0`/transparente. `409` se `id` já existir;
`400` se as linhas tiverem tamanhos diferentes entre si ou se alguma
célula não for `0`/hex válido.

**Mais de 30 cores únicas:** com `locked: true` (padrão), uma matriz
com mais de 30 cores únicas dá `400`. Mande `locked: false` pra
importar mesmo assim — o sprite nasce com `palette_locked: false` (sem
limite), e dá pra travar depois via `/palette-lock` (só funciona se a
paleta já tiver ≤30 cores nesse momento). No editor, o botão "Importar
Matriz (.txt)" na Galeria detecta esse erro e pergunta se quer importar
destravado.

### Verificar divisibilidade pra downscale de referência
```
POST /api/tools/pixel-grid-check
Content-Type: multipart/form-data
  file: imagem.png
```
Não cria nem altera sprite nenhum — só lê as dimensões da imagem e diz,
pra cada tamanho de bloco candidato (`1x1, 2x2, 4x4, 8x8, 16x16, 32x32`
— "1 pixel de arte = NxN pixels da imagem"), se a imagem divide **limpo**
nesse bloco (sem sobra de coluna/linha na borda). Útil antes de importar
uma referência grande (ex: uma foto de 712×600) pra escolher um fator de
redução que encaixa exato no grid, em vez de cortar ou deixar borda
parcial. Retorna:
```json
{
  "width": 712,
  "height": 600,
  "gcd": 8,
  "clean_blocks": [1, 2, 4, 8],
  "suggested_block": 8,
  "candidates": [
    { "block": 1, "clean": true, "grid_width": 712, "grid_height": 600, "leftover_x": 0, "leftover_y": 0 },
    { "block": 8, "clean": true, "grid_width": 89, "grid_height": 75, "leftover_x": 0, "leftover_y": 0 },
    { "block": 16, "clean": false, "grid_width": 44, "grid_height": 37, "leftover_x": 8, "leftover_y": 8 }
  ]
}
```
`clean_blocks` é a lista completa de blocos que dividem perfeitamente
(divisores do `gcd(width, height)`); `suggested_block` é o maior deles
que também é potência de 2 (convenção usual de pixelização). `400` se o
arquivo não for uma imagem válida. No editor, o painel abaixo do input
de referência mostra esse mesmo relatório automaticamente ao carregar
uma imagem (calculado no navegador, sem chamar essa rota). **Nota:**
essa rota só analisa — ainda não existe um endpoint que aplica o
downscale de fato (fazer a média dos blocos NxN e reduzir a imagem).

### Exportar PNG
```
GET /api/sprites/{id}/export.png?frame=0&scale=8
```
- `scale=1` → PNG do tamanho exato do canvas (ex: 40×40), fundo
  transparente. Ideal para uso in-game.
- `scale=8`/`16` → PNG ampliado com nearest-neighbor (pixels quadrados
  nítidos), útil só para inspeção visual, não para o asset final.

### Gerar folha/GIF de armadura (porte do ArmorHelper.exe)
```
GET /api/armor/actions
GET /api/armor/generate?sprite_id={id}&action=Head&input_scale=1&output_scale=2&format=png
```
- `sprite_id` — sprite já existente no PixelForge, usado como template de
  origem (ex: um sprite importado via `import` a partir do
  `ArmorTemplate_v1.png` original, 128×80).
- `action` — uma das retornadas por `GET /api/armor/actions`: `Head`,
  `Body`, `Female`, `Legs`, `Arms`, `FullArmor`, `FullArmorFemale`.
- `input_scale` — densidade do template de origem (1 = nativo 128×80,
  igual ao `.exe` original; maior se o template já for uma referência
  em mais qualidade, ex: 4x/5x).
- `output_scale` — densidade da folha de saída (2 = igual ao `.exe`
  original, que sempre faz upscale fixo em 2x).
- `format=png` devolve a folha estática (40×output_scale × 1120×output_scale
  em unidades escaladas); `format=gif` devolve animação de 52 frames
  (66ms/frame, loop infinito), mesma sequência do `SaveAsGif()` original.
- Head/Body/Female/Legs/Arms validados pixel-a-pixel (0% de diferença)
  contra saídas reais do `.exe` original. FullArmor/FullArmorFemale
  compõem essas mesmas peças já validadas, na ordem do original.

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
