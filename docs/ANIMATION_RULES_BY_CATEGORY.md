# Regras de animação por categoria de armadura/arma — framework para Codex

Este documento organiza o estudo de padrões do Terraria/Calamity por
**categoria** (tamanho e nível de detalhe), em vez de item por item como o
`TERRARIA_SPRITE_REFERENCE.md` fez até aqui. O objetivo é chegar a regras
generalizáveis do tipo "armaduras pesadas tendem a X" em vez de só "esse
capacete específico tem bbox Y".

Este arquivo é o ponto de partida para o Codex (a partir de 20/08)
continuar o mapeamento, usando a API rodando em `localhost:8000` (ver
`AGENT_API.md`) para validar hipóteses programaticamente à medida que mais
sprites de referência forem enviados.

## Como usar este documento

1. Cada categoria abaixo tem um status: `confirmado` (dados de verdade
   já analisados), `hipótese` (padrão observado mas com poucos exemplos),
   ou `pendente` (nenhum dado ainda, só a pergunta a responder).
2. Ao receber sprites novos do usuário, analise com o mesmo processo já
   usado no projeto (grid via linhas/colunas vazias, bounding box por
   frame, contagem de cores, ângulo via `cv2.minAreaRect` quando aplicável)
   e atualize o status da categoria correspondente.
3. Regras "confirmadas" só devem virar lógica automática no editor
   (ex: sugestão de canvas ao criar sprite novo) depois de pelo menos 3
   exemplos concordantes na mesma categoria — uma amostra de 1-2 é
   hipótese, não regra.

## Matriz de categorias a preencher

### Armaduras — por porte visual

| Categoria | Exemplos conhecidos | Status | Observação |
|---|---|---|---|
| Armadura leve/básica | Set inicial (couro, ferro) | `hipótese` | 3 peças vanilla analisadas (capacete, luva, perna) sugerem grid 40×56 padrão sem exceção — mas eram peças "normais", não necessariamente as mais simples do jogo |
| Armadura pesada/detalhada (endgame) | Bloodflare (Calamity), sets late-game vanilla | `pendente` | Hipótese a testar: peça mais detalhada usa MAIS cores (acima da faixa 7-12 já observada) mas ainda respeita o mesmo grid 40×56? Ou peças muito ornamentadas (cristais, correntes, plumas) extrapolam a célula e precisam de camada extra? |
| Armadura com asas/adereços grandes anexados (ex: capacetes com chifres, ombreiras enormes) | Nenhum ainda | `pendente` | Hipótese: o adereço pode extrapolar os 40×56 e ser renderizado como camada/sprite adicional separada, não dentro da mesma célula do capacete |

### Armas — por porte/tipo

| Categoria | Exemplos confirmados | Status | Regra observada |
|---|---|---|---|
| Lâmina fina única (espada comum, adaga, varinha) | `Item_1296.png` (cetro, 42×42), `Item_1826.png` (espada, 54×54) | `confirmado` | Canvas quadrado, ângulo ~135°/45° consistente |
| Cabeça larga assimétrica (picareta, machado) | `Item_3466.png` (38×38, 101°), `Item_3462.png` (54×46, 120°) | `hipótese` | Desvia do padrão de 45°, mas sem regra fixa clara ainda — precisa mais amostra dentro da própria subcategoria (só picaretas entre si, só machados entre si) para achar um padrão interno |
| Pontas múltiplas (tridente, forquilha) | `Item_3463.png`, `Item_3464.png` (ambos ~0°, horizontal) | `hipótese` forte | 2 exemplos concordantes já — quase suficiente pra virar regra confirmada com mais 1 exemplo |
| Arma grande de duas mãos (espadão, machado de guerra) | Nenhum ainda | `pendente` | Hipótese a testar: canvas proporcionalmente maior que espada comum, mas mantém o ângulo ~45°? Ou o tamanho grande força outro ângulo pra caber na tela sem sair do personagem? |
| Arma de longo alcance com desenho não-diagonal por natureza (arco, besta) | Nenhum ainda | `pendente` | Hipótese: provavelmente foge de qualquer regra de ângulo por natureza do objeto (arco é curvo, não uma "lâmina"), merece categoria própria |

## Perguntas em aberto para orientar a próxima leva de exemplos

Ao pedir mais sprites pro usuário (ou ao ele enviar), estas são as
perguntas que mais valem a pena responder primeiro, em ordem de impacto
pro editor:

1. **Armadura pesada/detalhada ainda cabe em 40×56, ou extrapola?** — isso
   decide se o editor precisa de um "modo grid estendido" pra armaduras
   grandes, ou se 40×56 é realmente universal independente de estilo.
2. **Dentro da subcategoria "cabeça larga" (picareta/machado), existe
   ângulo comum se comparar só entre si?** — a hipótese de "sem regra"
   pode estar certa, ou pode ser que só precisávamos comparar itens do
   mesmo tipo entre si em vez de todos juntos.
3. **Peitoral (torso) — grid único ou par frente/costas?** — ainda não
   analisado, é a peça mais complexa mencionada pelo usuário desde o
   início e segue pendente.
4. **Wings — grid 40×56 ou dimensão própria maior?** — só o ícone foi
   analisado até agora (34×22), o sprite de corpo animado de asas ainda
   não foi mapeado, e a intuição é que foge do padrão por precisar de
   envergadura.

## Workflow de validação via API local (para Claude Code / Codex)

Com o PixelForge rodando localmente (`http://localhost:8000`, ver
`README.md` → "Rodar localmente"), o agente pode validar hipóteses de
forma programática em vez de só inspecionar visualmente:

1. **Recriar o sprite de referência dentro do PixelForge** (ou importar
   como camada de referência, conforme o fluxo do editor) usando as
   dimensões e paleta reais extraídas do PNG original.
2. **Usar `GET /api/sprites/{id}/analyze`** para obter bounding box,
   contagem de cores e simetria de forma estruturada — mais confiável
   que inspeção visual pra comparar várias peças da mesma categoria entre
   si.
3. **Comparar resultados entre peças da mesma categoria** (ex: rodar
   `/analyze` em 3 capacetes "pesados" diferentes e ver se o
   `coverage_ratio` e a contagem de cores realmente ficam numa faixa
   maior que os capacetes "leves" já documentados) antes de declarar uma
   regra como confirmada.
4. **Atualizar a tabela de status neste arquivo** (`pendente` →
   `hipótese` → `confirmado`) conforme os exemplos se acumulam, sempre
   citando os arquivos/sprites usados como evidência, do mesmo jeito que
   foi feito no `TERRARIA_SPRITE_REFERENCE.md`.

Isso mantém o processo auditável: qualquer regra "confirmada" neste
documento deve ser rastreável até exemplos reais analisados, não
suposição de design genérico.

## Relação com os outros documentos

- `TERRARIA_SPRITE_REFERENCE.md` — fatos já confirmados item a item (grid
  universal 40×56, categorias de sprite, ressalva sobre o ângulo de 45°).
  Este arquivo (`ANIMATION_RULES_BY_CATEGORY.md`) generaliza esses fatos
  em regras por categoria à medida que houver amostra suficiente.
- `AGENT_API.md` — como operar a API por coordenada; referência técnica
  para o passo 2-3 do workflow de validação acima.
- `STATUS.md` — estado geral do projeto (features do editor, infra).
