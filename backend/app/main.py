"""
PixelForge backend.

Roda tudo em um único servidor: API em /api/* e o editor
(HTML/CSS/JS estático) na raiz. Isso deixa o deploy no VPS trivial
(um único processo uvicorn atrás de um Nginx/Caddy).

Rodar localmente:
    cd backend
    pip install -r requirements.txt --break-system-packages
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from . import png_export, storage
from .models import (
    MAX_PALETTE_COLORS,
    ExportToAnimated,
    Frame,
    FrameDuplicate,
    FrameDuplicateResult,
    PaletteColorDelete,
    PaletteLockUpdate,
    PaletteUpdate,
    PixelEdit,
    RegionEdit,
    Sprite,
    SpriteCreate,
    SpriteSummary,
)

_GRID_DIRECTIONS = {
    "left": (-1, 0),
    "right": (1, 0),
    "up": (0, -1),
    "down": (0, 1),
}

app = FastAPI(
    title="PixelForge API",
    description="API de edição de pixel art por coordenada, pensada para uso por agentes de IA. Ver /docs/AGENT_API.md.",
    version="0.1.0",
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"


# ---------------------------------------------------------------------------
# Sprites: CRUD básico
# ---------------------------------------------------------------------------


@app.get("/api/sprites")
def list_sprites() -> List[str]:
    return storage.list_ids()


@app.get("/api/sprites/meta", response_model=List[SpriteSummary])
def list_sprites_meta() -> List[SpriteSummary]:
    """Metadados leves de todos os sprites (sem a matriz de pixels), para a
    galeria do editor. Combine com GET /api/sprites/{id}/export.png pra
    thumbnail."""
    return storage.list_summaries()


@app.post("/api/sprites/import", response_model=Sprite)
async def import_sprite(id: str = Form(...), file: UploadFile = File(...)) -> Sprite:
    if storage.load(id) is not None:
        raise HTTPException(409, f"Sprite '{id}' já existe")

    data = await file.read()
    try:
        sprite = png_export.sprite_from_png(id, data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    if sprite.width > 4096 or sprite.height > 4096:
        raise HTTPException(400, "Imagem excede o limite de 4096px por lado")

    storage.save(sprite)
    return sprite


@app.post("/api/sprites/import-txt", response_model=Sprite)
async def import_sprite_txt(
    id: str = Form(...), file: UploadFile = File(...), locked: bool = Form(True)
) -> Sprite:
    if storage.load(id) is not None:
        raise HTTPException(409, f"Sprite '{id}' já existe")

    data = await file.read()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "Arquivo precisa ser texto UTF-8") from exc

    try:
        sprite = png_export.sprite_from_matrix_txt(id, text, enforce_limit=locked)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    storage.save(sprite)
    return sprite


@app.post("/api/tools/pixel-grid-check")
async def pixel_grid_check(file: UploadFile = File(...)) -> JSONResponse:
    data = await file.read()
    try:
        report = png_export.analyze_reference_image(data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return JSONResponse(report)


@app.post("/api/sprites", response_model=Sprite)
def create_sprite(payload: SpriteCreate) -> Sprite:
    if storage.load(payload.id) is not None:
        raise HTTPException(409, f"Sprite '{payload.id}' já existe")

    empty_row = [-1] * payload.width
    pixels = [list(empty_row) for _ in range(payload.height)]

    sprite = Sprite(
        id=payload.id,
        width=payload.width,
        height=payload.height,
        palette=payload.palette or [],
        palette_locked=payload.palette_locked,
        frames=[Frame(name="frame_0", pixels=pixels)],
    )
    storage.save(sprite)
    return sprite


@app.get("/api/sprites/{sprite_id}", response_model=Sprite)
def get_sprite(sprite_id: str) -> Sprite:
    sprite = storage.load(sprite_id)
    if sprite is None:
        raise HTTPException(404, "Sprite não encontrado")
    return sprite


@app.delete("/api/sprites/{sprite_id}")
def delete_sprite(sprite_id: str) -> dict:
    if not storage.delete(sprite_id):
        raise HTTPException(404, "Sprite não encontrado")
    return {"deleted": sprite_id}


# ---------------------------------------------------------------------------
# Edição por coordenada
# ---------------------------------------------------------------------------


def _get_sprite_or_404(sprite_id: str) -> Sprite:
    sprite = storage.load(sprite_id)
    if sprite is None:
        raise HTTPException(404, "Sprite não encontrado")
    return sprite


def _check_bounds(sprite: Sprite, x: int, y: int) -> None:
    if not (0 <= x < sprite.width and 0 <= y < sprite.height):
        raise HTTPException(400, f"Coordenada ({x},{y}) fora do canvas {sprite.width}x{sprite.height}")


@app.patch("/api/sprites/{sprite_id}/pixel", response_model=Sprite)
def set_pixel(sprite_id: str, edit: PixelEdit) -> Sprite:
    sprite = _get_sprite_or_404(sprite_id)
    _check_bounds(sprite, edit.x, edit.y)
    if edit.frame >= len(sprite.frames):
        raise HTTPException(400, "Frame inexistente")
    if edit.palette_index >= len(sprite.palette):
        raise HTTPException(400, "Índice de paleta inexistente")

    sprite.frames[edit.frame].pixels[edit.y][edit.x] = edit.palette_index
    storage.save(sprite)
    return sprite


@app.patch("/api/sprites/{sprite_id}/region", response_model=Sprite)
def set_region(sprite_id: str, edit: RegionEdit) -> Sprite:
    sprite = _get_sprite_or_404(sprite_id)
    _check_bounds(sprite, edit.x0, edit.y0)
    _check_bounds(sprite, edit.x1, edit.y1)
    if edit.frame >= len(sprite.frames):
        raise HTTPException(400, "Frame inexistente")

    x0, x1 = sorted((edit.x0, edit.x1))
    y0, y1 = sorted((edit.y0, edit.y1))
    pixels = sprite.frames[edit.frame].pixels
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            pixels[y][x] = edit.palette_index

    storage.save(sprite)
    return sprite


@app.post("/api/sprites/{sprite_id}/palette", response_model=Sprite)
def update_palette(sprite_id: str, payload: PaletteUpdate) -> Sprite:
    sprite = _get_sprite_or_404(sprite_id)
    locked = payload.locked if payload.locked is not None else sprite.palette_locked
    if locked and len(payload.palette) > MAX_PALETTE_COLORS:
        raise HTTPException(400, f"Paleta excede o limite de {MAX_PALETTE_COLORS} cores")
    sprite.palette = payload.palette
    sprite.palette_locked = locked
    storage.save(sprite)
    return sprite


@app.patch("/api/sprites/{sprite_id}/palette-lock", response_model=Sprite)
def set_palette_lock(sprite_id: str, payload: PaletteLockUpdate) -> Sprite:
    sprite = _get_sprite_or_404(sprite_id)
    if payload.locked and len(sprite.palette) > MAX_PALETTE_COLORS:
        raise HTTPException(
            400,
            f"Paleta atual tem {len(sprite.palette)} cores; reduza para {MAX_PALETTE_COLORS} antes de travar",
        )
    sprite.palette_locked = payload.locked
    storage.save(sprite)
    return sprite


@app.post("/api/sprites/{sprite_id}/palette/delete-color", response_model=Sprite)
def delete_palette_color(sprite_id: str, payload: PaletteColorDelete) -> Sprite:
    """Remove uma cor da paleta pelo índice e remapeia TODOS os frames: pixels
    que usavam essa cor viram transparentes, e índices maiores decrescem 1
    pra continuar apontando pra cor certa. Feito no backend (não no cliente)
    porque um sprite animated pode ter vários frames que o editor não tem
    carregados localmente ao mesmo tempo."""
    sprite = _get_sprite_or_404(sprite_id)
    if not (0 <= payload.index < len(sprite.palette)):
        raise HTTPException(400, "Índice de cor inexistente")

    del sprite.palette[payload.index]
    for frame in sprite.frames:
        for row in frame.pixels:
            for x, v in enumerate(row):
                if v == payload.index:
                    row[x] = -1
                elif v > payload.index:
                    row[x] = v - 1

    storage.save(sprite)
    return sprite


@app.get("/api/sprites/{sprite_id}/frame/{frame_index}", response_model=Frame)
def get_frame(sprite_id: str, frame_index: int) -> Frame:
    sprite = _get_sprite_or_404(sprite_id)
    if frame_index >= len(sprite.frames):
        raise HTTPException(404, "Frame inexistente")
    return sprite.frames[frame_index]


@app.post("/api/sprites/{sprite_id}/frame", response_model=Sprite)
def add_frame(sprite_id: str, name: Optional[str] = None) -> Sprite:
    sprite = _get_sprite_or_404(sprite_id)
    empty_row = [-1] * sprite.width
    pixels = [list(empty_row) for _ in range(sprite.height)]
    sprite.frames.append(Frame(name=name or f"frame_{len(sprite.frames)}", pixels=pixels))
    storage.save(sprite)
    return sprite


@app.post("/api/sprites/{sprite_id}/export-to-animated", response_model=Sprite)
def export_to_animated(sprite_id: str, payload: ExportToAnimated) -> Sprite:
    """Cria um sprite NOVO e separado (kind="animated"), copiando o frame
    indicado do sprite de origem como o primeiro frame (posição 0,0) da
    grade. O sprite de origem não é alterado."""
    source = _get_sprite_or_404(sprite_id)
    if storage.load(payload.new_id) is not None:
        raise HTTPException(409, f"Sprite '{payload.new_id}' já existe")
    if payload.frame >= len(source.frames):
        raise HTTPException(400, "Frame inexistente")

    pixels = [list(row) for row in source.frames[payload.frame].pixels]
    new_sprite = Sprite(
        id=payload.new_id,
        width=source.width,
        height=source.height,
        palette=list(source.palette),
        kind="animated",
        frames=[Frame(name="frame_0", pixels=pixels, grid_x=0, grid_y=0)],
    )
    storage.save(new_sprite)
    return new_sprite


@app.post("/api/sprites/{sprite_id}/frame/duplicate", response_model=FrameDuplicateResult)
def duplicate_frame(sprite_id: str, payload: FrameDuplicate) -> FrameDuplicateResult:
    """Duplica um frame pra a célula vizinha (esquerda/direita/cima/baixo) na
    grade 2D do modo Animated. Se já existir um frame naquela célula, não
    cria nada -- só devolve o índice do frame existente pro cliente trocar o
    foco pra ele."""
    sprite = _get_sprite_or_404(sprite_id)
    if payload.frame_index < 0 or payload.frame_index >= len(sprite.frames):
        raise HTTPException(400, "Frame inexistente")
    if payload.direction not in _GRID_DIRECTIONS:
        raise HTTPException(400, "Direção inválida (use left, right, up ou down)")

    src = sprite.frames[payload.frame_index]
    dx, dy = _GRID_DIRECTIONS[payload.direction]
    target_x, target_y = src.grid_x + dx, src.grid_y + dy

    for i, f in enumerate(sprite.frames):
        if f.grid_x == target_x and f.grid_y == target_y:
            return FrameDuplicateResult(sprite=sprite, frame_index=i, created=False)

    new_frame = Frame(
        name=f"frame_{len(sprite.frames)}",
        pixels=[list(row) for row in src.pixels],
        grid_x=target_x,
        grid_y=target_y,
    )
    sprite.frames.append(new_frame)
    storage.save(sprite)
    return FrameDuplicateResult(sprite=sprite, frame_index=len(sprite.frames) - 1, created=True)


# ---------------------------------------------------------------------------
# Export e análise
# ---------------------------------------------------------------------------


@app.get("/api/sprites/{sprite_id}/export.png")
def export_png(sprite_id: str, frame: int = 0, scale: int = 1):
    sprite = _get_sprite_or_404(sprite_id)
    if frame >= len(sprite.frames):
        raise HTTPException(400, "Frame inexistente")
    if scale < 1 or scale > 32:
        raise HTTPException(400, "scale deve estar entre 1 e 32")

    path = png_export.export_png(sprite, frame_index=frame, scale=scale)
    return FileResponse(path, media_type="image/png", filename=path.name)


@app.get("/api/sprites/{sprite_id}/analyze")
def analyze_sprite(sprite_id: str, frame: int = 0) -> JSONResponse:
    sprite = _get_sprite_or_404(sprite_id)
    if frame >= len(sprite.frames):
        raise HTTPException(400, "Frame inexistente")
    return JSONResponse(png_export.analyze_frame(sprite, frame_index=frame))


@app.get("/api/sprites/{sprite_id}/matrix")
def get_sprite_matrix(sprite_id: str, frame: int = 0) -> JSONResponse:
    sprite = _get_sprite_or_404(sprite_id)
    if frame >= len(sprite.frames):
        raise HTTPException(400, "Frame inexistente")
    return JSONResponse(
        {
            "sprite_id": sprite.id,
            "frame": frame,
            "width": sprite.width,
            "height": sprite.height,
            "matrix": png_export.frame_to_matrix(sprite, frame_index=frame),
        }
    )


@app.get("/api/sprites/{sprite_id}/export.txt")
def export_matrix_txt(sprite_id: str, frame: int = 0) -> PlainTextResponse:
    sprite = _get_sprite_or_404(sprite_id)
    if frame >= len(sprite.frames):
        raise HTTPException(400, "Frame inexistente")
    matrix = png_export.frame_to_matrix(sprite, frame_index=frame)
    text = "\n".join(",".join(str(cell) for cell in row) for row in matrix)
    filename = f"{sprite.id}_frame{frame}_matrix.txt"
    return PlainTextResponse(text, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---------------------------------------------------------------------------
# Frontend estático (editor)
# ---------------------------------------------------------------------------

app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
