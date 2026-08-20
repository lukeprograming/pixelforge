"""
Exportação PNG pixel-perfeito (1 pixel do array = 1 pixel do PNG,
sem upscale, sem antialiasing) e análise básica de sprite para
uso por agentes (contagem de cores, bounding box real, simetria).
"""

from __future__ import annotations

import io
import math
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image

from .models import Frame, Sprite

EXPORT_DIR = Path(__file__).resolve().parent.parent / "data" / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

MAX_PALETTE_COLORS = 30
ALPHA_THRESHOLD = 128  # abaixo disso o pixel vira transparente (-1) na importação


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


def frame_to_matrix(sprite: Sprite, frame_index: int = 0) -> List[List]:
    """
    Converte a matriz de índices de paleta de um frame numa matriz [y][x]
    "achatada" pronta pro consumo de um agente: cada célula é a cor hex
    (`#RRGGBBAA`, mesmo formato da paleta) do pixel, ou `0` se o pixel
    for transparente/tiver índice inválido.
    """
    frame = sprite.frames[frame_index]
    matrix: List[List] = []
    for row in frame.pixels:
        out_row: List = []
        for idx in row:
            if idx is None or idx < 0 or idx >= len(sprite.palette):
                out_row.append(0)
            else:
                out_row.append(sprite.palette[idx])
        matrix.append(out_row)
    return matrix


def _normalize_cell_hex(cell: str) -> str:
    body = cell[1:]
    if len(body) == 6:
        body += "ff"
    if len(body) != 8 or any(c not in "0123456789abcdefABCDEF" for c in body):
        raise ValueError(f"Cor hex inválida na matriz: {cell!r}")
    return f"#{body.lower()}"


def _pad_to_square(pixels: List[List[int]], width: int, height: int) -> Tuple[List[List[int]], int]:
    """
    Se a matriz não for quadrada, centraliza ela num canvas side x side
    (side = maior lado), preenchendo a sobra com -1 (transparente).
    """
    side = max(width, height)
    if side == width and side == height:
        return pixels, side

    pad_x = (side - width) // 2
    pad_y = (side - height) // 2
    padded = [[-1] * side for _ in range(side)]
    for y, row in enumerate(pixels):
        for x, v in enumerate(row):
            padded[y + pad_y][x + pad_x] = v
    return padded, side


def sprite_from_matrix_txt(
    sprite_id: str,
    text: str,
    max_palette: int = MAX_PALETTE_COLORS,
    enforce_limit: bool = True,
) -> Sprite:
    """
    Caminho inverso do /export.txt: recebe o mesmo formato (uma linha por
    linha Y do frame, células separadas por vírgula -- cor hex "#RRGGBB"
    ou "#RRGGBBAA", ou "0" pra transparente) e monta um Sprite editável,
    com a paleta deduzida das cores únicas usadas (na ordem em que aparecem).
    Se a matriz não vier quadrada (ex: 60x40), ela é auto-ajustada pro
    maior lado (60x60), centralizada, com o restante transparente.

    Linhas mais curtas que a mais longa da matriz (comum quando a matriz é
    colada/gerada manualmente e uma linha perde células no final) são
    auto-completadas com "0" (transparente) até bater a largura -- em vez
    de rejeitar a importação inteira com erro.

    enforce_limit=False permite mais de max_palette cores únicas (sprite
    nasce com palette_locked=False) -- útil pra importar referências ricas
    em cor sem re-quantizar; o usuário pode travar depois no editor.
    """
    lines = text.replace("\r\n", "\n").replace("\r", "\n").strip("\n").split("\n")
    if not lines or all(not ln.strip() for ln in lines):
        raise ValueError("Arquivo vazio")

    rows = [ln.split(",") for ln in lines]
    width = max(len(row) for row in rows)
    height = len(rows)
    if width == 0:
        raise ValueError("Linha vazia na matriz")
    for row in rows:
        if len(row) < width:
            row.extend(["0"] * (width - len(row)))
    if width > 4096 or height > 4096:
        raise ValueError("Matriz excede o limite de 4096px por lado")

    palette: List[str] = []
    color_to_index: Dict[str, int] = {}
    pixels: List[List[int]] = []

    for row in rows:
        out_row: List[int] = []
        for raw in row:
            cell = raw.strip()
            if cell == "" or cell == "0":
                out_row.append(-1)
                continue
            if not cell.startswith("#"):
                raise ValueError(f"Célula inválida: {cell!r} (esperado hex tipo #RRGGBB[AA] ou 0)")
            hex_color = _normalize_cell_hex(cell)
            idx = color_to_index.get(hex_color)
            if idx is None:
                if enforce_limit and len(palette) >= max_palette:
                    raise ValueError(f"Matriz usa mais de {max_palette} cores únicas (limite da paleta)")
                idx = len(palette)
                palette.append(hex_color)
                color_to_index[hex_color] = idx
            out_row.append(idx)
        pixels.append(out_row)

    pixels, side = _pad_to_square(pixels, width, height)

    return Sprite(
        id=sprite_id,
        width=side,
        height=side,
        palette=palette,
        palette_locked=enforce_limit,
        frames=[Frame(name="frame_0", pixels=pixels)],
    )


# tamanhos de bloco candidatos: "1 pixel de arte = NxN pixels da imagem
# original". Cobre a faixa comum de pixelização (1x1 sem redução, até 32x32
# pra imagens bem grandes/em alta resolução).
DOWNSCALE_BLOCK_CANDIDATES = (1, 2, 4, 8, 16, 32)


def analyze_pixel_grid(width: int, height: int) -> Dict:
    """
    Verificador de downscale: pra cada tamanho de bloco candidato, diz se
    width/height são divisíveis por ele sem sobra (bloco "limpo") e qual
    seria o tamanho do grid resultante. Um bloco limpo garante que a
    redução encaixa exato no grid do app -- nenhuma coluna/linha
    parcial sobrando na borda pra cortar ou preencher.
    """
    candidates = []
    for block in DOWNSCALE_BLOCK_CANDIDATES:
        rem_w = width % block
        rem_h = height % block
        candidates.append(
            {
                "block": block,
                "clean": rem_w == 0 and rem_h == 0,
                "grid_width": width // block,
                "grid_height": height // block,
                "leftover_x": rem_w,
                "leftover_y": rem_h,
            }
        )

    gcd = math.gcd(width, height)
    clean_blocks = [b for b in range(1, gcd + 1) if gcd % b == 0]
    power_of_two_clean = [b for b in clean_blocks if b & (b - 1) == 0]
    suggested_block = max(power_of_two_clean) if power_of_two_clean else 1

    return {
        "width": width,
        "height": height,
        "gcd": gcd,
        "clean_blocks": clean_blocks,
        "suggested_block": suggested_block,
        "candidates": candidates,
    }


def analyze_reference_image(image_bytes: bytes) -> Dict:
    """Abre a imagem só pra ler as dimensões e rodar analyze_pixel_grid."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
    except Exception as exc:  # arquivo corrompido/formato não suportado
        raise ValueError(f"Não foi possível ler a imagem: {exc}") from exc
    return analyze_pixel_grid(width, height)


def _nearest_color_index(color: Tuple[int, int, int], palette_rgb: List[Tuple[int, int, int]]) -> int:
    best_i, best_dist = 0, None
    for i, (pr, pg, pb) in enumerate(palette_rgb):
        r, g, b = color
        dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if best_dist is None or dist < best_dist:
            best_i, best_dist = i, dist
    return best_i


def sprite_from_png(sprite_id: str, image_bytes: bytes, max_palette: int = MAX_PALETTE_COLORS) -> Sprite:
    """
    Converte um PNG (ou outra imagem suportada pelo Pillow) num Sprite editável:
    extrai dimensões, quantiza as cores pra caber no limite da paleta (30 por
    padrão) e mapeia cada pixel pro índice de paleta mais próximo. Pixels com
    alpha abaixo de ALPHA_THRESHOLD viram transparentes (índice -1).
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    except Exception as exc:  # arquivo corrompido/formato não suportado
        raise ValueError(f"Não foi possível ler a imagem: {exc}") from exc

    width, height = img.size
    rgba_pixels = list(img.getdata())  # row-major, len == width*height

    opaque_colors = {
        (r, g, b) for (r, g, b, a) in rgba_pixels if a >= ALPHA_THRESHOLD
    }

    if not opaque_colors:
        palette_rgb: List[Tuple[int, int, int]] = []
    elif len(opaque_colors) <= max_palette:
        palette_rgb = sorted(opaque_colors)
    else:
        # imagem-referência com 1 pixel por cor única, quantizada pelo Pillow
        # (MEDIANCUT) pra achar um conjunto representativo de <= max_palette cores
        swatch = Image.new("RGB", (len(opaque_colors), 1))
        swatch.putdata([c for c in opaque_colors])
        quantized = swatch.quantize(colors=max_palette, method=Image.MEDIANCUT)
        palette_rgb = quantized.convert("RGB").getdata()
        palette_rgb = sorted(set(palette_rgb))

    color_to_index: Dict[Tuple[int, int, int], int] = {}

    def index_for(color: Tuple[int, int, int]) -> int:
        cached = color_to_index.get(color)
        if cached is not None:
            return cached
        if color in palette_rgb:
            idx = palette_rgb.index(color)
        else:
            idx = _nearest_color_index(color, palette_rgb)
        color_to_index[color] = idx
        return idx

    pixels: List[List[int]] = []
    it = iter(rgba_pixels)
    for _y in range(height):
        row: List[int] = []
        for _x in range(width):
            r, g, b, a = next(it)
            row.append(-1 if a < ALPHA_THRESHOLD else index_for((r, g, b)))
        pixels.append(row)

    palette_hex = [f"#{r:02x}{g:02x}{b:02x}ff" for (r, g, b) in palette_rgb]

    return Sprite(
        id=sprite_id,
        width=width,
        height=height,
        palette=palette_hex,
        frames=[Frame(name="frame_0", pixels=pixels)],
    )
