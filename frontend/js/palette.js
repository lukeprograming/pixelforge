// Gerencia a paleta de cores do sprite ativo (máximo 30 cores).
const MAX_PALETTE_COLORS = 30;

const PaletteManager = {
  colors: [], // array de "#rrggbbaa"
  selectedIndex: -1, // -1 = transparente/borracha
  onChange: null, // callback(colors)

  setColors(colors) {
    this.colors = colors.slice(0, MAX_PALETTE_COLORS);
    if (this.selectedIndex >= this.colors.length) this.selectedIndex = this.colors.length - 1;
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
  },

  render() {
    const grid = document.getElementById("palette-grid");
    const count = document.getElementById("palette-count");
    count.textContent = `(${this.colors.length}/${MAX_PALETTE_COLORS})`;
    grid.innerHTML = "";

    this.colors.forEach((hex, i) => {
      const sw = document.createElement("div");
      sw.className = "swatch" + (i === this.selectedIndex ? " selected" : "");
      sw.style.setProperty("--swatch-color", hexToCss(hex));
      sw.title = hex;
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
