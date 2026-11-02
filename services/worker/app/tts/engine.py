import logging
import threading
from pathlib import Path
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

from app.model_files import KokoroVariant, ensure_model_files

log = logging.getLogger(__name__)


class TtsEngine(Protocol):
    def synthesize(
        self, text: str, voice: str, speed: float
    ) -> tuple[NDArray[np.float32], int]: ...


def lang_for_voice(voice: str) -> str:
    """Kokoro voice ids start with a = American English, b = British English."""
    return "en-gb" if voice.startswith("b") else "en-us"


class KokoroEngine:
    """Kokoro (ONNX) loaded lazily and once; loading is safe from several threads."""

    def __init__(self, models_dir: Path, variant: KokoroVariant) -> None:
        self._models_dir = models_dir
        self._variant = variant
        self._lock = threading.Lock()
        self._kokoro = None
        self.ready = threading.Event()

    def load(self):  # -> kokoro_onnx.Kokoro
        with self._lock:
            if self._kokoro is None:
                from kokoro_onnx import Kokoro  # heavy import; keep it off module load

                model, voices = ensure_model_files(self._models_dir, self._variant)
                log.info("loading Kokoro (%s)", model.name)
                self._kokoro = Kokoro(str(model), str(voices))
                self.ready.set()
                log.info("Kokoro ready")
            return self._kokoro

    def synthesize(self, text: str, voice: str, speed: float) -> tuple[NDArray[np.float32], int]:
        samples, sample_rate = self.load().create(
            text, voice=voice, speed=speed, lang=lang_for_voice(voice)
        )
        return np.asarray(samples, dtype=np.float32), int(sample_rate)
