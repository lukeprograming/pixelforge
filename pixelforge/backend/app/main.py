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

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import png_export, storage
from .models import (
    Frame,
    PaletteUpdate,
    PixelEdit,
    RegionEdit,
    Sprite,
    SpriteCreate,
)

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
    sprite.palette = payload.palette
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


# ---------------------------------------------------------------------------
# Frontend estático (editor)
# ---------------------------------------------------------------------------

app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
