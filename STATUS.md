# PixelForge — Status do projeto

Última atualização: 17 de agosto de 2026 (sessão de deploy + features de referência)

## O que já está funcionando

### Backend (FastAPI)
- Rodando na VPS Hostinger (`89.116.225.87`) via **systemd** (`pixelforge.service`), como root, reinicia sozinho se cair ou se a VPS reiniciar.
- Nginx como proxy reverso na porta 80 → repassa para `127.0.0.1:8000` (uvicorn não fica exposto direto à internet).
- Endpoints validados (testado via `TestClient` e via uso real no navegador):
  - `POST /api/sprites` — cria sprite vazio
  - `GET /api/sprites/{id}` — lê sprite completo
  - `PATCH /api/sprites/{id}/pixel` — edita 1 pixel por coordenada
  - `PATCH /api/sprites/{id}/region` — preenche bloco retangular
  - `POST /api/sprites/{id}/palette` — atualiza paleta (máx. 30 cores)
  - `GET /api/sprites/{id}/analyze` — estatísticas estruturadas (cores usadas, bounding box, simetria)
  - `GET /api/sprites/{id}/export.png` — export PNG com transparência real, escala nearest-neighbor (1×/4×/8×/16×) — **confirmado RGBA correto em teste automatizado**
- Armazenamento simples: 1 arquivo JSON por sprite em `backend/data/sprites/`.
- Documentação da API para agentes de IA em `docs/AGENT_API.md`.

### Frontend (HTML/CSS/JS puro)
- Editor rodando em `http://89.116.225.87` (sem HTTPS ainda — pendente).
- Canvas em grid real (1 pixel do array = 1 pixel do dado, zoom é só visual — não upscala os dados).
- Ferramentas: Lápis, Balde (flood fill), Conta-gotas, Borracha, Espelho no eixo X.
- **Pincel com tamanho ajustável (1-8px)** — desenha um quadrado NxN centrado no clique, em vez de travar em 1 pixel.
- **Trava de eixo no arraste ("mouse lock")** — detecta se o gesto de arrasto é predominantemente horizontal ou vertical e trava aquele eixo pro resto do traço, permitindo linhas retas perfeitas sem tremer o pulso.
- **Camada de referência (decalque)** — importa uma imagem do computador, exibida por baixo do desenho com opacidade ajustável (0-100%), toggle de visibilidade e botão de remover. Não é salva no backend, é só auxílio visual local da sessão.
- **Conta-gotas inteligente** — se o pixel clicado já tem cor própria pintada, reaproveita da paleta atual; se estiver vazio e houver referência visível, captura a cor exata daquele ponto da imagem de referência e adiciona/seleciona na paleta automaticamente.
- **Extração de paleta em lote** — botão "Extrair paleta da referência" varre todos os pixels da imagem importada (resolução nativa, sem artefato de escala), conta frequência de cada cor única, e aplica as até 30 mais frequentes na paleta de trabalho de uma vez. Mostra no painel de análise quantas cores únicas existiam vs. quantas foram aplicadas.
- **Auto-preenchimento de dimensões ao importar referência** — os campos de largura/altura já vêm preenchidos com o tamanho exato (em pixels) da imagem importada, garantindo que o sprite novo fique pixel-perfeito com a referência sem digitação manual.
- **Overlay de grade visual** — linhas finas brancas semi-transparentes marcando os limites dos pixels (ou blocos de N pixels), espaçamento ajustável de 1 a 8px via slider, toggle de visibilidade. Puramente visual (`pointer-events: none`, não interfere no desenho), independente do tamanho do pincel selecionado.
- Undo simples.
- Export PNG direto do navegador (botão "Exportar PNG"), com escolha de escala.
- Botão "Analisar sprite" chamando `/analyze`.

### Limites e validações
- Paleta: até 30 cores por sprite (validado no backend).
- **Dimensão de sprite: até 4096×4096px por lado** (aumentado de 256px nesta sessão — permite importar spritesheets de animação completas do Terraria, ex: folhas 360×224 ou maiores, sem redimensionamento). Validado tanto no frontend (`<input max>`) quanto no backend (Pydantic `Field(le=4096)`).

## Bugs encontrados e corrigidos (todos resolvidos e validados)

1. **Paleta sem seleção padrão** — ao carregar um sprite, nenhuma cor vinha selecionada (`selectedIndex = -1`), então o Lápis "desenhava" com índice transparente.
   - Corrigido em `frontend/js/palette.js`: `setColors()` agora seleciona a primeira cor automaticamente se nada estiver selecionado.
   - **Status:** aplicado na VPS, testado e validado no navegador. Commitado no repositório local.

2. **Preview do canvas dessincronizado da paleta real** — ao adicionar uma cor nova depois de criar o sprite, o pixel pintado com aquela cor aparecia magenta (`#ff00ff`, fallback de "índice inválido") no editor, mesmo o **export PNG saindo com a cor certa**.
   - Causa: `PaletteManager` (painel de cores) e `SpriteCanvas` (grid de desenho) mantinham cada um sua própria cópia da paleta; adicionar cor só atualizava uma das duas.
   - Corrigido em `frontend/js/app.js`: o callback `PaletteManager.onChange` agora sincroniza `SpriteCanvas.palette` e re-renderiza antes de salvar no backend.
   - **Status:** aplicado na VPS, testado e validado no navegador — pixel e export batem.

## Feedback de uso real (colega da gráfica testando o editor)

Rodada de feedback coletada após uso prático do editor (não só teste do
Lucas). 5 pontos levantados:

1. **Barra de camadas para dividir ações** — pendente, ver nota abaixo.
2. **Atalhos para desfazer/refazer traços** — ✅ resolvido: `Ctrl+Z`
   desfaz, `Ctrl+Y`/`Ctrl+Shift+Z` refaz, botão "↷ Refazer" adicionado.
3. **Alternar interface entre branco/preto para melhor visualização de
   outras cores** — ✅ resolvido como "fundo do canvas alternável":
   dropdown com Escuro/Claro/Branco sólido/Preto sólido, independente do
   tema geral da UI. Resolve o problema real (cor escura sumindo contra
   fundo escuro do canvas).
4. **Facilitar seleção de cores** — ✅ resolvido parcialmente: clicar num
   swatch da paleta agora preenche o seletor de cor automaticamente
   (facilita ajustar/duplicar tons próximos); atalhos numéricos 1-9
   selecionam rapidamente as primeiras 9 cores da paleta.
5. **Opacidade do pincel e, consequentemente, das camadas** — **pendente
   de decisão de arquitetura.** Hoje cada pixel guarda um índice fixo de
   paleta (não RGBA com alfa variável), então opacidade de verdade exige
   escolher entre: (a) mistura simples que gera cor nova na paleta a cada
   uso (rápido, mas pode inflar a paleta rapidamente), (b) repensar o
   modelo de pixel para RGBA real (mais trabalho, mas abre caminho pra
   camadas de verdade depois). Decisão adiada — vale coletar mais uso real
   antes de comprometer com uma arquitetura específica.

### Nota sobre "barra de camadas" (item 1)

Ainda não implementado. Hoje o sprite só tem "frames" (usados para
animação), não camadas de composição (desenho separado por elemento,
visibilidade/opacidade individual, reordenação). Isso é uma mudança de
modelo de dados no backend (`Sprite`/`Frame` em `models.py`), não só
frontend — precisa de planejamento antes de implementar, natural de
discutir junto com a decisão do item 5 (opacidade), já que os dois são
tecnicamente relacionados (uma camada de verdade também precisa de
opacidade própria).

## Sincronização VPS ↔ GitHub

- VPS (`89.116.225.87`, repo em `~/pixelforge`) está com **todas** as
  features desta sessão aplicadas e validadas em produção (referência,
  conta-gotas, extração de paleta, pincel, trava de eixo, grid overlay,
  limite 4096px).
- Repositório GitHub (`lukeprograming/pixelforge`) pode estar **atrasado**
  em relação à VPS — várias mudanças foram aplicadas direto na VPS via
  `nano`/heredoc (por causa de instabilidade de SSH no PC do trabalho em
  alguns momentos), sem passar primeiro pelo GitHub.
- Documentação nova desta sessão (`STATUS.md` atualizado,
  `docs/TERRARIA_SPRITE_REFERENCE.md`, `docs/ANIMATION_RULES_BY_CATEGORY.md`)
  também pode não estar refletida na VPS ainda, já que essa parte só foi
  entregue via zip, não aplicada por lá.
- **Procedimento de sincronização documentado em `DEPLOY.md` → seção
  "Sincronizar VPS → PC local (scp/rsync)"** — usar isso para trazer o
  estado real da VPS de volta pro PC local antes do próximo `git push`,
  em vez de tentar reconstruir manualmente o que foi mudado onde.
- Estrutura do repo já foi corrigida antes (havia uma pasta `pixelforge/`
  duplicada dentro da raiz — removida tanto no GitHub quanto na VPS).

## Referências de sprite do Terraria já mapeadas (ver `docs/TERRARIA_SPRITE_REFERENCE.md`)

- Grid universal de animação de corpo: **40×56px por frame** (confirmado em capacete, mão/luva e perna vanilla).
- Ícone de inventário é categoria separada: canvas ajustado ao conteúdo (sem grid, sem margem), 1 frame único, ~20-35px de lado.
- Itens segurados (espada, varinha): desenhados já na diagonal (~45°) com canvas quadrado — **não é regra universal**, formatos largos (picareta, machado) ou de pontas múltiplas (tridente) desviam bastante, alguns ficando quase horizontais.
- **Validado nesta sessão:** conseguimos importar uma spritesheet de animação completa do Terraria base (antes bloqueada pelo limite de 256px) após o aumento do limite de dimensão para 4096px.

## Próximos passos (ordem sugerida)

1. Confirmar `git push` feito no GitHub, sincronizando com o que já roda na VPS.
2. Configuração de domínio + HTTPS (certbot), se/quando tiver domínio apontado para `89.116.225.87`.
3. **Estudo por categoria (novo foco a partir de 20/08 com o Codex)** — ver `docs/ANIMATION_RULES_BY_CATEGORY.md`: generalizar os padrões já confirmados item a item em regras por categoria (armadura leve vs pesada/detalhada, arma pequena vs grande, lâmina fina vs cabeça larga vs pontas múltiplas). Framework e perguntas em aberto já documentados, faltam mais exemplos de sprite pra confirmar cada hipótese.
4. Peitoral (torso) e wings (corpo animado) seguem como as peças de maior prioridade ainda não mapeadas — mencionadas desde o início como as mais complexas.
5. Exemplo do Calamity Mod (set Bloodflare) — pendente, aguardando arquivos enviados pelo usuário (não baixamos assets proprietários diretamente).
6. **Rodar o PixelForge localmente também** (não só na VPS) — já suportado sem mudança de código, basta clonar o repo e seguir "Rodar localmente" no `README.md`. Útil para o Codex validar hipóteses via `/analyze` sem depender da VPS.
7. Avaliar se vale formalizar um "modo ícone" vs "modo corpo animado" na criação de sprite (hoje é só um campo livre de largura/altura).
8. "Animador" — feature futura de duplicar o desenho do capacete para baixo automaticamente seguindo o grid 40×56 observado (mencionado pelo usuário, ainda não iniciado).
9. Camadas (layers) de verdade além de frames; onion skin para animação (features futuras, não iniciadas).
