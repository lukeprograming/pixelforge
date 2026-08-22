from __future__ import annotations

import json
import os
import tempfile
import unittest
from io import BytesIO
from email.message import Message
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from app import elevenlabs_sfx


class FakeResponse:
    def __init__(self, body: bytes = b"ID3-test-audio") -> None:
        self.body = body
        self.headers = Message()
        self.headers["Content-Type"] = "audio/mpeg"
        self.headers["request-id"] = "req_test"
        self.headers["character-cost"] = "22"

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self, _limit: int) -> bytes:
        return self.body


class ElevenLabsSoundEffectsTests(unittest.TestCase):
    def test_generate_builds_expected_request_without_leaking_key(self) -> None:
        captured = {}

        def opener(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return FakeResponse()

        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "secret-test-key"}):
            generated = elevenlabs_sfx.generate_sound_effect(
                text="short celestial healing chime",
                duration_seconds=2.0,
                prompt_influence=0.4,
                loop=False,
                opener=opener,
            )

        request = captured["request"]
        body = json.loads(request.data)
        self.assertEqual(body["model_id"], "eleven_text_to_sound_v2")
        self.assertEqual(body["duration_seconds"], 2.0)
        self.assertEqual(body["prompt_influence"], 0.4)
        self.assertFalse(body["loop"])
        self.assertNotIn("secret-test-key", request.full_url)
        self.assertNotIn("secret-test-key", request.data.decode())
        self.assertEqual(generated.audio, b"ID3-test-audio")
        self.assertEqual(generated.request_id, "req_test")
        self.assertEqual(generated.credit_cost, "22")
        self.assertEqual(captured["timeout"], 120)

    def test_missing_key_fails_before_network(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(elevenlabs_sfx.SoundEffectError) as raised:
                elevenlabs_sfx.generate_sound_effect(
                    text="effect",
                    duration_seconds=1,
                    prompt_influence=0.3,
                    loop=False,
                    opener=lambda *_args, **_kwargs: self.fail("network must not run"),
                )
        self.assertEqual(raised.exception.status_code, 503)

    def test_upstream_auth_error_is_safe(self) -> None:
        error_body = b'{"detail":{"message":"invalid xi api key"}}'

        def opener(_request, timeout=None):
            raise HTTPError("https://api.elevenlabs.io", 401, "Unauthorized", {}, BytesIO(error_body))

        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "never-show-this"}):
            with self.assertRaises(elevenlabs_sfx.SoundEffectError) as raised:
                elevenlabs_sfx.generate_sound_effect(
                    text="effect",
                    duration_seconds=1,
                    prompt_influence=0.3,
                    loop=False,
                    opener=opener,
                )
        self.assertEqual(raised.exception.status_code, 401)
        self.assertNotIn("never-show-this", str(raised.exception))

    def test_save_uses_safe_unique_mp3_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = elevenlabs_sfx.save_sound_effect(b"audio", "../../Cura Épica!", Path(tmp))
            self.assertEqual(path.parent, Path(tmp))
            self.assertTrue(path.name.startswith("cura-epica-"))
            self.assertEqual(path.suffix, ".mp3")
            self.assertEqual(path.read_bytes(), b"audio")


if __name__ == "__main__":
    unittest.main()
