from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException, Response

from app import main, storage
from app.models import Frame, FramePixelsUpdate, Sprite, StrokeEdit, StrokeRegion


def make_sprite() -> Sprite:
    return Sprite(
        id="paint-test",
        width=4,
        height=3,
        palette=["#000000FF", "#FFFFFFFF"],
        frames=[Frame(pixels=[[-1, -1, -1, -1] for _ in range(3)])],
    )


class PaintPerformanceTests(unittest.TestCase):
    def test_storage_writes_compact_atomic_json(self) -> None:
        sprite = make_sprite()
        with tempfile.TemporaryDirectory() as tmp, patch.object(storage, "DATA_DIR", Path(tmp)):
            storage.save(sprite)
            raw = (Path(tmp) / "paint-test.json").read_text(encoding="utf-8")
            self.assertNotIn("\n", raw)
            self.assertNotIn('  "', raw)
            self.assertEqual(storage.load("paint-test").frames[0].pixels, sprite.frames[0].pixels)
            self.assertEqual(list(Path(tmp).glob("*.tmp")), [])

    def test_stroke_applies_many_regions_with_one_save(self) -> None:
        sprite = make_sprite()
        edit = StrokeEdit(
            frame=0,
            regions=[
                StrokeRegion(x0=0, y0=0, x1=2, y1=0, palette_index=0),
                StrokeRegion(x0=3, y0=0, x1=3, y1=2, palette_index=1),
                StrokeRegion(x0=1, y0=1, x1=2, y1=2, palette_index=0),
            ],
        )
        with patch.object(main.storage, "load", return_value=sprite), patch.object(main.storage, "save") as save:
            result = main.apply_stroke(sprite.id, edit)

        save.assert_called_once_with(sprite)
        self.assertEqual(result["regions_applied"], 3)
        self.assertEqual(sprite.frames[0].pixels, [
            [0, 0, 0, 1],
            [-1, 0, 0, 1],
            [-1, 0, 0, 1],
        ])

    def test_invalid_stroke_is_rejected_before_mutation_or_save(self) -> None:
        sprite = make_sprite()
        before = [row[:] for row in sprite.frames[0].pixels]
        edit = StrokeEdit(
            frame=0,
            regions=[
                StrokeRegion(x0=0, y0=0, x1=1, y1=1, palette_index=0),
                StrokeRegion(x0=4, y0=0, x1=4, y1=0, palette_index=1),
            ],
        )
        with patch.object(main.storage, "load", return_value=sprite), patch.object(main.storage, "save") as save:
            with self.assertRaises(HTTPException) as raised:
                main.apply_stroke(sprite.id, edit)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(sprite.frames[0].pixels, before)
        save.assert_not_called()

    def test_manual_save_replaces_frame_with_one_save(self) -> None:
        sprite = make_sprite()
        pixels = [
            [0, 0, 1, -1],
            [-1, 1, 1, -1],
            [0, -1, 0, 1],
        ]
        payload = FramePixelsUpdate(pixels=pixels)
        with patch.object(main.storage, "load", return_value=sprite), patch.object(main.storage, "save") as save:
            result = main.replace_frame_pixels(sprite.id, 0, payload)

        save.assert_called_once_with(sprite)
        self.assertEqual(result["saved"], sprite.id)
        self.assertEqual(sprite.frames[0].pixels, pixels)
        self.assertIsNot(sprite.frames[0].pixels, pixels)

    def test_invalid_manual_save_does_not_mutate_or_persist(self) -> None:
        sprite = make_sprite()
        before = [row[:] for row in sprite.frames[0].pixels]
        payload = FramePixelsUpdate(pixels=[
            [0, 0, 0, 0],
            [0, 2, 0, 0],  # índice 2 não existe na paleta de duas cores
            [0, 0, 0, 0],
        ])
        with patch.object(main.storage, "load", return_value=sprite), patch.object(main.storage, "save") as save:
            with self.assertRaises(HTTPException) as raised:
                main.replace_frame_pixels(sprite.id, 0, payload)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(sprite.frames[0].pixels, before)
        save.assert_not_called()

    def test_export_disables_browser_cache(self) -> None:
        sprite = make_sprite()
        with tempfile.TemporaryDirectory() as tmp:
            exported = Path(tmp) / "paint-test.png"
            exported.write_bytes(b"png")
            with patch.object(main.storage, "load", return_value=sprite), patch.object(
                main.png_export, "export_png", return_value=exported
            ):
                response = main.export_png(sprite.id, frame=0, scale=1)

        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_gallery_metadata_disables_browser_cache(self) -> None:
        response = Response()
        with patch.object(main.storage, "list_summaries", return_value=[]):
            self.assertEqual(main.list_sprites_meta(response), [])
        self.assertEqual(response.headers["cache-control"], "no-store")


if __name__ == "__main__":
    unittest.main()
