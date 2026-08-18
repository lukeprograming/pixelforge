// Camada fina sobre fetch() para a API do PixelForge.
const Api = {
  async createSprite(id, width, height) {
    const res = await fetch("/api/sprites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, width, height }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getSprite(id) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async listSpritesMeta() {
    const res = await fetch("/api/sprites/meta");
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async deleteSprite(id) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async importSprite(id, file) {
    const body = new FormData();
    body.append("id", id);
    body.append("file", file);
    const res = await fetch("/api/sprites/import", { method: "POST", body });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async setPixel(id, x, y, paletteIndex, frame = 0) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}/pixel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y, palette_index: paletteIndex, frame }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async updatePalette(id, palette) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}/palette`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ palette }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async analyze(id, frame = 0) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}/analyze?frame=${frame}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  exportUrl(id, frame = 0, scale = 1) {
    return `/api/sprites/${encodeURIComponent(id)}/export.png?frame=${frame}&scale=${scale}`;
  },
};
