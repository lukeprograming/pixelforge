"""Integração local e server-side com o gerador de efeitos do ElevenLabs."""

from __future__ import annotations

import json
import os
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
AUDIO_EXPORT_DIR = Path(__file__).resolve().parent.parent / "data" / "audio_exports"
ELEVENLABS_ENDPOINT = "https://api.elevenlabs.io/v1/sound-generation"
DEFAULT_MODEL_ID = "eleven_text_to_sound_v2"
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"
MAX_AUDIO_BYTES = 32 * 1024 * 1024

load_dotenv(PROJECT_ROOT / ".env", override=False)


class SoundEffectError(Exception):
    """Erro seguro para devolver ao cliente sem vazar credenciais."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class GeneratedSoundEffect:
    audio: bytes
    media_type: str
    request_id: str | None
    credit_cost: str | None


def api_key_configured() -> bool:
    return bool(os.getenv("ELEVENLABS_API_KEY", "").strip())


def _safe_upstream_message(exc: HTTPError) -> str:
    try:
        payload = json.loads(exc.read(64 * 1024).decode("utf-8", errors="replace"))
        detail = payload.get("detail", payload)
        if isinstance(detail, dict):
            message = detail.get("message") or detail.get("status")
            if message:
                return str(message)
        if isinstance(detail, str):
            return detail
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        pass
    return "A ElevenLabs recusou a solicitação."


def generate_sound_effect(
    *,
    text: str,
    duration_seconds: float | None,
    prompt_influence: float,
    loop: bool,
    opener: Callable = urlopen,
) -> GeneratedSoundEffect:
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        raise SoundEffectError(
            "ElevenLabs não configurado. Adicione ELEVENLABS_API_KEY ao arquivo pixelforge/.env.",
            503,
        )

    payload: dict[str, object] = {
        "text": text,
        "model_id": DEFAULT_MODEL_ID,
        "prompt_influence": prompt_influence,
        "loop": loop,
    }
    if duration_seconds is not None:
        payload["duration_seconds"] = duration_seconds

    url = f"{ELEVENLABS_ENDPOINT}?{urlencode({'output_format': DEFAULT_OUTPUT_FORMAT})}"
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
            "xi-api-key": api_key,
            "User-Agent": "PixelForge/0.1",
        },
        method="POST",
    )

    try:
        with opener(request, timeout=120) as response:
            audio = response.read(MAX_AUDIO_BYTES + 1)
            if len(audio) > MAX_AUDIO_BYTES:
                raise SoundEffectError("O áudio retornado excedeu o limite local de 32 MB.", 502)
            if not audio:
                raise SoundEffectError("A ElevenLabs retornou um arquivo de áudio vazio.", 502)
            media_type = response.headers.get_content_type()
            if not media_type.startswith("audio/"):
                raise SoundEffectError("A ElevenLabs retornou uma resposta que não é áudio.", 502)
            return GeneratedSoundEffect(
                audio=audio,
                media_type=media_type,
                request_id=response.headers.get("request-id"),
                credit_cost=response.headers.get("character-cost"),
            )
    except HTTPError as exc:
        status = exc.code if exc.code in {400, 401, 403, 422, 429} else 502
        message = _safe_upstream_message(exc)
        if exc.code == 401:
            message = "A chave do ElevenLabs foi recusada. Confira ELEVENLABS_API_KEY no arquivo .env."
        elif exc.code == 429:
            message = "Limite ou créditos do ElevenLabs atingidos. Confira sua conta antes de tentar novamente."
        raise SoundEffectError(message, status) from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise SoundEffectError("Não foi possível conectar ao ElevenLabs. Tente novamente em instantes.", 502) from exc


def _slugify(label: str) -> str:
    normalized = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", normalized).strip("-_").lower()
    return slug[:60] or "sound-effect"


def save_sound_effect(audio: bytes, label: str, output_dir: Path = AUDIO_EXPORT_DIR) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"{_slugify(label)}-{timestamp}-{uuid4().hex[:6]}.mp3"
    path = output_dir / filename
    path.write_bytes(audio)
    return path
