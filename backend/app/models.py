"""
Modelos de dados do PixelForge.

Um sprite é sempre uma matriz exata de pixels (sem upscale escondido).
Cada pixel guarda o INDICE da paleta, nunca a cor solta -- isso é o que
garante o limite de N cores (max 30 por padrão) e permite trabalhar por
coordenada (x, y) tanto no editor quanto via API para agentes.

Índice de paleta -1 (ou None) = pixel transparente.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator

MAX_PALETTE_COLORS = 30


class Frame(BaseModel):
    name: str = "frame_0"
    # matriz [y][x] -> indice da paleta ou -1 (transparente)
    pixels: List[List[int]]
    # posição do frame na grade 2D do modo Animated (0,0 = origem). Sprites
    # estáticos (kind="static") sempre têm um único frame em (0,0) e ignoram
    # isso; sprites animados usam pra montar a tira/grade e para saber pra
    # onde cada duplicação (esquerda/direita/cima/baixo) deve ir.
    grid_x: int = 0
    grid_y: int = 0


class Sprite(BaseModel):
    id: str
    width: int = Field(gt=0, le=4096)
    height: int = Field(gt=0, le=4096)
    palette: List[str] = Field(default_factory=list)  # hex "#RRGGBBAA"
    # se True (padrão), a paleta não pode passar de MAX_PALETTE_COLORS --
    # essa é a identidade do projeto (pixel art de paleta limitada). Pode ser
    # destravado por sprite (checkbox "Travar em 30 cores" no editor) pra
    # importar referências com mais cores únicas sem re-quantizar.
    palette_locked: bool = True
    frames: List[Frame]
    tags: List[str] = Field(default_factory=list)
    # "static" = sprite normal (1 frame, modo Desenho); "animated" = sprite
    # dedicado ao modo Animated (grade 2D de frames), sempre um sprite
    # separado do estático que o originou (ver /export-to-animated)
    kind: str = "static"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @model_validator(mode="after")
    def check_palette_limit(self) -> "Sprite":
        if self.palette_locked and len(self.palette) > MAX_PALETTE_COLORS:
            raise ValueError(f"Paleta excede o limite de {MAX_PALETTE_COLORS} cores")
        return self


class SpriteSummary(BaseModel):
    """Versão leve do Sprite para listagem em galeria (sem a matriz de pixels)."""

    id: str
    width: int
    height: int
    frame_count: int
    palette_size: int
    kind: str = "static"
    tags: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SpriteCreate(BaseModel):
    id: str
    width: int = Field(gt=0, le=4096)
    height: int = Field(gt=0, le=4096)
    palette: Optional[List[str]] = None
    palette_locked: bool = True


class PixelEdit(BaseModel):
    x: int
    y: int
    palette_index: int  # -1 para transparente
    frame: int = 0


class RegionEdit(BaseModel):
    x0: int
    y0: int
    x1: int
    y1: int
    palette_index: int
    frame: int = 0


class StrokeRegion(BaseModel):
    x0: int
    y0: int
    x1: int
    y1: int
    palette_index: int


class StrokeEdit(BaseModel):
    frame: int = 0
    regions: List[StrokeRegion] = Field(min_length=1, max_length=100_000)


class FramePixelsUpdate(BaseModel):
    pixels: List[List[int]]


class PaletteUpdate(BaseModel):
    palette: List[str]
    # None = mantém o palette_locked atual do sprite; só sobrescreve se vier
    # explícito (ex: checkbox "Travar em 30 cores" mudou junto com a paleta)
    locked: Optional[bool] = None


class PaletteColorDelete(BaseModel):
    index: int


class PaletteLockUpdate(BaseModel):
    locked: bool


class ExportToAnimated(BaseModel):
    new_id: str
    frame: int = 0


class FrameDuplicate(BaseModel):
    frame_index: int
    direction: str  # "left" | "right" | "up" | "down"


class FrameDuplicateResult(BaseModel):
    sprite: Sprite
    frame_index: int
    created: bool  # False = já existia um frame naquela posição da grade; só trocamos o foco


class SoundEffectCreate(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=450)
    duration_seconds: Optional[float] = Field(default=2.0, ge=0.5, le=30)
    prompt_influence: float = Field(default=0.3, ge=0, le=1)
    loop: bool = False
