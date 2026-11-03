import io
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

from app.captions import RawWord
from app.model_files import WhisperModelName, ensure_whisper_model

log = logging.getLogger(__name__)

# Whisper works on 16 kHz mono float32.
SAMPLE_RATE = 16_000


class AudioDecodeError(Exception):
    """The file isn't audio PyAV/ffmpeg can read."""


@dataclass(frozen=True)
class AsrResult:
    words: list[RawWord]
    language: str


class AsrEngine(Protocol):
    def decode(self, data: bytes) -> NDArray[np.float32]:
        """Any audio container/codec → 16 kHz mono samples. Raises AudioDecodeError."""
        ...

    def transcribe(self, samples: NDArray[np.float32]) -> AsrResult: ...


class WhisperEngine:
    """faster-whisper (CTranslate2, CPU int8) loaded lazily and once from MODELS_DIR."""

    def __init__(self, models_dir: Path, model: WhisperModelName) -> None:
        self._models_dir = models_dir
        self._model_name = model
        self._lock = threading.Lock()
        self._model = None
        self.ready = threading.Event()

    def load(self):  # -> faster_whisper.WhisperModel
        with self._lock:
            if self._model is None:
                from faster_whisper import WhisperModel  # heavy import; keep it off module load

                folder = ensure_whisper_model(self._models_dir, self._model_name)
                log.info("loading Whisper (%s)", self._model_name)
                # A local folder path skips faster-whisper's own Hugging Face download.
                self._model = WhisperModel(str(folder), device="cpu", compute_type="int8")
                self.ready.set()
                log.info("Whisper ready")
            return self._model

    def decode(self, data: bytes) -> NDArray[np.float32]:
        import av
        from faster_whisper.audio import decode_audio

        try:
            samples = decode_audio(io.BytesIO(data), sampling_rate=SAMPLE_RATE)
        except (av.FFmpegError, ValueError, IndexError) as e:
            raise AudioDecodeError(str(e)) from e
        return np.asarray(samples, dtype=np.float32)

    def transcribe(self, samples: NDArray[np.float32]) -> AsrResult:
        segments, info = self.load().transcribe(
            samples,
            language="en",
            word_timestamps=True,
            vad_filter=True,
            # Each window is decoded on its own: avoids runaway repetition loops.
            condition_on_previous_text=False,
            beam_size=5,
        )
        words = [
            RawWord(w.word, w.start, w.end)
            for segment in segments  # a lazy generator: transcription runs here
            for w in segment.words or []
        ]
        return AsrResult(words, info.language)
