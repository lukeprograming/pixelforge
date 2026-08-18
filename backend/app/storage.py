"""
Armazenamento simples baseado em arquivos JSON, um por sprite.
Suficiente para o estudo local / VPS pequeno. Trocar por um banco
de verdade depois é só trocar esta camada, a API não muda.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from .models import Sprite, SpriteSummary

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "sprites"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _path_for(sprite_id: str) -> Path:
    safe_id = "".join(c for c in sprite_id if c.isalnum() or c in ("-", "_"))
    if not safe_id:
        raise ValueError("id de sprite inválido")
    return DATA_DIR / f"{safe_id}.json"


def save(sprite: Sprite) -> None:
    sprite.updated_at = datetime.utcnow()
    path = _path_for(sprite.id)
    path.write_text(sprite.model_dump_json(indent=2), encoding="utf-8")


def load(sprite_id: str) -> Optional[Sprite]:
    path = _path_for(sprite_id)
    if not path.exists():
        return None
    return Sprite.model_validate_json(path.read_text(encoding="utf-8"))


def delete(sprite_id: str) -> bool:
    path = _path_for(sprite_id)
    if not path.exists():
        return False
    path.unlink()
    return True


def list_ids() -> List[str]:
    return sorted(p.stem for p in DATA_DIR.glob("*.json"))


def list_summaries() -> List[SpriteSummary]:
    """Lista todos os sprites com metadados leves (sem a matriz de pixels),
    ordenados do mais recentemente atualizado pro mais antigo -- uso da
    galeria do editor."""
    summaries = []
    for sprite_id in list_ids():
        sprite = load(sprite_id)
        if sprite is None:
            continue
        summaries.append(
            SpriteSummary(
                id=sprite.id,
                width=sprite.width,
                height=sprite.height,
                frame_count=len(sprite.frames),
                palette_size=len(sprite.palette),
                tags=sprite.tags,
                created_at=sprite.created_at,
                updated_at=sprite.updated_at,
            )
        )
    summaries.sort(key=lambda s: s.updated_at, reverse=True)
    return summaries
