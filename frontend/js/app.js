// Amarra ferramentas, paleta e canvas. Mantém o estado atual do sprite
// e envia cada alteração de pixel para o backend (fonte da verdade).

const AppState = {
  spriteId: null,
  tool: "pencil",
  mirrorX: false,
  brushSize: 1, // pincel quadrado NxN, 1 = pixel único
  undoStack: [], // snapshots rasos da matriz de pixels antes de cada gesto
  redoStack: [], // snapshots desfeitos, para refazer (Ctrl+Y)
};

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

async function paintPixel(x, y) {
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
  SpriteCanvas.setPixelLocal(x, y, idx);
  try {
    await Api.setPixel(AppState.spriteId, x, y, idx);
  } catch (err) {
    console.error("Falha ao salvar pixel:", err);
  }
}

async function bucketFill(startX, startY, newIdx) {
  const target = SpriteCanvas.pixels[startY][startX];
  if (target === newIdx) return;

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

  touched.forEach(([x, y]) => (SpriteCanvas.pixels[y][x] = newIdx));
  SpriteCanvas.render();

  // envia em lote via região não é seguro (fill não é retangular) -> manda pixel a pixel
  for (const [x, y] of touched) {
    try {
      await Api.setPixel(AppState.spriteId, x, y, newIdx);
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
  // resync completo com o backend (mais simples e confiável que desfazer 1 a 1)
  for (let y = 0; y < SpriteCanvas.height; y++) {
    for (let x = 0; x < SpriteCanvas.width; x++) {
      await Api.setPixel(AppState.spriteId, x, y, snapshot[y][x]);
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

async function newSprite() {
  const id = document.getElementById("sprite-id").value.trim();
  const w = parseInt(document.getElementById("sprite-w").value, 10);
  const h = parseInt(document.getElementById("sprite-h").value, 10);
  if (!id) return alert("Dê um id para o sprite.");

  try {
    const sprite = await Api.createSprite(id, w, h);
    AppState.spriteId = id;
    AppState.undoStack = [];
    AppState.redoStack = [];
    PaletteManager.setColors(sprite.palette);
    SpriteCanvas.loadSprite(sprite);
  } catch (err) {
    alert("Erro ao criar sprite: " + err.message);
  }
}

async function loadSprite() {
  const id = document.getElementById("sprite-id").value.trim();
  if (!id) return;
  try {
    const sprite = await Api.getSprite(id);
    AppState.spriteId = id;
    AppState.undoStack = [];
    AppState.redoStack = [];
    document.getElementById("sprite-w").value = sprite.width;
    document.getElementById("sprite-h").value = sprite.height;
    PaletteManager.setColors(sprite.palette);
    SpriteCanvas.loadSprite(sprite);
  } catch (err) {
    alert("Sprite não encontrado.");
  }
}

function exportPng() {
  if (!AppState.spriteId) return alert("Crie ou abra um sprite primeiro.");
  const scale = document.getElementById("export-scale").value;
  const url = Api.exportUrl(AppState.spriteId, 0, scale);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${AppState.spriteId}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function analyzeSprite() {
  if (!AppState.spriteId) return;
  try {
    const data = await Api.analyze(AppState.spriteId);
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

function clearCanvas() {
  if (!confirm("Limpar todo o canvas?")) return;
  pushUndoSnapshot();
  for (let y = 0; y < SpriteCanvas.height; y++) {
    for (let x = 0; x < SpriteCanvas.width; x++) {
      commitPixel(x, y, -1);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  SpriteCanvas.init();

  SpriteCanvas.onPixelClick = (x, y) => paintPixel(x, y);
  SpriteCanvas.onHover = (pos) => {
    document.getElementById("cursor-pos").textContent = pos
      ? `x: ${pos.x}, y: ${pos.y}`
      : "x: -, y: -";
  };

  // registra undo no início de cada traço (mousedown)
  document.getElementById("sprite-canvas").addEventListener("mousedown", pushUndoSnapshot);

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
  document.getElementById("btn-load").addEventListener("click", loadSprite);
  document.getElementById("btn-save").addEventListener("click", () => {
    if (AppState.spriteId) alert("Salvo automaticamente a cada edição.");
  });
  document.getElementById("btn-export").addEventListener("click", exportPng);
  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-redo").addEventListener("click", redo);
  document.getElementById("btn-clear").addEventListener("click", clearCanvas);
  document.getElementById("btn-analyze").addEventListener("click", analyzeSprite);

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

  PaletteManager.onChange = async (colors) => {
    // sincroniza a cópia local do canvas ANTES de re-renderizar, senão o
    // preview desenha com a paleta antiga (pixel aparece com a cor de
    // "índice inválido" mesmo já tendo a cor certa salva no backend)
    SpriteCanvas.palette = colors;
    SpriteCanvas.render();

    if (AppState.spriteId) {
      try {
        await Api.updatePalette(AppState.spriteId, colors);
      } catch (err) {
        console.error("Falha ao salvar paleta:", err);
      }
    }
  };

  // paleta inicial de conveniência (o usuário pode limpar/trocar)
  PaletteManager.setColors(["#000000ff", "#ffffffff", "#ff0055ff", "#22cc88ff"]);
});
