#!/usr/bin/env node

// Smoke test da lógica real do editor sem depender de uma instalação de
// WebDriver. Carrega api.js + app.js no mesmo contexto usado pelo navegador,
// simula gestos da UI e usa um fetch em memória para verificar a persistência.

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const frontendRoot = path.resolve(__dirname, "..");
const apiSource = fs.readFileSync(path.join(frontendRoot, "js", "api.js"), "utf8");
const appSource = fs.readFileSync(path.join(frontendRoot, "js", "app.js"), "utf8");

const sprites = new Map();
const requests = [];
const faults = { failNextFrameSave: false };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function response(status, value) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return clone(value);
    },
    async text() {
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  };
}

async function fetchMock(url, options = {}) {
  const method = options.method || "GET";
  const pathname = new URL(url, "http://pixelforge.local").pathname;
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ method, pathname, body });

  if (method === "GET" && pathname === "/api/sprites/meta") {
    return response(200, []);
  }

  if (method === "POST" && pathname === "/api/sprites") {
    const sprite = {
      id: body.id,
      width: body.width,
      height: body.height,
      palette: body.palette || [],
      frames: [{ name: "frame_0", pixels: Array.from({ length: body.height }, () => Array(body.width).fill(-1)) }],
    };
    sprites.set(sprite.id, sprite);
    return response(200, sprite);
  }

  const match = pathname.match(/^\/api\/sprites\/([^/]+)(?:\/(stroke)|\/frame\/(\d+))?$/);
  if (!match) return response(404, "not found");
  const id = decodeURIComponent(match[1]);
  const sprite = sprites.get(id);
  if (!sprite) return response(404, "sprite not found");

  if (method === "GET" && !match[2] && match[3] === undefined) return response(200, sprite);
  if (method === "DELETE" && !match[2] && match[3] === undefined) {
    sprites.delete(id);
    return response(200, { deleted: id });
  }
  if (method === "PATCH" && match[2] === "stroke") {
    const pixels = sprite.frames[body.frame].pixels;
    for (const region of body.regions) {
      for (let y = region.y0; y <= region.y1; y++) {
        for (let x = region.x0; x <= region.x1; x++) pixels[y][x] = region.palette_index;
      }
    }
    return response(200, { id, frame: body.frame, regions_applied: body.regions.length });
  }
  if (method === "PUT" && match[3] !== undefined) {
    if (faults.failNextFrameSave) {
      faults.failNextFrameSave = false;
      return response(503, "save unavailable");
    }
    sprite.frames[Number(match[3])].pixels = clone(body.pixels);
    return response(200, { saved: id, frame: Number(match[3]) });
  }
  return response(405, "method not allowed");
}

const SpriteCanvas = {
  width: 0,
  height: 0,
  pixels: [],
  isPanTool: false,
  renderCount: 0,
  dirtyRenderCount: 0,
  render() {
    this.renderCount++;
  },
  renderRegions() {
    this.dirtyRenderCount++;
  },
  setPixelLocal(x, y, index) {
    this.pixels[y][x] = index;
  },
};

const elements = {
  "save-status": { className: "", textContent: "" },
  "btn-save": { disabled: false },
  "analyze-out": { textContent: "" },
};

const context = vm.createContext({
  Api: undefined,
  assert,
  elements,
  faults,
  requests,
  SpriteCanvas,
  PaletteManager: { selectedIndex: 0, render() {} },
  ReferenceLayer: { getColorAt() { return null; } },
  LockOverlay: { render() {} },
  document: {
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
  },
  window: { addEventListener() {} },
  fetch: fetchMock,
  URL,
  URLSearchParams,
  FormData,
  setTimeout,
  clearTimeout,
  console,
});

const smokeSource = `
async function runPaintUiSmoke() {
  assert.match(Api.exportUrl("sprite cache", 0, 1, "2026-08-22T14:00:00"), /[?&]v=2026-08-22T14%3A00%3A00/);
  await Api.listSpritesMeta();
  assert.equal(requests.at(-1).pathname, "/api/sprites/meta");
  const created = await Api.createSprite("paint-ui-smoke", 128, 8, ["#111111ff", "#ffffffff"]);
  AppState.spriteId = created.id;
  SpriteCanvas.width = created.width;
  SpriteCanvas.height = created.height;
  SpriteCanvas.pixels = created.frames[0].pixels.map((row) => row.slice());
  assert.equal(AppState.autosaveEnabled, false);
  setAutosaveEnabled(true);

  // Arraste longo: muitos carimbos locais, um único PATCH /stroke no mouse-up.
  AppState.tool = "pencil";
  AppState.brushSize = 1;
  PaletteManager.selectedIndex = 0;
  beginPaintStroke();
  for (let x = 0; x < 100; x++) await paintPixel(x, 1, { isDown: x === 0 });
  await paintPixel(99, 1, { isDown: false }); // repetição consecutiva deve ser removida
  await flushPaintStroke();

  let strokeCalls = requests.filter((request) => request.pathname.endsWith("/stroke"));
  assert.equal(strokeCalls.length, 1);
  assert.equal(strokeCalls[0].body.regions.length, 100);
  assert.equal(requests.some((request) => request.pathname.endsWith("/pixel")), false);
  assert.equal(requests.some((request) => request.pathname.endsWith("/region")), false);
  assert.equal(SpriteCanvas.pixels[1].slice(0, 100).every((value) => value === 0), true);

  // Espelho: os dois lados precisam fazer parte da mesma transação.
  AppState.mirrorX = true;
  PaletteManager.selectedIndex = 1;
  beginPaintStroke();
  await paintPixel(4, 3, { isDown: true });
  await flushPaintStroke();
  assert.equal(SpriteCanvas.pixels[3][4], 1);
  assert.equal(SpriteCanvas.pixels[3][123], 1);

  // Máscara: o centro travado fica intacto e os oito vizinhos são editados.
  AppState.mirrorX = false;
  AppState.brushSize = 3;
  AppState.lockedPixels = new Set(["20,5"]);
  PaletteManager.selectedIndex = 0;
  beginPaintStroke();
  await paintPixel(20, 5, { isDown: true });
  await flushPaintStroke();
  assert.equal(SpriteCanvas.pixels[5][20], -1);
  for (let y = 4; y <= 6; y++) {
    for (let x = 19; x <= 21; x++) {
      if (x !== 20 || y !== 5) assert.equal(SpriteCanvas.pixels[y][x], 0);
    }
  }

  // Fill atravessa a máscara, mas não altera o pixel protegido.
  AppState.brushSize = 1;
  AppState.tool = "fill";
  AppState.lockedPixels = new Set(["110,6"]);
  PaletteManager.selectedIndex = 1;
  beginPaintStroke();
  await paintPixel(109, 6, { isDown: true });
  await flushPaintStroke();
  assert.equal(SpriteCanvas.pixels[6][110], -1);
  assert.equal(SpriteCanvas.pixels[6][109], 1);
  assert.equal(SpriteCanvas.pixels[6][111], 1);

  // Reabrir pela API deve devolver exatamente o estado visto no canvas.
  const reopened = await Api.getSprite(created.id);
  assert.deepEqual(reopened.frames[0].pixels, SpriteCanvas.pixels);
  strokeCalls = requests.filter((request) => request.pathname.endsWith("/stroke"));
  assert.equal(strokeCalls.length, 4);
  assert.equal(AppState.undoStack.length, 4);
  assert.ok(SpriteCanvas.dirtyRenderCount >= 102);
  assert.ok(SpriteCanvas.renderCount >= 1); // fill usa redraw integral uma vez

  // O autosave também precisa funcionar sem um mouse-up explícito: uma pausa
  // no traço dispara o flush temporizado.
  AppState.tool = "pencil";
  AppState.lockedPixels = new Set();
  PaletteManager.selectedIndex = 0;
  beginPaintStroke();
  await paintPixel(120, 7, { isDown: true });
  await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 40));
  await AppState.strokeFlushChain;
  assert.equal(AppState.pendingStroke, null);
  assert.equal(elements["save-status"].className, "save-status saved");
  assert.equal(elements["save-status"].textContent, "● Salvo automaticamente");
  strokeCalls = requests.filter((request) => request.pathname.endsWith("/stroke"));
  assert.equal(strokeCalls.length, 5);

  // No modo manual, pausa/mouse-up não chama /stroke; o botão Salvar faz uma
  // única sincronização integral do frame.
  setAutosaveEnabled(false);
  const strokesBeforeManualEdit = requests.filter((request) => request.pathname.endsWith("/stroke")).length;
  beginPaintStroke();
  PaletteManager.selectedIndex = 1;
  await paintPixel(127, 7, { isDown: true });
  assert.equal(hasUnsavedChanges(), true);
  await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 40));
  assert.equal(requests.filter((request) => request.pathname.endsWith("/stroke")).length, strokesBeforeManualEdit);
  assert.equal(await saveCurrentSprite(), true);
  const frameSaves = requests.filter((request) => request.method === "PUT" && request.pathname.includes("/frame/"));
  assert.equal(frameSaves.length, 1);
  assert.equal(elements["btn-save"].disabled, false);
  assert.equal(elements["save-status"].textContent, "● Salvo manualmente");
  assert.equal(hasUnsavedChanges(), false);
  const manuallyReopened = await Api.getSprite(created.id);
  assert.deepEqual(manuallyReopened.frames[0].pixels, SpriteCanvas.pixels);

  // Falha real do botão precisa ficar visível e nunca deixá-lo travado.
  faults.failNextFrameSave = true;
  assert.equal(await saveCurrentSprite(), false);
  assert.equal(elements["btn-save"].disabled, false);
  assert.equal(elements["save-status"].className, "save-status error");
  assert.match(elements["analyze-out"].textContent, /não foi possível salvar/);
}

runPaintUiSmoke();
`;

(async () => {
  const result = vm.runInContext(`${apiSource}\n${appSource}\n${smokeSource}`, context, {
    filename: "pixelforge-ui-smoke.bundle.js",
  });
  await result;
  console.log("paint_ui_smoke=ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
