// Camada fina sobre fetch() para a API do PixelForge.
const Api = {
  async createSprite(id, width, height, palette) {
    const res = await fetch("/api/sprites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, width, height, palette }),
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

  async importSpriteTxt(id, file, locked = true) {
    const body = new FormData();
    body.append("id", id);
    body.append("file", file);
    body.append("locked", locked ? "true" : "false");
    const res = await fetch("/api/sprites/import-txt", { method: "POST", body });
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

  async setRegion(id, x0, y0, x1, y1, paletteIndex, frame = 0) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}/region`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x0, y0, x1, y1, palette_index: paletteIndex, frame }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async updatePalette(id, palette, locked = null) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}/palette`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ palette, locked }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async setPaletteLock(id, locked) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}/palette-lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async deleteColor(id, index) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}/palette/delete-color`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async exportToAnimated(id, newId, frame = 0) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}/export-to-animated`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_id: newId, frame }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async duplicateFrame(id, frameIndex, direction) {
    const res = await fetch(`/api/sprites/${encodeURIComponent(id)}/frame/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame_index: frameIndex, direction }),
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

  async armorActions() {
    const res = await fetch("/api/armor/actions");
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async detectArmorScale(spriteId, frame = 0) {
    const params = new URLSearchParams({ sprite_id: spriteId, frame });
    const res = await fetch(`/api/armor/detect-scale?${params.toString()}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  armorGenerateUrl(spriteId, action, inputScale, outputScale, format) {
    const params = new URLSearchParams({
      sprite_id: spriteId,
      action,
      input_scale: inputScale,
      output_scale: outputScale,
      format,
    });
    return `/api/armor/generate?${params.toString()}`;
  },

  async audioStatus() {
    const res = await fetch("/api/audio/status");
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async generateSoundEffect(payload) {
    const res = await fetch("/api/audio/sound-effects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let message = await res.text();
      try {
        const parsed = JSON.parse(message);
        message = parsed.detail || message;
      } catch (_) {
        // Mantém a resposta textual do backend.
      }
      throw new Error(message);
    }
    return res.json();
  },

  exportMatrixTxtUrl(id, frame = 0) {
    return `/api/sprites/${encodeURIComponent(id)}/export.txt?frame=${frame}`;
  },
};
