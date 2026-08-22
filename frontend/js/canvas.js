// Núcleo do canvas: renderiza a matriz de pixels exata (sem blur, sem
// antialiasing) e traduz cliques de mouse em coordenadas (x, y) do grid.
// O zoom é puramente visual (scale do canvas), nunca altera os dados.

// Camada de referência: imagem importada pelo usuário, exibida por baixo
// do desenho (decalque para comparar/rastrear), nunca é salva no backend
// -- é só um auxílio visual local.
const ReferenceLayer = {
  img: null,
  opacity: 0.5,
  visible: true,
  el: null,
  ctx: null,

  init() {
    this.el = document.getElementById("reference");
    this.ctx = this.el.getContext("2d");
  },

  setImage(imgEl) {
    this.img = imgEl;
    this.render();
  },

  clear() {
    this.img = null;
    this.ctx?.clearRect(0, 0, this.el.width, this.el.height);
  },

  // calcula o retângulo de desenho da referência dentro do canvas,
  // preservando a proporção original (contain-fit: encaixa pelo maior lado,
  // sem cortar nem distorcer) e centralizando o espaço sobrando
  _getDrawRect() {
    const iw = this.img.naturalWidth || this.img.width;
    const ih = this.img.naturalHeight || this.img.height;
    const scale = Math.min(this.el.width / iw, this.el.height / ih);
    const w = iw * scale;
    const h = ih * scale;
    return { x: (this.el.width - w) / 2, y: (this.el.height - h) / 2, w, h };
  },

  render() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.el.width, this.el.height);
    if (!this.img || !this.visible) return;
    const { x, y, w, h } = this._getDrawRect();
    this.ctx.globalAlpha = this.opacity;
    this.ctx.imageSmoothingEnabled = false; // mantém a estética pixel art ao escalar
    this.ctx.drawImage(this.img, x, y, w, h);
    this.ctx.globalAlpha = 1;
  },

  // captura a cor exata de um pixel da referência na coordenada de grid (x,y),
  // amostrando o centro da célula correspondente no canvas já escalado
  getColorAt(gridX, gridY, zoom) {
    if (!this.img || !this.visible || !this.ctx) return null;
    const px = Math.min(this.el.width - 1, Math.floor(gridX * zoom + zoom / 2));
    const py = Math.min(this.el.height - 1, Math.floor(gridY * zoom + zoom / 2));
    try {
      // lê o pixel com opacidade total (ignora o globalAlpha usado no render
      // visual), redesenhando num buffer temporário só pra leitura exata,
      // usando o mesmo retângulo proporcional exibido na tela
      const { x, y, w, h } = this._getDrawRect();
      const tmp = document.createElement("canvas");
      tmp.width = this.el.width;
      tmp.height = this.el.height;
      const tctx = tmp.getContext("2d");
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(this.img, x, y, w, h);
      const data = tctx.getImageData(px, py, 1, 1).data;
      if (data[3] === 0) return null; // transparente, nada pra capturar
      return rgbaToHex(data[0], data[1], data[2], data[3]);
    } catch (err) {
      console.error("Falha ao ler cor da referência:", err);
      return null;
    }
  },

  // varre TODOS os pixels da imagem original (resolução nativa, sem escala
  // do zoom) e retorna [[hex, contagem], ...] ordenado do mais frequente
  // pro menos frequente. Pixels transparentes são ignorados.
  extractColorCounts() {
    if (!this.img) return [];
    const tmp = document.createElement("canvas");
    tmp.width = this.img.naturalWidth || this.img.width;
    tmp.height = this.img.naturalHeight || this.img.height;
    const tctx = tmp.getContext("2d");
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(this.img, 0, 0);
    const data = tctx.getImageData(0, 0, tmp.width, tmp.height).data;

    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;
      const hex = rgbaToHex(data[i], data[i + 1], data[i + 2], a);
      counts.set(hex, (counts.get(hex) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  },

  // extrai o CONTORNO da arte de referência: um pixel opaco entra no
  // contorno se pelo menos um vizinho (4 direções) for transparente ou
  // estiver fora da imagem. Resolução nativa (mesma usada pra definir
  // largura/altura do sprite na importação, então mapeia 1:1 sem escala).
  // Retorna um Set de chaves "x,y".
  extractOutlineMask(alphaThreshold = 128) {
    const outline = new Set();
    if (!this.img) return outline;

    const width = this.img.naturalWidth || this.img.width;
    const height = this.img.naturalHeight || this.img.height;
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const tctx = tmp.getContext("2d");
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(this.img, 0, 0);
    const data = tctx.getImageData(0, 0, width, height).data;

    const isOpaque = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      return data[(y * width + x) * 4 + 3] >= alphaThreshold;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isOpaque(x, y)) continue;
        if (!isOpaque(x - 1, y) || !isOpaque(x + 1, y) || !isOpaque(x, y - 1) || !isOpaque(x, y + 1)) {
          outline.add(`${x},${y}`);
        }
      }
    }
    return outline;
  },
};

// Overlay de grade visual: linhas finas para marcar os limites dos pixels
// (ou de blocos de N pixels). Puramente visual, não interfere no desenho
// nem é salvo -- e é independente do tamanho do pincel selecionado.
const GridOverlay = {
  spacing: 1, // a cada N pixels desenha uma linha (1 a 8)
  visible: true,
  el: null,
  ctx: null,

  init() {
    this.el = document.getElementById("grid");
    this.ctx = this.el.getContext("2d");
  },

  render() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.el.width, this.el.height);
    if (!this.visible) return;

    const zoom = SpriteCanvas.zoom;
    const step = this.spacing * zoom;
    if (step < 2) return; // linhas grudadas demais não ajudam, só poluem

    this.ctx.strokeStyle = "rgba(255,255,255,0.35)";
    this.ctx.lineWidth = 1;

    for (let x = 0; x <= this.el.width; x += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(x + 0.5, 0);
      this.ctx.lineTo(x + 0.5, this.el.height);
      this.ctx.stroke();
    }
    for (let y = 0; y <= this.el.height; y += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y + 0.5);
      this.ctx.lineTo(this.el.width, y + 0.5);
      this.ctx.stroke();
    }
  },
};

// Overlay visual da ferramenta de máscara: tinge de vermelho translúcido
// qualquer pixel protegido, seja por cor (AppState.lockedColors, resolvido
// contra a cor atual de cada pixel) ou por coordenada exata
// (AppState.lockedPixels). Puramente visual, não bloqueia nada por si só --
// quem bloqueia a edição de fato é o isLocked() em app.js.
const LockOverlay = {
  el: null,
  ctx: null,

  init() {
    this.el = document.getElementById("lock-overlay");
    this.ctx = this.el.getContext("2d");
  },

  render() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.el.width, this.el.height);
    const lockedColors = typeof AppState !== "undefined" ? AppState.lockedColors : null;
    const lockedPixels = typeof AppState !== "undefined" ? AppState.lockedPixels : null;
    if ((!lockedColors || lockedColors.size === 0) && (!lockedPixels || lockedPixels.size === 0)) return;

    const zoom = SpriteCanvas.zoom;
    this.ctx.fillStyle = "rgba(239,106,106,0.32)";
    for (let y = 0; y < SpriteCanvas.height; y++) {
      for (let x = 0; x < SpriteCanvas.width; x++) {
        const idx = SpriteCanvas.pixels[y]?.[x];
        const byPixel = lockedPixels?.has(`${x},${y}`);
        const byColor = idx !== undefined && idx >= 0 && lockedColors?.has(idx);
        if (!byPixel && !byColor) continue;
        this.ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    }
  },
};

const SpriteCanvas = {
  width: 40,
  height: 40,
  zoom: 14,
  pixels: [], // [y][x] -> paletteIndex ou -1
  palette: [],
  bgMode: "dark", // "dark" | "light" | "white" | "black" -- fundo do canvas p/ contraste

  axisLockEnabled: false, // trava o eixo dominante do arraste (linha reta)
  _dragStart: null,
  _lockAxis: null, // null | 'h' (trava Y, anda em X) | 'v' (trava X, anda em Y)

  // pan (arrastar a área de desenho): botão do meio do mouse funciona sempre,
  // independente da ferramenta ativa; a ferramenta "Mover" (isPanTool) faz o
  // botão esquerdo se comportar como o meio, útil sem rodinha/clique-meio
  isPanTool: false,
  _panActive: false,
  _panStart: null, // { x, y, scrollLeft, scrollTop }
  wrapEl: null,
  viewportEl: null, // container com scroll (.canvas-area)

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
    this.wrapEl = document.getElementById("canvas-wrap");
    this.viewportEl = document.querySelector(".canvas-area");
    ReferenceLayer.init();
    GridOverlay.init();
    LockOverlay.init();

    this.el.addEventListener("mousedown", (e) => this._onMouseDown(e));
    this.el.addEventListener("mousemove", (e) => this._onMouseMove(e));
    this.el.addEventListener("mouseleave", () => {
      if (!this._panActive) this.onHover?.(null);
    });

    // botão do meio: em vários navegadores/SOs ele abre "autoscroll" (ícone
    // redondo) ou cola a seleção primária (Linux) -- barra os dois, já que
    // o preventDefault do mousedown (em _onMouseDown) cobre o autoscroll,
    // mas o auxclick ainda dispara depois em alguns navegadores
    this.el.addEventListener("auxclick", (e) => {
      if (e.button === 1) e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => this._panMove(e));
    window.addEventListener("mouseup", (e) => this._panEnd(e));

    // solta a trava de eixo ao soltar o botão, mesmo fora do canvas
    const releaseDrag = () => {
      this._dragStart = null;
      this._lockAxis = null;
    };
    this.el.addEventListener("mouseup", releaseDrag);
    window.addEventListener("mouseup", releaseDrag);
  },

  // liga/desliga a ferramenta "Mover": enquanto ativa, o botão esquerdo
  // também arrasta o canvas (não pinta)
  setPanTool(active) {
    this.isPanTool = active;
    this.wrapEl?.classList.toggle("pan-tool", active);
  },

  _onMouseDown(e) {
    const isMiddle = e.button === 1;
    const isPanLeftClick = e.button === 0 && this.isPanTool;
    if (isMiddle || isPanLeftClick) {
      e.preventDefault();
      this._panActive = true;
      this._panStart = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: this.viewportEl.scrollLeft,
        scrollTop: this.viewportEl.scrollTop,
      };
      this.wrapEl?.classList.add("panning");
      return;
    }
    if (e.button !== 0) return; // só botão esquerdo pinta/interage
    this._handlePointer(e, true);
  },

  _onMouseMove(e) {
    if (this._panActive) return; // durante o pan não pinta nem faz hover
    this._handlePointer(e, false);
  },

  _panMove(e) {
    if (!this._panActive || !this.viewportEl) return;
    const dx = e.clientX - this._panStart.x;
    const dy = e.clientY - this._panStart.y;
    this.viewportEl.scrollLeft = this._panStart.scrollLeft - dx;
    this.viewportEl.scrollTop = this._panStart.scrollTop - dy;
  },

  _panEnd(e) {
    if (!this._panActive) return;
    if (e.button === 1 || e.button === 0) {
      this._panActive = false;
      this._panStart = null;
      this.wrapEl?.classList.remove("panning");
    }
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
    // camada de referência acompanha o mesmo tamanho/zoom do canvas de desenho
    if (ReferenceLayer.el) {
      ReferenceLayer.el.width = w;
      ReferenceLayer.el.height = h;
      ReferenceLayer.el.style.width = w + "px";
      ReferenceLayer.el.style.height = h + "px";
    }
    // idem para a camada de grade
    if (GridOverlay.el) {
      GridOverlay.el.width = w;
      GridOverlay.el.height = h;
      GridOverlay.el.style.width = w + "px";
      GridOverlay.el.style.height = h + "px";
    }
    // idem para a camada de overlay de máscara/trava
    if (LockOverlay.el) {
      LockOverlay.el.width = w;
      LockOverlay.el.height = h;
      LockOverlay.el.style.width = w + "px";
      LockOverlay.el.style.height = h + "px";
    }
    document.getElementById("canvas-wrap").style.width = w + "px";
    document.getElementById("canvas-wrap").style.height = h + "px";
    document.getElementById("canvas-dims").textContent = `${this.width}×${this.height}px`;
    this._renderChecker();
    ReferenceLayer.render();
    GridOverlay.render();
    LockOverlay.render();
  },

  // Redesenha somente os pixels tocados por um carimbo do pincel. Em canvases
  // grandes, refazer a matriz inteira a cada mousemove era outro custo evitável.
  renderRegions(regions) {
    const ctx = this.ctx;
    const zoom = this.zoom;
    for (const [rawX0, rawY0, rawX1, rawY1] of regions) {
      const x0 = Math.max(0, Math.min(rawX0, rawX1));
      const y0 = Math.max(0, Math.min(rawY0, rawY1));
      const x1 = Math.min(this.width - 1, Math.max(rawX0, rawX1));
      const y1 = Math.min(this.height - 1, Math.max(rawY0, rawY1));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x * zoom;
          const py = y * zoom;
          ctx.clearRect(px, py, zoom, zoom);
          const idx = this.pixels[y][x];
          if (idx === undefined || idx < 0) continue;
          ctx.fillStyle = hexToCss(this.palette[idx] ?? "#ff00ff");
          ctx.fillRect(px, py, zoom, zoom);
        }
      }
    }
    LockOverlay.render();
  },

  _renderChecker() {
    const ctx = this.checkerCtx;
    const mode = this.bgMode || "dark";

    if (mode === "white" || mode === "black") {
      ctx.fillStyle = mode === "white" ? "#ffffff" : "#000000";
      ctx.fillRect(0, 0, this.checkerEl.width, this.checkerEl.height);
      return;
    }

    const colors = mode === "light" ? ["#e8e8ec", "#d4d4da"] : ["#2a2c38", "#22242e"];
    const cell = Math.max(4, Math.floor(this.zoom / 2));
    ctx.clearRect(0, 0, this.checkerEl.width, this.checkerEl.height);
    for (let y = 0; y < this.checkerEl.height; y += cell) {
      for (let x = 0; x < this.checkerEl.width; x += cell) {
        const even = ((x / cell) + (y / cell)) % 2 === 0;
        ctx.fillStyle = even ? colors[0] : colors[1];
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
    LockOverlay.render();
  },

  _handlePointer(e, isDown) {
    const rect = this.el.getBoundingClientRect();
    let x = Math.floor((e.clientX - rect.left) / this.zoom);
    let y = Math.floor((e.clientY - rect.top) / this.zoom);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      this.onHover?.(null);
      return;
    }

    if (isDown) {
      // início de um novo traço: reseta a detecção de eixo
      this._dragStart = { x, y };
      this._lockAxis = null;
    } else if (e.buttons === 1 && this.axisLockEnabled && this._dragStart) {
      const dx = x - this._dragStart.x;
      const dy = y - this._dragStart.y;
      // só decide o eixo depois de um arrasto mínimo, pra não travar num clique parado
      if (this._lockAxis === null && Math.abs(dx) + Math.abs(dy) >= 2) {
        this._lockAxis = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      }
      if (this._lockAxis === "h") y = this._dragStart.y; // arrasto horizontal -> Y travado
      else if (this._lockAxis === "v") x = this._dragStart.x; // arrasto vertical -> X travado
    }

    this.onHover?.({ x, y });
    if (isDown || e.buttons === 1) {
      this.onPixelClick?.(x, y, { isDown, shiftKey: e.shiftKey });
    }
  },
};
