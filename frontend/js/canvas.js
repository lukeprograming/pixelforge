// Núcleo do canvas: renderiza a matriz de pixels exata (sem blur, sem
// antialiasing) e traduz cliques de mouse em coordenadas (x, y) do grid.
// O zoom é puramente visual (scale do canvas), nunca altera os dados.

const SpriteCanvas = {
  width: 40,
  height: 40,
  zoom: 14,
  pixels: [], // [y][x] -> paletteIndex ou -1
  palette: [],

  el: null,
  checkerEl: null,
  ctx: null,
  checkerCtx: null,

  onPixelClick: null, // callback(x, y)
  onHover: null, // callback(x, y | null)

  init() {
    this.el = document.getElementById("sprite-canvas");
    this.checkerEl = document.getElementById("checker");
    this.ctx = this.el.getContext("2d");
    this.checkerCtx = this.checkerEl.getContext("2d");

    this.el.addEventListener("mousedown", (e) => this._handlePointer(e, true));
    this.el.addEventListener("mousemove", (e) => this._handlePointer(e, false));
    this.el.addEventListener("mouseleave", () => this.onHover?.(null));
  },

  loadSprite(sprite, frameIndex = 0) {
    this.width = sprite.width;
    this.height = sprite.height;
    this.palette = sprite.palette;
    this.pixels = sprite.frames[frameIndex].pixels.map((row) => row.slice());
    this._resize();
    this.render();
  },

  setZoom(z) {
    this.zoom = z;
    this._resize();
    this.render();
  },

  setPixelLocal(x, y, paletteIndex) {
    // atualização otimista local; a chamada de API acontece em app.js
    this.pixels[y][x] = paletteIndex;
    this.render();
  },

  _resize() {
    const w = this.width * this.zoom;
    const h = this.height * this.zoom;
    for (const c of [this.el, this.checkerEl]) {
      c.width = w;
      c.height = h;
      c.style.width = w + "px";
      c.style.height = h + "px";
    }
    document.getElementById("canvas-wrap").style.width = w + "px";
    document.getElementById("canvas-wrap").style.height = h + "px";
    document.getElementById("canvas-dims").textContent = `${this.width}×${this.height}px`;
    this._renderChecker();
  },

  _renderChecker() {
    const ctx = this.checkerCtx;
    const cell = Math.max(4, Math.floor(this.zoom / 2));
    ctx.clearRect(0, 0, this.checkerEl.width, this.checkerEl.height);
    for (let y = 0; y < this.checkerEl.height; y += cell) {
      for (let x = 0; x < this.checkerEl.width; x += cell) {
        const even = ((x / cell) + (y / cell)) % 2 === 0;
        ctx.fillStyle = even ? "#2a2c38" : "#22242e";
        ctx.fillRect(x, y, cell, cell);
      }
    }
  },

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = this.pixels[y][x];
        if (idx === undefined || idx < 0) continue;
        ctx.fillStyle = hexToCss(this.palette[idx] ?? "#ff00ff");
        ctx.fillRect(x * this.zoom, y * this.zoom, this.zoom, this.zoom);
      }
    }
  },

  _handlePointer(e, isDown) {
    const rect = this.el.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.zoom);
    const y = Math.floor((e.clientY - rect.top) / this.zoom);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      this.onHover?.(null);
      return;
    }
    this.onHover?.({ x, y });
    if (isDown || e.buttons === 1) {
      this.onPixelClick?.(x, y);
    }
  },
};
