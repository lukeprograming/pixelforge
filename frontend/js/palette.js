// Gerencia a paleta de cores do sprite ativo (máximo 30 cores).
const MAX_PALETTE_COLORS = 30;

// paleta padrão de 30 cores sólidas, sempre pré-carregada em sprites novos
// (o usuário pode apagar/trocar cor por cor depois, inclusive com o botão
// de excluir a cor selecionada)
const DEFAULT_PALETTE_30 = [
  "#000000ff", "#1a1c2cff", "#333333ff", "#5d275dff", "#666666ff",
  "#7e2553ff", "#808080ff", "#94216aff", "#999999ff", "#b13e53ff",
  "#b3b3b3ff", "#8b4513ff", "#ccccccff", "#d4a373ff", "#ffffffff",
  "#ef7d57ff", "#ff8552ff", "#ffcd75ff", "#ffe762ff", "#a7f070ff",
  "#63c74dff", "#38b764ff", "#0eaf9bff", "#257179ff", "#193d3fff",
  "#29366fff", "#3b5dc9ff", "#147df5ff", "#41a6f6ff", "#73eff7ff",
];

const PaletteManager = {
  colors: [], // array de "#rrggbbaa"
  selectedIndex: -1, // -1 = transparente/borracha
  onChange: null, // callback(colors)
  isLocked: null, // callback(index) => bool, injetado pelo app.js (estado da ferramenta de máscara)

  setColors(colors) {
    this.colors = colors.slice(0, MAX_PALETTE_COLORS);
    if (this.selectedIndex >= this.colors.length) this.selectedIndex = this.colors.length - 1;
    // se nada estava selecionado ainda, seleciona a primeira cor por padrão
    // (evita o lápis "desenhar" com índice -1 = transparente sem o usuário perceber)
    if (this.selectedIndex < 0 && this.colors.length > 0) this.selectedIndex = 0;
    this.render();
  },

  addColor(hex) {
    if (this.colors.length >= MAX_PALETTE_COLORS) {
      alert(`Limite de ${MAX_PALETTE_COLORS} cores atingido.`);
      return;
    }
    // color input HTML só dá RGB; força alpha ff
    const rgba = hex.length === 7 ? hex + "ff" : hex;
    this.colors.push(rgba);
    this.selectedIndex = this.colors.length - 1;
    this.render();
    this.onChange?.(this.colors);
  },

  select(index) {
    this.selectedIndex = index;
    this.render();
    // conveniência: também preenche o seletor de cor com a cor selecionada,
    // facilitando ajustar/duplicar uma cor próxima em vez de digitar do zero
    if (index >= 0 && this.colors[index]) {
      const picker = document.getElementById("new-color");
      if (picker) picker.value = this.colors[index].slice(0, 7); // input color só aceita RGB, sem alpha
    }
  },

  // usado pelo conta-gotas ao capturar cor da camada de referência: se a
  // cor já existe na paleta, só seleciona; senão adiciona (respeitando o
  // limite) e já seleciona a nova
  addOrSelectColor(hexRgba) {
    const normalized = hexRgba.toLowerCase();
    const existingIndex = this.colors.findIndex((c) => c.toLowerCase() === normalized);
    if (existingIndex >= 0) {
      this.select(existingIndex);
      return existingIndex;
    }
    if (this.colors.length >= MAX_PALETTE_COLORS) {
      alert(`Limite de ${MAX_PALETTE_COLORS} cores atingido — não foi possível capturar a cor.`);
      return -1;
    }
    this.colors.push(normalized);
    this.selectedIndex = this.colors.length - 1;
    this.render();
    this.onChange?.(this.colors);
    return this.selectedIndex;
  },

  render() {
    const grid = document.getElementById("palette-grid");
    const count = document.getElementById("palette-count");
    count.textContent = `(${this.colors.length}/${MAX_PALETTE_COLORS})`;
    grid.innerHTML = "";

    this.colors.forEach((hex, i) => {
      const locked = this.isLocked?.(i);
      const sw = document.createElement("div");
      sw.className =
        "swatch" + (i === this.selectedIndex ? " selected" : "") + (locked ? " locked" : "");
      sw.style.setProperty("--swatch-color", hexToCss(hex));
      sw.title = hex + (locked ? " (travada)" : "");
      sw.addEventListener("click", () => this.select(i));
      grid.appendChild(sw);
    });
  },
};

function hexToCss(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return `rgba(${r},${g},${b},${a})`;
}

function rgbaToHex(r, g, b, a) {
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
}
