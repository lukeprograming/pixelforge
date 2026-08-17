// Amarra ferramentas, paleta e canvas. Mantém o estado atual do sprite
// e envia cada alteração de pixel para o backend (fonte da verdade).

const AppState = {
  spriteId: null,
  tool: "pencil",
  mirrorX: false,
  undoStack: [], // snapshots rasos da matriz de pixels antes de cada gesto
};

function currentPixelsSnapshot() {
  return SpriteCanvas.pixels.map((row) => row.slice());
}

async function paintPixel(x, y) {
  const idx = AppState.tool === "eraser" ? -1 : PaletteManager.selectedIndex;
  if (AppState.tool === "eyedropper") {
    const picked = SpriteCanvas.pixels[y][x];
    if (picked >= 0) PaletteManager.select(picked);
    return;
  }
  if (AppState.tool === "fill") {
    await bucketFill(x, y, idx);
    return;
  }
  // lápis / borracha: 1 pixel, com espelho opcional no eixo X
  await commitPixel(x, y, idx);
  if (AppState.mirrorX) {
    const mx = SpriteCanvas.width - 1 - x;
    await commitPixel(mx, y, idx);
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
}

async function undo() {
  const snapshot = AppState.undoStack.pop();
  if (!snapshot) return;
  SpriteCanvas.pixels = snapshot;
  SpriteCanvas.render();
  // resync completo com o backend (mais simples e confiável que desfazer 1 a 1)
  for (let y = 0; y < SpriteCanvas.height; y++) {
    for (let x = 0; x < SpriteCanvas.width; x++) {
      await Api.setPixel(AppState.spriteId, x, y, snapshot[y][x]);
    }
  }
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

  document.getElementById("zoom").addEventListener("input", (e) => {
    const z = parseInt(e.target.value, 10);
    document.getElementById("zoom-label").textContent = z + "×";
    SpriteCanvas.setZoom(z);
  });

  document.getElementById("btn-new").addEventListener("click", newSprite);
  document.getElementById("btn-load").addEventListener("click", loadSprite);
  document.getElementById("btn-save").addEventListener("click", () => {
    if (AppState.spriteId) alert("Salvo automaticamente a cada edição.");
  });
  document.getElementById("btn-export").addEventListener("click", exportPng);
  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-clear").addEventListener("click", clearCanvas);
  document.getElementById("btn-analyze").addEventListener("click", analyzeSprite);

  document.getElementById("btn-add-color").addEventListener("click", () => {
    const hex = document.getElementById("new-color").value;
    PaletteManager.addColor(hex);
  });

  PaletteManager.onChange = async (colors) => {
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
