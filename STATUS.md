# PixelForge — Status do projeto

Última atualização: 19 de agosto de 2026 (sessão de export/import de
matriz, verificador de downscale e paleta destravável)

## Sessão de 19/08/2026 (Claude Code)

Resumo do que foi feito e validado nesta sessão, tudo já commitado no
GitHub e no ar na VPS (`pixelforge.service` reiniciado a cada mudança):

1. **Fix: referência não distorce mais.** `ReferenceLayer.render()`
   (`frontend/js/canvas.js`) esticava a imagem de referência pra
   preencher exatamente largura×altura do canvas, distorcendo a
   proporção (ex: 50×30 virava 50×50). Agora usa contain-fit: encaixa
   pelo maior lado, centraliza, sem distorcer. `getColorAt()` (conta-gotas
   sobre a referência) foi ajustado pra amostrar do mesmo retângulo.
2. **`GET /api/sprites/{id}/matrix`** — matriz `[y][x]` já resolvida em
   cor hex ou `0` (transparente), sem precisar cruzar `pixels`×`palette`
   na mão.
3. **`GET /api/sprites/{id}/export.txt`** — mesma matriz como arquivo
   `.txt` pra download (CSV: linha por linha Y, cor hex ou `0`). Botão
   "Exportar Matriz (.txt)" no topbar.
4. **`POST /api/sprites/import-txt`** — caminho inverso: sobe um `.txt`
   nesse mesmo formato e cria um sprite novo. Auto-ajusta matriz
   não-quadrada pro maior lado (ex: 60×40 → 60×60), centralizada, resto
   transparente. Botão "Importar Matriz (.txt)" na Galeria.
5. **`POST /api/tools/pixel-grid-check`** — verificador de downscale:
   dado o tamanho de uma imagem, diz quais blocos (1×1 até 32×32)
   dividem sem sobra, pra escolher fator de redução que encaixa exato no
   grid. No editor, calculado no client e mostrado automaticamente ao
   carregar uma referência (painel abaixo do input de arquivo). Ainda
   **não aplica** o downscale de fato, só analisa.
6. **Paleta destravável.** `Sprite.palette_locked` (padrão `true`
   mantém o comportamento de sempre). Checkbox "Travar em 30 cores" no
   editor; `PATCH /api/sprites/{id}/palette-lock`; `locked` opcional em
   `POST /palette` e em `POST /import-txt`. Import de matriz `.txt` com
   mais de 30 cores únicas agora pergunta se quer importar destravado em
   vez de só falhar.
7. Validado round-trip real (export → import idêntico byte a byte) e
   dois sprites reais do usuário importados com sucesso: uma espada
   64×64 e uma tocha/asas 64×64 com 31 cores (destravada).
8. Instalado Node.js 20 na VPS (não tinha node nem browser) pra rodar
   testes unitários do JS de referência contra o código real via `vm` —
   ficou disponível pra testes futuros do frontend.
9. `docs/AGENT_API.md` atualizado com todos os endpoints novos.

## O que já está funcionando

### Backend (FastAPI)
- Rodando na VPS Hostinger (`89.116.225.87`) via **systemd** (`pixelforge.service`), como root, reinicia sozinho se cair ou se a VPS reiniciar.
- Nginx como proxy reverso na porta 80 → repassa para `127.0.0.1:8000` (uvicorn não fica exposto direto à internet).
- Endpoints validados (testado via `TestClient`, `curl` direto na VPS e via uso real no navegador):
  - `POST /api/sprites` — cria sprite vazio (aceita `palette_locked`)
  - `GET /api/sprites/{id}` — lê sprite completo
  - `PATCH /api/sprites/{id}/pixel` — edita 1 pixel por coordenada
  - `PATCH /api/sprites/{id}/region` — preenche bloco retangular
  - `POST /api/sprites/{id}/palette` — atualiza paleta (30 cores por padrão, `locked` opcional)
  - `PATCH /api/sprites/{id}/palette-lock` — liga/desliga o limite de 30 cores por sprite
  - `POST /api/sprites/import` — cria sprite a partir de um PNG (quantiza cores)
  - `POST /api/sprites/import-txt` — cria sprite a partir de uma matriz `.txt` (`locked` opcional)
  - `GET /api/sprites/{id}/matrix` — matriz `[y][x]` em cor hex ou `0`
  - `GET /api/sprites/{id}/export.txt` — mesma matriz como arquivo `.txt` pra download
  - `POST /api/tools/pixel-grid-check` — verificador de divisibilidade pra downscale de imagem
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
- Paleta: até 30 cores por sprite por padrão (`palette_locked: true`), destravável por sprite (validado no backend, ver sessão de 19/08).
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

## Deploy automático (GitHub → VPS)

Desde 17/08/2026, a VPS não depende mais de sincronização manual via `scp`/`nano`.
Fluxo atual:

1. Qualquer commit em `main` no GitHub (`lukeprograming/pixelforge`) é a fonte de
   verdade — parar de editar direto na VPS.
2. Um systemd timer (`pixelforge-sync.timer`, `/etc/systemd/system/`) roda
   `/root/pixelforge/deploy_sync.sh` **todo dia às 07:00 UTC (04:00 horário de
   Brasília)**.
3. O script faz `git fetch` + compara `HEAD` com `origin/main`. Se não mudou nada,
   sai sem reiniciar o serviço (zero downtime na maioria dos dias). Se mudou, faz
   `git reset --hard origin/main`, reinstala `requirements.txt` e reinicia
   `pixelforge.service` — a janela de indisponibilidade real é de poucos segundos
   (restart do systemd), não minutos.
4. Log de cada execução em `/var/log/pixelforge-sync.log` na VPS.
5. Rodar manualmente a qualquer momento (não precisa esperar o horário):
   `ssh root@89.116.225.87 systemctl start pixelforge-sync.service`.

## Próximos passos (ordem sugerida)

1. ~~Confirmar `git push` feito no GitHub, sincronizando com o que já roda na VPS.~~
   ✅ feito em 17/08/2026 — GitHub, VPS e o snapshot local agora batem, incluindo
   undo/redo, toggle de fundo do canvas e atalhos numéricos que só existiam no
   snapshot antes.
2. Configuração de domínio + HTTPS (certbot). Domínio `forgegrid.com.br`
   já **comprado** (17/08/2026), status "registrando" no registro.br,
   DNS ainda não aponta pra VPS. Config do Nginx já pronta em
   `deploy/nginx-forgegrid.conf` (comentário no topo do arquivo tem o
   passo a passo de ativação) — só falta o DNS propagar e rodar os
   passos de lá.
3. **Estudo por categoria (novo foco a partir de 20/08 com o Codex)** — ver `docs/ANIMATION_RULES_BY_CATEGORY.md`: generalizar os padrões já confirmados item a item em regras por categoria (armadura leve vs pesada/detalhada, arma pequena vs grande, lâmina fina vs cabeça larga vs pontas múltiplas). Framework e perguntas em aberto já documentados, faltam mais exemplos de sprite pra confirmar cada hipótese.
4. Peitoral (torso) e wings (corpo animado) seguem como as peças de maior prioridade ainda não mapeadas — mencionadas desde o início como as mais complexas.
5. Exemplo do Calamity Mod (set Bloodflare) — pendente, aguardando arquivos enviados pelo usuário (não baixamos assets proprietários diretamente).
6. **Rodar o PixelForge localmente também** (não só na VPS) — já suportado sem mudança de código, basta clonar o repo e seguir "Rodar localmente" no `README.md`. Útil para o Codex validar hipóteses via `/analyze` sem depender da VPS.
7. Avaliar se vale formalizar um "modo ícone" vs "modo corpo animado" na criação de sprite (hoje é só um campo livre de largura/altura).
8. "Animador" — feature futura de duplicar o desenho do capacete para baixo automaticamente seguindo o grid 40×56 observado (mencionado pelo usuário, ainda não iniciado).
9. Camadas (layers) de verdade além de frames; onion skin para animação (features futuras, não iniciadas).
10. **Aplicar o downscale de verdade** — o verificador de divisibilidade
    (`/api/tools/pixel-grid-check`, sessão de 19/08) só analisa e sugere
    o bloco; falta o endpoint/fluxo que de fato reduz a referência
    fazendo a média de cada bloco NxN antes de importar.
11. Node.js 20 foi instalado na VPS nesta sessão só pra rodar um teste
    unitário pontual — não tinha `node` nem browser headless antes.
    Ainda não há suite de testes automatizados de frontend formalizada.
