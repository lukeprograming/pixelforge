"""
Exportação PNG pixel-perfeito (1 pixel do array = 1 pixel do PNG,
sem upscale, sem antialiasing) e análise básica de sprite para
uso por agentes (contagem de cores, bounding box real, simetria).
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image

from .models import Sprite

EXPORT_DIR = Path(__file__).resolve().parent.parent / "data" / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)


def _hex_to_rgba(hex_color: str) -> Tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 6:
        h += "ff"
    if len(h) != 8:
        raise ValueError(f"Cor de paleta inválida: {hex_color}")
    r, g, b, a = (int(h[i : i + 2], 16) for i in (0, 2, 4, 6))
    return r, g, b, a


def render_frame_to_image(sprite: Sprite, frame_index: int = 0, scale: int = 1) -> Image.Image:
    frame = sprite.frames[frame_index]
    img = Image.new("RGBA", (sprite.width, sprite.height), (0, 0, 0, 0))
    px = img.load()

    for y, row in enumerate(frame.pixels):
        for x, idx in enumerate(row):
            if idx is None or idx < 0:
                continue  # transparente
            if idx >= len(sprite.palette):
                continue  # índice inválido, ignora em vez de quebrar export
            px[x, y] = _hex_to_rgba(sprite.palette[idx])

    if scale > 1:
        # NEAREST é obrigatório aqui: qualquer outro filtro borra o pixel art
        img = img.resize((sprite.width * scale, sprite.height * scale), Image.NEAREST)

    return img


def export_png(sprite: Sprite, frame_index: int = 0, scale: int = 1) -> Path:
    img = render_frame_to_image(sprite, frame_index, scale)
    out_path = EXPORT_DIR / f"{sprite.id}_frame{frame_index}_x{scale}.png"
    img.save(out_path, "PNG")
    return out_path


def analyze_frame(sprite: Sprite, frame_index: int = 0) -> Dict:
    """
    Estatísticas úteis para um agente entender o padrão de um sprite
    sem precisar "olhar" a imagem: cores usadas, bounding box real do
    desenho dentro do canvas, e simetria horizontal/vertical.
    """
    frame = sprite.frames[frame_index]
    used_indices = set()
    min_x, min_y = sprite.width, sprite.height
    max_x, max_y = -1, -1

    for y, row in enumerate(frame.pixels):
        for x, idx in enumerate(row):
            if idx is not None and idx >= 0:
                used_indices.add(idx)
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)

    has_content = max_x >= 0
    bbox = (
        {"x0": min_x, "y0": min_y, "x1": max_x, "y1": max_y}
        if has_content
        else None
    )

    def get(x: int, y: int) -> int:
        return frame.pixels[y][x]

    symmetric_h = all(
        get(x, y) == get(sprite.width - 1 - x, y)
        for y in range(sprite.height)
        for x in range(sprite.width // 2)
    )
    symmetric_v = all(
        get(x, y) == get(x, sprite.height - 1 - y)
        for y in range(sprite.height // 2)
        for x in range(sprite.width)
    )

    return {
        "sprite_id": sprite.id,
        "frame": frame_index,
        "canvas_size": {"width": sprite.width, "height": sprite.height},
        "colors_used": len(used_indices),
        "palette_size": len(sprite.palette),
        "bounding_box": bbox,
        "coverage_ratio": (
            round(((max_x - min_x + 1) * (max_y - min_y + 1)) / (sprite.width * sprite.height), 3)
            if has_content
            else 0.0
        ),
        "symmetric_horizontal": symmetric_h,
        "symmetric_vertical": symmetric_v,
    }
