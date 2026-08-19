// Amarra ferramentas, paleta e canvas. Mantém o estado atual do sprite
// e envia cada alteração de pixel para o backend (fonte da verdade).

const AppState = {
  spriteId: null,
  tool: "pencil",
  mirrorX: false,
  brushSize: 1, // pincel quadrado NxN, 1 = pixel único
  undoStack: [], // snapshots rasos da matriz de pixels antes de cada gesto
  redoStack: [], // snapshots desfeitos, para refazer (Ctrl+Y)

  mode: "draw", // "draw" (sprite estático, 1 frame) | "animated" (sprite dedicado, grade 2D de frames)
  activeFrameIndex: 0,
  animatedSprite: null, // sprite completo (todos os frames) carregado quando mode === "animated"

  // ferramenta de máscara: protege pixels contra edição enquanto travados.
  // Estado é só do editor (não é salvo no backend) e reseta a cada troca de sprite.
  lockedColors: new Set(), // índices de paleta travados (protege TODO pixel daquela cor)
  lockedPixels: new Set(), // coordenadas "x,y" travadas, independente da cor
};

// true se o pixel (x,y) está protegido pela ferramenta de máscara -- travado
// por coordenada exata, ou porque a cor atual dele está travada
function isLocked(x, y) {
  if (AppState.lockedPixels.has(`${x},${y}`)) return true;
  const idx = SpriteCanvas.pixels[y]?.[x];
  return idx !== undefined && idx >= 0 && AppState.lockedColors.has(idx);
}

// clique sem shift: exclusivo (troca a trava pra só essa cor, ou destrava se
// já era a única travada). Shift+clique: aditivo, dá pra travar várias cores.
function toggleColorLock(x, y, shiftKey) {
  const idx = SpriteCanvas.pixels[y]?.[x];
  if (idx === undefined || idx < 0) return; // pixel vazio, nada pra travar
  if (shiftKey) {
    if (AppState.lockedColors.has(idx)) AppState.lockedColors.delete(idx);
    else AppState.lockedColors.add(idx);
  } else if (AppState.lockedColors.size === 1 && AppState.lockedColors.has(idx)) {
    AppState.lockedColors.clear();
  } else {
    AppState.lockedColors.clear();
    AppState.lockedColors.add(idx);
  }
  PaletteManager.render();
  LockOverlay.render();
}

function togglePixelLock(x, y, shiftKey) {
  const key = `${x},${y}`;
  if (shiftKey) {
    if (AppState.lockedPixels.has(key)) AppState.lockedPixels.delete(key);
    else AppState.lockedPixels.add(key);
  } else if (AppState.lockedPixels.size === 1 && AppState.lockedPixels.has(key)) {
    AppState.lockedPixels.clear();
  } else {
    AppState.lockedPixels.clear();
    AppState.lockedPixels.add(key);
  }
  LockOverlay.render();
}

function resetLocks() {
  AppState.lockedColors = new Set();
  AppState.lockedPixels = new Set();
}

function currentPixelsSnapshot() {
  return SpriteCanvas.pixels.map((row) => row.slice());
}

// calcula as coordenadas cobertas pelo pincel, centrado em (cx, cy),
// já recortadas para dentro dos limites do canvas
function brushCoords(cx, cy, size) {
  const coords = [];
  const offset = Math.floor((size - 1) / 2);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const x = cx - offset + dx;
      const y = cy - offset + dy;
      if (x >= 0 && y >= 0 && x < SpriteCanvas.width && y < SpriteCanvas.height) {
        coords.push([x, y]);
      }
    }
  }
  return coords;
}

async function paintPixel(x, y, meta = {}) {
  const { isDown = true, shiftKey = false } = meta;

  if (AppState.tool === "mask-color") {
    if (isDown) toggleColorLock(x, y, shiftKey); // só no clique, não a cada mousemove do arraste
    return;
  }
  if (AppState.tool === "mask-pixel") {
    if (isDown) togglePixelLock(x, y, shiftKey);
    return;
  }

  if (AppState.tool === "color-eraser") {
    // igual o balde de tinta, mas apagando (transparente) em vez de pintar --
    // só a região contígua daquela cor a partir do clique, não a cor inteira no frame
    await bucketFill(x, y, -1);
    return;
  }

  if (AppState.tool === "eyedropper") {
    const picked = SpriteCanvas.pixels[y][x];
    if (picked >= 0) {
      // já tem cor própria pintada ali: reaproveita da paleta atual
      PaletteManager.select(picked);
      return;
    }
    // nada pintado ainda: tenta capturar a cor exata da referência importada
    const refColor = ReferenceLayer.getColorAt(x, y, SpriteCanvas.zoom);
    if (refColor) PaletteManager.addOrSelectColor(refColor);
    return;
  }
  if (AppState.tool === "fill") {
    await bucketFill(x, y, PaletteManager.selectedIndex);
    return;
  }

  // lápis / borracha: pincel NxN, com espelho opcional no eixo X
  const idx = AppState.tool === "eraser" ? -1 : PaletteManager.selectedIndex;
  const cells = brushCoords(x, y, AppState.brushSize);

  for (const [bx, by] of cells) {
    await commitPixel(bx, by, idx);
    if (AppState.mirrorX) {
      const mx = SpriteCanvas.width - 1 - bx;
      await commitPixel(mx, by, idx);
    }
  }
}

async function commitPixel(x, y, idx) {
  if (isLocked(x, y)) return; // pixel protegido pela ferramenta de máscara
  SpriteCanvas.setPixelLocal(x, y, idx);
  try {
    await Api.setPixel(AppState.spriteId, x, y, idx, AppState.activeFrameIndex ?? 0);
  } catch (err) {
    console.error("Falha ao salvar pixel:", err);
  }
}

async function bucketFill(startX, startY, newIdx) {
  const target = SpriteCanvas.pixels[startY][startX];
  if (target === newIdx) return;
  if (isLocked(startX, startY)) return;

  const stack = [[startX, startY]];
  const seen = new Set();
  const touched = [];

  while (stack.length) {
    const [x, y] = stack.pop();
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    if (x < 0 || y < 0 || x >= SpriteCanvas.width || y >= SpriteCanvas.height) continue;
    if (SpriteCanvas.pixels[y][x] !== target) continue;

    seen.add(key);
    touched.push([x, y]);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // o fill "atravessa" pixels travados pra continuar a inundação além deles,
  // mas só aplica a nova cor nos que não estão protegidos
  const editable = touched.filter(([x, y]) => !isLocked(x, y));
  editable.forEach(([x, y]) => (SpriteCanvas.pixels[y][x] = newIdx));
  SpriteCanvas.render();

  const frame = AppState.activeFrameIndex ?? 0;
  // envia em lote via região não é seguro (fill não é retangular) -> manda pixel a pixel
  for (const [x, y] of editable) {
    try {
      await Api.setPixel(AppState.spriteId, x, y, newIdx, frame);
    } catch (err) {
      console.error("Falha ao salvar pixel do fill:", err);
    }
  }
}

function pushUndoSnapshot() {
  AppState.undoStack.push(currentPixelsSnapshot());
  if (AppState.undoStack.length > 40) AppState.undoStack.shift();
  AppState.redoStack = []; // qualquer novo traço invalida o "refazer" pendente
}

async function applyPixelSnapshot(snapshot) {
  SpriteCanvas.pixels = snapshot;
  SpriteCanvas.render();
  const frame = AppState.activeFrameIndex ?? 0;
  // resync completo com o backend (mais simples e confiável que desfazer 1 a 1)
  // -- desfazer/refazer ignora travas de máscara de propósito (restaura o
  // estado exato que o usuário tinha antes, sem exceções)
  for (let y = 0; y < SpriteCanvas.height; y++) {
    for (let x = 0; x < SpriteCanvas.width; x++) {
      await Api.setPixel(AppState.spriteId, x, y, snapshot[y][x], frame);
    }
  }
}

async function undo() {
  const snapshot = AppState.undoStack.pop();
  if (!snapshot) return;
  AppState.redoStack.push(currentPixelsSnapshot());
  await applyPixelSnapshot(snapshot);
}

async function redo() {
  const snapshot = AppState.redoStack.pop();
  if (!snapshot) return;
  AppState.undoStack.push(currentPixelsSnapshot());
  await applyPixelSnapshot(snapshot);
}

// ---------------------------------------------------------------------------
// Wiring de UI
// ---------------------------------------------------------------------------

function setActiveTool(tool) {
  AppState.tool = tool;
  document.querySelectorAll(".tool-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === tool);
  });
}

// ---------------------------------------------------------------------------
// Modo Desenho vs modo Animated: qual layout mostrar é decidido pelo
// sprite.kind ("static" -> Desenho, "animated" -> grade de frames).
// Um sprite Animated é sempre um sprite separado (ver exportToAnimated),
// nunca o mesmo sprite estático virando multi-frame.
// ---------------------------------------------------------------------------

function applySprite(sprite) {
  AppState.spriteId = sprite.id;
  document.getElementById("sprite-id").value = sprite.id;
  document.getElementById("sprite-w").value = sprite.width;
  document.getElementById("sprite-h").value = sprite.height;
  if (sprite.kind === "animated") enterAnimatedMode(sprite);
  else enterDrawMode(sprite);
}

function enterDrawMode(sprite) {
  AppState.mode = "draw";
  AppState.animatedSprite = null;
  AppState.activeFrameIndex = 0;
  AppState.undoStack = [];
  AppState.redoStack = [];
  resetLocks();
  document.getElementById("animated-bar").classList.add("hidden");
  PaletteManager.setColors(sprite.palette);
  SpriteCanvas.loadSprite(sprite, 0);
}

function enterAnimatedMode(sprite) {
  AppState.mode = "animated";
  AppState.animatedSprite = sprite;
  AppState.activeFrameIndex = 0;
  AppState.undoStack = [];
  AppState.redoStack = [];
  resetLocks();
  document.getElementById("animated-bar").classList.remove("hidden");
  document.getElementById("animated-sprite-name").textContent = sprite.id;
  PaletteManager.setColors(sprite.palette);
  SpriteCanvas.loadSprite(sprite, 0);
  AnimatedGrid.render();
}

function switchActiveFrame(frameIndex) {
  const frame = AppState.animatedSprite?.frames[frameIndex];
  if (!frame) return;
  AppState.activeFrameIndex = frameIndex;
  AppState.undoStack = [];
  AppState.redoStack = [];
  SpriteCanvas.pixels = frame.pixels.map((row) => row.slice());
  SpriteCanvas.render();
  AnimatedGrid.render();
}

async function newSprite() {
  const id = document.getElementById("sprite-id").value.trim();
  const w = parseInt(document.getElementById("sprite-w").value, 10);
  const h = parseInt(document.getElementById("sprite-h").value, 10);
  if (!id) return alert("Dê um id para o sprite.");

  try {
    const sprite = await Api.createSprite(id, w, h, DEFAULT_PALETTE_30);
    applySprite(sprite);
  } catch (err) {
    alert("Erro ao criar sprite: " + err.message);
  }
}

async function loadSprite(id) {
  id = (id ?? document.getElementById("sprite-id").value).trim();
  if (!id) return;
  try {
    const sprite = await Api.getSprite(id);
    applySprite(sprite);
  } catch (err) {
    alert("Sprite não encontrado.");
  }
}

// cria um sprite Animated NOVO e separado a partir do desenho atual (frame
// ativo do sprite carregado), e já troca o editor pro modo Animated nele
async function exportToAnimated() {
  if (!AppState.spriteId) return alert("Crie ou abra um sprite primeiro.");
  const suggested = `${AppState.spriteId}_anim`;
  const newId = prompt("Id do novo sprite Animated:", suggested);
  if (!newId) return;
  try {
    const sprite = await Api.exportToAnimated(AppState.spriteId, newId, AppState.activeFrameIndex ?? 0);
    applySprite(sprite);
  } catch (err) {
    alert("Erro ao exportar para Animated: " + err.message);
  }
}

// duplica o frame ativo pra célula vizinha da grade 2D (esquerda/direita/
// cima/baixo). Se já existe um frame lá, só troca o foco pra ele.
async function duplicateActiveFrame(direction) {
  if (AppState.mode !== "animated" || !AppState.animatedSprite) return;
  try {
    const result = await Api.duplicateFrame(AppState.spriteId, AppState.activeFrameIndex, direction);
    AppState.animatedSprite = result.sprite;
    switchActiveFrame(result.frame_index);
  } catch (err) {
    alert("Erro ao duplicar frame: " + err.message);
  }
}

// gera as miniaturas da grade 2D do modo Animated diretamente da matriz de
// pixels em memória (sem ida à rede), posicionadas por frame.grid_x/grid_y
// -- o retângulo ocupado se auto-ajusta ao bounding box dos frames existentes
const AnimatedGrid = {
  el: null,

  init() {
    this.el = document.getElementById("animated-grid");
  },

  render() {
    if (!this.el || !AppState.animatedSprite) return;
    const sprite = AppState.animatedSprite;
    const frames = sprite.frames;
    const xs = frames.map((f) => f.grid_x);
    const ys = frames.map((f) => f.grid_y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const cols = Math.max(...xs) - minX + 1;
    const rows = Math.max(...ys) - minY + 1;

    this.el.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    this.el.style.gridTemplateRows = `repeat(${rows}, auto)`;
    this.el.innerHTML = "";

    const scale = Math.max(1, Math.floor(72 / Math.max(sprite.width, sprite.height)));

    frames.forEach((frame, i) => {
      const cell = document.createElement("canvas");
      cell.className = "animated-thumb" + (i === AppState.activeFrameIndex ? " active" : "");
      cell.width = sprite.width * scale;
      cell.height = sprite.height * scale;
      cell.style.gridColumn = frame.grid_x - minX + 1;
      cell.style.gridRow = frame.grid_y - minY + 1;
      cell.title = `frame ${i} (${frame.grid_x}, ${frame.grid_y})`;

      const ctx = cell.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      for (let y = 0; y < frame.pixels.length; y++) {
        for (let x = 0; x < frame.pixels[y].length; x++) {
          const idx = frame.pixels[y][x];
          if (idx < 0) continue;
          ctx.fillStyle = hexToCss(sprite.palette[idx] ?? "#ff00ff");
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }

      cell.addEventListener("click", () => switchActiveFrame(i));
      this.el.appendChild(cell);
    });
  },
};

async function deleteSelectedColor() {
  if (!AppState.spriteId) return;
  const idx = PaletteManager.selectedIndex;
  if (idx < 0 || !PaletteManager.colors[idx]) return alert("Nenhuma cor selecionada pra excluir.");
  const hex = PaletteManager.colors[idx];
  if (!confirm(`Excluir a cor ${hex}? Os pixels que usam essa cor (em TODOS os frames) viram transparentes.`)) {
    return;
  }
  try {
    const sprite = await Api.deleteColor(AppState.spriteId, idx);
    resetLocks(); // índices da paleta mudaram, travas antigas por índice não fazem mais sentido
    if (AppState.mode === "animated") {
      AppState.animatedSprite = sprite;
      SpriteCanvas.pixels = sprite.frames[AppState.activeFrameIndex].pixels.map((r) => r.slice());
    } else {
      SpriteCanvas.pixels = sprite.frames[0].pixels.map((r) => r.slice());
    }
    PaletteManager.setColors(sprite.palette);
    SpriteCanvas.palette = sprite.palette;
    SpriteCanvas.render();
    AnimatedGrid.render();
  } catch (err) {
    alert("Erro ao excluir cor: " + err.message);
  }
}

// ---------------------------------------------------------------------------
// Galeria: lista sprites já salvos com thumbnail, abrir / excluir / importar
// ---------------------------------------------------------------------------

const Gallery = {
  modal: null,
  grid: null,
  empty: null,

  init() {
    this.modal = document.getElementById("gallery-modal");
    this.grid = document.getElementById("gallery-grid");
    this.empty = document.getElementById("gallery-empty");
  },

  async open() {
    this.modal.classList.remove("hidden");
    this.grid.innerHTML = '<span class="muted">Carregando…</span>';
    await this.refresh();
  },

  close() {
    this.modal.classList.add("hidden");
  },

  async refresh() {
    let sprites;
    try {
      sprites = await Api.listSpritesMeta();
    } catch (err) {
      this.grid.innerHTML = "";
      alert("Erro ao carregar galeria: " + err.message);
      return;
    }
    this.empty.classList.toggle("hidden", sprites.length > 0);
    this.grid.innerHTML = "";
    sprites.forEach((meta) => this.grid.appendChild(this._buildCard(meta)));
  },

  _buildCard(meta) {
    const card = document.createElement("div");
    card.className = "gallery-card";

    const thumb = document.createElement("div");
    thumb.className = "gallery-thumb";
    const img = document.createElement("img");
    img.src = Api.exportUrl(meta.id, 0, 1);
    img.alt = meta.id;
    img.loading = "lazy";
    thumb.appendChild(img);

    const id = document.createElement("div");
    id.className = "gallery-card-id";
    id.textContent = (meta.kind === "animated" ? "🎞️ " : "🎨 ") + meta.id;

    const info = document.createElement("div");
    info.className = "gallery-card-meta";
    const updated = new Date(meta.updated_at).toLocaleString();
    const frameInfo = meta.kind === "animated" ? `${meta.frame_count} frames · ` : "";
    info.textContent = `${meta.width}×${meta.height}px · ${frameInfo}${meta.palette_size} cores · ${updated}`;

    const actions = document.createElement("div");
    actions.className = "gallery-card-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "btn btn-primary";
    openBtn.textContent = "Abrir";
    openBtn.addEventListener("click", () => {
      loadSprite(meta.id);
      this.close();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-danger";
    delBtn.textContent = "Excluir";
    delBtn.addEventListener("click", () => this._delete(meta.id));

    actions.append(openBtn, delBtn);
    card.append(thumb, id, info, actions);
    return card;
  },

  async _delete(id) {
    if (!confirm(`Excluir o sprite "${id}"? Essa ação não pode ser desfeita.`)) return;
    try {
      await Api.deleteSprite(id);
      if (AppState.spriteId === id) AppState.spriteId = null;
      await this.refresh();
    } catch (err) {
      alert("Erro ao excluir: " + err.message);
    }
  },

  async importFile(file) {
    const suggested = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "importado";
    const id = prompt("Id para o novo sprite:", suggested);
    if (!id) return;
    try {
      const sprite = await Api.importSprite(id, file);
      await this.refresh();
      loadSprite(sprite.id);
      alert(
        `Sprite "${sprite.id}" importado: ${sprite.width}×${sprite.height}px, ${sprite.palette.length} cores na paleta.`
      );
      this.close();
    } catch (err) {
      alert("Erro ao importar: " + err.message);
    }
  },
};

function exportPng() {
  if (!AppState.spriteId) return alert("Crie ou abra um sprite primeiro.");
  const scale = document.getElementById("export-scale").value;
  const frame = AppState.activeFrameIndex ?? 0;
  const url = Api.exportUrl(AppState.spriteId, frame, scale);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${AppState.spriteId}_frame${frame}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function exportMatrixTxt() {
  if (!AppState.spriteId) return alert("Crie ou abra um sprite primeiro.");
  const frame = AppState.activeFrameIndex ?? 0;
  const url = Api.exportMatrixTxtUrl(AppState.spriteId, frame);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${AppState.spriteId}_frame${frame}_matrix.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function analyzeSprite() {
  if (!AppState.spriteId) return;
  try {
    const data = await Api.analyze(AppState.spriteId, AppState.activeFrameIndex ?? 0);
    document.getElementById("analyze-out").textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    document.getElementById("analyze-out").textContent = "Erro: " + err.message;
  }
}

async function extractPaletteFromReference() {
  if (!ReferenceLayer.img) return alert("Importe uma imagem de referência primeiro.");

  const sorted = ReferenceLayer.extractColorCounts(); // [[hex, contagem], ...] desc
  if (sorted.length === 0) return alert("Nenhuma cor não-transparente encontrada na referência.");

  const MAX = 30;
  const top = sorted.slice(0, MAX).map(([hex]) => hex);

  if (PaletteManager.colors.length > 0) {
    const ok = confirm(
      `Isso vai substituir sua paleta atual (${PaletteManager.colors.length} cores) pelas ${top.length} cores extraídas da referência. Continuar?`
    );
    if (!ok) return;
  }

  PaletteManager.setColors(top);
  SpriteCanvas.palette = top;
  SpriteCanvas.render();

  if (AppState.spriteId) {
    try {
      await Api.updatePalette(AppState.spriteId, top);
    } catch (err) {
      console.error("Falha ao salvar paleta extraída:", err);
    }
  }

  const extra =
    sorted.length > MAX
      ? ` (de ${sorted.length} cores únicas encontradas na referência, mantidas as ${MAX} mais frequentes)`
      : ` (todas as ${sorted.length} cores únicas encontradas na referência)`;
  document.getElementById("analyze-out").textContent =
    `Paleta extraída da referência: ${top.length} cores aplicadas${extra}`;
}

// pega a arte de referência, calcula onde tem/não tem pixel (máscara de
// alpha) e desenha em preto só a BORDA (contorno) daquele desenho no sprite
// atual -- serve de base pra colorir/desenhar em cima em vez de começar do
// zero. Só escreve nos pixels de contorno; o resto do canvas fica intacto.
async function extractOutlineFromReference() {
  if (!ReferenceLayer.img) return alert("Importe uma imagem de referência primeiro.");
  if (!AppState.spriteId) return alert("Crie ou abra um sprite primeiro.");

  const outline = ReferenceLayer.extractOutlineMask();
  if (outline.size === 0) {
    return alert("Nenhum contorno encontrado (a referência parece vazia ou totalmente transparente).");
  }

  let blackIndex = PaletteManager.colors.findIndex((c) => c.toLowerCase() === "#000000ff");
  if (blackIndex < 0) {
    if (PaletteManager.colors.length >= MAX_PALETTE_COLORS) {
      return alert(`Paleta cheia (${MAX_PALETTE_COLORS}/${MAX_PALETTE_COLORS}) e sem preto disponível pro contorno. Exclua uma cor e tente de novo.`);
    }
    PaletteManager.addColor("#000000");
    blackIndex = PaletteManager.selectedIndex; // addColor já seleciona a cor recém-adicionada
  }

  pushUndoSnapshot();
  let applied = 0;
  for (const key of outline) {
    const [xs, ys] = key.split(",");
    const x = parseInt(xs, 10);
    const y = parseInt(ys, 10);
    if (x >= SpriteCanvas.width || y >= SpriteCanvas.height) continue; // segurança se as dimensões não baterem
    await commitPixel(x, y, blackIndex);
    applied++;
  }

  document.getElementById("analyze-out").textContent =
    `Contorno extraído da referência: ${applied} pixels de borda desenhados em preto (índice ${blackIndex} da paleta).`;
}

function clearCanvas() {
  if (!confirm("Limpar todo o canvas?")) return;
  pushUndoSnapshot();
  for (let y = 0; y < SpriteCanvas.height; y++) {
    for (let x = 0; x < SpriteCanvas.width; x++) {
      commitPixel(x, y, -1); // commitPixel já pula pixels travados
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  SpriteCanvas.init();
  Gallery.init();
  AnimatedGrid.init();

  document.getElementById("btn-gallery").addEventListener("click", () => Gallery.open());
  document.getElementById("btn-gallery-close").addEventListener("click", () => Gallery.close());
  document.getElementById("gallery-modal").addEventListener("click", (e) => {
    if (e.target.id === "gallery-modal") Gallery.close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("gallery-modal").classList.contains("hidden")) {
      Gallery.close();
    }
  });
  document.getElementById("import-file").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) Gallery.importFile(file);
    e.target.value = "";
  });

  SpriteCanvas.onPixelClick = (x, y, meta) => paintPixel(x, y, meta);
  SpriteCanvas.onHover = (pos) => {
    document.getElementById("cursor-pos").textContent = pos
      ? `x: ${pos.x}, y: ${pos.y}`
      : "x: -, y: -";
  };

  // registra undo no início de cada traço (mousedown)
  document.getElementById("sprite-canvas").addEventListener("mousedown", pushUndoSnapshot);

  // ao soltar o botão do mouse, se estiver no modo Animated, resincroniza o
  // frame ativo no sprite completo em memória e atualiza as miniaturas da
  // grade (feito no fim do traço, não a cada pixel, por custo)
  window.addEventListener("mouseup", () => {
    if (AppState.mode === "animated" && AppState.animatedSprite) {
      AppState.animatedSprite.frames[AppState.activeFrameIndex].pixels = SpriteCanvas.pixels.map((r) =>
        r.slice()
      );
      AnimatedGrid.render();
    }
  });

  document.querySelectorAll(".tool-btn").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTool(btn.dataset.tool));
  });

  document.getElementById("mirror-x").addEventListener("change", (e) => {
    AppState.mirrorX = e.target.checked;
  });

  document.getElementById("axis-lock").addEventListener("change", (e) => {
    SpriteCanvas.axisLockEnabled = e.target.checked;
  });

  document.getElementById("brush-size").addEventListener("input", (e) => {
    const s = parseInt(e.target.value, 10);
    AppState.brushSize = s;
    document.getElementById("brush-size-label").textContent = s + "px";
  });

  // ---- camada de referência (decalque para comparar com sprites reais) ----
  document.getElementById("ref-file").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        ReferenceLayer.setImage(img);

        // preenche largura/altura do sprite com o tamanho EXATO da imagem
        // importada (em pixels reais, não em px de tela) -- garante que o
        // canvas fique pixel-perfeito com a referência, sem distorção
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const MAX_DIM = 4096; // mesmo limite validado no backend (Sprite.width/height)

        if (w > MAX_DIM || h > MAX_DIM) {
          alert(
            `A referência tem ${w}×${h}px, acima do limite de ${MAX_DIM}px por lado. ` +
            `Ajuste o tamanho manualmente antes de criar o sprite.`
          );
          return;
        }

        document.getElementById("sprite-w").value = w;
        document.getElementById("sprite-h").value = h;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("ref-visible").addEventListener("change", (e) => {
    ReferenceLayer.visible = e.target.checked;
    ReferenceLayer.render();
  });

  document.getElementById("ref-opacity").addEventListener("input", (e) => {
    const pct = parseInt(e.target.value, 10);
    ReferenceLayer.opacity = pct / 100;
    document.getElementById("ref-opacity-label").textContent = pct + "%";
    ReferenceLayer.render();
  });

  document.getElementById("btn-ref-clear").addEventListener("click", () => {
    ReferenceLayer.clear();
    document.getElementById("ref-file").value = "";
  });

  document.getElementById("btn-extract-palette").addEventListener("click", extractPaletteFromReference);
  document.getElementById("btn-extract-outline").addEventListener("click", extractOutlineFromReference);

  document.getElementById("zoom").addEventListener("input", (e) => {
    const z = parseInt(e.target.value, 10);
    document.getElementById("zoom-label").textContent = z + "×";
    SpriteCanvas.setZoom(z);
  });

  document.getElementById("canvas-bg").addEventListener("change", (e) => {
    SpriteCanvas.bgMode = e.target.value;
    SpriteCanvas._renderChecker();
  });

  document.getElementById("grid-visible").addEventListener("change", (e) => {
    GridOverlay.visible = e.target.checked;
    GridOverlay.render();
  });

  document.getElementById("grid-spacing").addEventListener("input", (e) => {
    const n = parseInt(e.target.value, 10);
    GridOverlay.spacing = n;
    document.getElementById("grid-spacing-label").textContent = `a cada ${n}px`;
    GridOverlay.render();
  });

  document.getElementById("btn-new").addEventListener("click", newSprite);
  document.getElementById("btn-load").addEventListener("click", () => loadSprite());
  document.getElementById("btn-save").addEventListener("click", () => {
    if (AppState.spriteId) alert("Salvo automaticamente a cada edição.");
  });
  document.getElementById("btn-export").addEventListener("click", exportPng);
  document.getElementById("btn-export-matrix").addEventListener("click", exportMatrixTxt);
  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-redo").addEventListener("click", redo);
  document.getElementById("btn-clear").addEventListener("click", clearCanvas);
  document.getElementById("btn-export-animated").addEventListener("click", exportToAnimated);
  document.getElementById("btn-analyze").addEventListener("click", analyzeSprite);

  document.getElementById("dup-left").addEventListener("click", () => duplicateActiveFrame("left"));
  document.getElementById("dup-right").addEventListener("click", () => duplicateActiveFrame("right"));
  document.getElementById("dup-up").addEventListener("click", () => duplicateActiveFrame("up"));
  document.getElementById("dup-down").addEventListener("click", () => duplicateActiveFrame("down"));

  // atalhos de teclado: Ctrl+Z desfaz, Ctrl+Y ou Ctrl+Shift+Z refaz.
  // ignora quando o foco está num campo de texto/número (não atrapalha digitação)
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (!(e.ctrlKey || e.metaKey)) return;

    if (e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  });

  // atalhos numéricos 1-9: selecionam rapidamente as primeiras 9 cores da paleta
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9 && PaletteManager.colors[n - 1]) {
      PaletteManager.select(n - 1);
    }
  });

  document.getElementById("btn-add-color").addEventListener("click", () => {
    const hex = document.getElementById("new-color").value;
    PaletteManager.addColor(hex);
  });

  document.getElementById("btn-delete-color").addEventListener("click", deleteSelectedColor);

  PaletteManager.isLocked = (i) => AppState.lockedColors.has(i);

  PaletteManager.onChange = async (colors) => {
    // sincroniza a cópia local do canvas ANTES de re-renderizar, senão o
    // preview desenha com a paleta antiga (pixel aparece com a cor de
    // "índice inválido" mesmo já tendo a cor certa salva no backend)
    SpriteCanvas.palette = colors;
    SpriteCanvas.render();
    if (AppState.animatedSprite) {
      AppState.animatedSprite.palette = colors;
      AnimatedGrid.render();
    }

    if (AppState.spriteId) {
      try {
        await Api.updatePalette(AppState.spriteId, colors);
      } catch (err) {
        console.error("Falha ao salvar paleta:", err);
      }
    }
  };

  // paleta inicial de conveniência (o usuário pode apagar/trocar cor por cor)
  PaletteManager.setColors(DEFAULT_PALETTE_30);
});
