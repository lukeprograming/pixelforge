# Referência: padrão de sprites de armadura do Terraria (camada do player)

Baseado em análise programática (grid, bounding box por frame, contagem de
cores) de sprites vanilla do Terraria enviados pelo usuário. Serve de
gabarito para criar novas peças no PixelForge que sigam o mesmo padrão de
posicionamento usado pelo jogo de verdade.

## Grid universal: 40×56 por frame

Toda peça de armadura equipável no personagem (o sprite que anima o player,
diferente do ícone do inventário) é organizada numa grade de **células de
exatamente 40×56 pixels**, empilhadas verticalmente (1 coluna × N linhas) ou
em grade maior (múltiplas colunas × linhas), dependendo de quantas variações
de frame a peça precisa. O zoom/posição do personagem nunca muda o tamanho
da célula — só quantos frames existem.

Cada célula corresponde a **um frame de animação específico do jogo**
(idle, passos da caminhada, pulo, uso de ferramenta, sentado, etc.) — a
mesma célula N sempre representa a mesma pose em qualquer peça de armadura,
o que é o que permite "trocar a roupa" do personagem sem quebrar a animação.

## Itens segurados na mão: desenhados já na diagonal, não rotacionados em runtime

Analisando `Item_1296.png` (cetro mágico), descoberta importante: o sprite
do item **já vem desenhado inclinado a ~45°**, com canvas quadrado (neste
caso 42×42) — não é um sprite "reto" que o jogo rotaciona em tempo real.

Confirmado por análise do eixo principal do desenho (PCA sobre os pixels
não-transparentes): ângulo de ~135°/45° em vez de 0°/90°, o que só
acontece se o desenho original já foi construído na diagonal.

**Por que isso importa para criar itens novos:** qualquer item pensado para
ser "segurado" pelo personagem (varinha, cetro, espada, ferramenta) deve
ser desenhado diretamente na orientação diagonal (~45°), com o cabo/base do
item apontando para o canto inferior-esquerdo (onde fica a mão do
personagem) e a "ponta útil" (lâmina, cristal, broca) apontando para o
canto superior-direito. Desenhar o item "reto" (vertical ou horizontal) e
esperar o jogo inclinar automaticamente **não é como o padrão funciona** —
resultaria num item reto na tela, destoando visualmente de todos os outros.

**Canvas:** tende a ser quadrado (ou próximo disso) já que o item ocupa a
diagonal do quadrado igualmente para os dois lados do cabo.

**Confirmado em 2 exemplos de categorias diferentes:** cetro mágico
(`Item_1296.png`, 42×42, 135°) e espada (`Item_1826.png`, 54×54, 135°) —
mesmo ângulo exato nos dois, canvas quadrado nos dois, só o tamanho do
quadrado muda (proporcional ao tamanho visual do item).

### Correção: a regra de 45° NÃO é universal — depende do formato do item

Testando mais 6 itens (picareta, varinha, machado alado, espada dourada, e
2 tridentes/garfos de pontas múltiplas), o ângulo de 45° só se confirmou
com precisão no item de formato **fino e alongado** (varinha, 135° exato).
Os demais desviaram, alguns bastante:

| Formato do item | Ângulo medido | Desvio de 45°/135° |
|---|---|---|
| Fino/alongado (varinha, espada simples) | ~135° | Nenhum ou pequeno |
| Cabeça larga assimétrica (picareta, machado) | ~101-120° | Moderado |
| Múltiplas pontas/garfo (tridente) | **~0° (horizontal)** | Total |

**Hipótese revisada:** a orientação diagonal a 45° parece ser a convenção
visual para armas de **lâmina única e fina** (espadas, adagas, varinhas) —
provavelmente porque esse ângulo é o que melhor comunica "arma sendo
empunhada em posição de ataque" para um objeto estreito. Itens com cabeça
larga (picareta, machado) ou pontas múltiplas (tridente) parecem seguir
outra lógica de composição, possivelmente desenhados na orientação que
melhor mostra a silhueta característica da ferramenta, não numa regra fixa
de ângulo.

**Ressalva sobre o método de medição:** o ângulo foi estimado via
`cv2.minAreaRect` (retângulo de área mínima) sobre os pixels não
transparentes — funciona bem para formas finas e alongadas (o retângulo
"abraça" a lâmina), mas é menos confiável para formas largas ou com
múltiplas pontas, onde o retângulo mínimo pode não corresponder ao que um
humano chamaria de "ângulo de empunhadura". Antes de tratar isso como regra
definitiva para picaretas/machados/tridentes, vale confirmar visualmente
comparando alguns exemplos lado a lado.

**Conclusão prática por ora:** para armas de lâmina fina e única (espada,
adaga, varinha), desenhar a 45° com canvas quadrado é uma aposta segura.
Para ferramentas de cabeça larga (picareta, machado) e armas de pontas
múltiplas (tridente), não há uma regra de ângulo única confirmada ainda —
recomenda-se desenhar olhando referências específicas daquela subcategoria
em vez de aplicar os 45° cegamente.

## Duas categorias distintas de sprite (importante para o editor)

Ao analisar os ícones de inventário (`Item_1003.png`, `Item_1004.png`,
`Item_1005.png`), ficou confirmado que **existem dois formatos totalmente
diferentes** de sprite de armadura, e o editor precisa suportar os dois:

### 1. Ícone de inventário ("item icon")
- **Sem grid fixo** — cada ícone tem seu próprio canvas, do tamanho exato
  do desenho (sem margem transparente sobrando nas bordas).
- **Sem animação** — 1 frame único, estático.
- Tamanhos observados: 22×18, 32×20, 34×22 (varia por peça, tipicamente
  20-35px de lado).
- Cores observadas: 8-9 cores por ícone.
- É o que aparece no inventário/hotbar do jogador.

### 2. Sprite de corpo ("player layer" / animação equipada)
- **Grid fixo de 40×56 por frame**, com N frames dependendo da peça (ver
  tabela acima).
- É o que anima no personagem durante o gameplay.
- Cores tipicamente mais numerosas (7-12) por cobrir mais frames/poses.

**Implicação prática:** ao criar uma peça de armadura nova, são pelo menos
dois arquivos/sprites separados a produzir — o ícone (canvas livre, 1
frame) e o sprite de corpo (grid 40×56, N frames). O PixelForge deveria
permitir criar sprites nos dois modos, não só o modo grid.

## Zona de ancoragem por tipo de peça (sprite de corpo, grid 40×56)

Dentro da célula de 40×56, cada tipo de peça tem uma faixa vertical típica
onde o desenho fica concentrado (o resto é transparente):

| Peça | Faixa Y típica | Faixa X típica | Tamanho do desenho | Observação |
|---|---|---|---|---|
| Capacete/Head | y = 4–29 | x = 8–29 | ~22×24px | Bbox quase fixo entre frames; pouquíssimo deslocamento (cabeça balança pouco) |
| Mão/luva (arm layer) | y = 18–41 | x = 4–33 | varia bastante (8×8 até 20×18) | Grid maior (9×4 = 36 frames) porque acompanha o balanço do braço; ~1/5 dos frames ficam vazios (a mão fica escondida atrás do corpo em certas poses) |
| Perna/Legs | y = 40–53 | x = 8–35 | ~14×12 até 28×12 | Sempre na base da célula; nenhum frame vazio (a perna sempre aparece) |

**Regra prática:** ao criar uma peça nova, desenhe dentro dessa faixa Y
típica do tipo de peça correspondente. Fugir muito disso faz a peça parecer
"flutuar" ou "afundar" em relação ao resto do corpo durante a animação.

## Paleta: sempre bem abaixo do limite de 30

Os três exemplos vanilla analisados usaram entre 7 e 12 cores únicas no
sprite inteiro (todos os 20-36 frames somados). Isso é uma referência boa
de quão econômica a paleta real do jogo é — não é incomum uma peça inteira
usar menos de 10 cores. Vale mirar nessa faixa em vez de usar as 30
disponíveis por padrão.

## Frames vazios são normais e esperados

Nem toda célula do grid precisa ter conteúdo — é assim que o jogo simula a
peça "sumindo" atrás de outra camada em certas poses (ex: a mão do braço
direito fica escondida atrás do torso em alguns frames de caminhada). Ao
montar uma peça nova, frames vazios não são erro — são parte do
comportamento esperado dependendo da pose.

## Próximos exemplos a mapear

- Peitoral (torso) — mencionado como mais complexo por cobrir braço, peito
  e ombro simultaneamente, possivelmente com sprites de frente e de costas
  separados. Ainda não analisado (só o ícone dele foi analisado acima).
- Wings (asas) — provavelmente foge do grid 40×56 padrão por ter envergadura
  maior. Ícone já analisado (34×22, categoria "item icon"); sprite de corpo
  animado ainda não.
- Exemplo do Calamity Mod (set Bloodflare: helmet, chest, legs) — pendente,
  aguardando o usuário localizar/enviar os arquivos (não baixamos assets do
  Calamity diretamente por serem proprietários; ver nota de licença abaixo).

## Nota sobre direitos autorais dos assets do Calamity Mod

O repositório `CalamityTeam/CalamityModPublic` no GitHub tem uma licença
proprietária explícita ("all rights reserved", redistribuição vedada). Por
isso, os arquivos de sprite do Calamity usados como referência devem ser
baixados e enviados pelo próprio usuário (que já tem acesso de uso pessoal
ao mod), em vez de baixados automaticamente. Uso é só para estudo local de
padrão/proporção, sem redistribuir os assets em si.
