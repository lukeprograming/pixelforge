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

from pydantic import BaseModel, Field, field_validator

MAX_PALETTE_COLORS = 30


class Frame(BaseModel):
    name: str = "frame_0"
    # matriz [y][x] -> indice da paleta ou -1 (transparente)
    pixels: List[List[int]]


class Sprite(BaseModel):
    id: str
    width: int = Field(gt=0, le=256)
    height: int = Field(gt=0, le=256)
    palette: List[str] = Field(default_factory=list)  # hex "#RRGGBBAA"
    frames: List[Frame]
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("palette")
    @classmethod
    def limit_palette(cls, v: List[str]) -> List[str]:
        if len(v) > MAX_PALETTE_COLORS:
            raise ValueError(f"Paleta excede o limite de {MAX_PALETTE_COLORS} cores")
        return v


class SpriteCreate(BaseModel):
    id: str
    width: int = Field(gt=0, le=256)
    height: int = Field(gt=0, le=256)
    palette: Optional[List[str]] = None


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


class PaletteUpdate(BaseModel):
    palette: List[str]

    @field_validator("palette")
    @classmethod
    def limit_palette(cls, v: List[str]) -> List[str]:
        if len(v) > MAX_PALETTE_COLORS:
            raise ValueError(f"Paleta excede o limite de {MAX_PALETTE_COLORS} cores")
        return v
