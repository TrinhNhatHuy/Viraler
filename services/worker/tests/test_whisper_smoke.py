"""Real Whisper on real Kokoro speech. Slow: run with `uv run pytest -m slow` after
downloading models (uv run python -m app.model_files)."""

from pathlib import Path

import numpy as np
import pytest

from app.asr.engine import WhisperEngine
from app.audio import wav_bytes
from app.captions import align_to_script, clean_words, match_key, script_tokens
from app.config import get_settings
from app.model_files import MODEL_FILES, VOICES_FILE
from app.tts.engine import KokoroEngine

pytestmark = pytest.mark.slow

SCRIPT = "Top three fastest animals on Earth. Number three: the pronghorn, at 88 km per hour."


@pytest.fixture(scope="module")
def engines() -> tuple[KokoroEngine, WhisperEngine]:
    settings = get_settings()
    models = Path(settings.models_dir)
    whisper_dir = models / "whisper" / settings.whisper_model
    if (
        not (models / MODEL_FILES[settings.kokoro_model].name).exists()
        or not (models / VOICES_FILE.name).exists()
        or not (whisper_dir / "model.bin").exists()
    ):
        pytest.skip("model files not downloaded (uv run python -m app.model_files)")
    return (
        KokoroEngine(models, settings.kokoro_model),
        WhisperEngine(models, settings.whisper_model),
    )


def test_transcribes_kokoro_speech_with_word_timing(
    engines: tuple[KokoroEngine, WhisperEngine],
) -> None:
    kokoro, whisper = engines
    samples, rate = kokoro.synthesize(SCRIPT, "af_heart", 1.0)
    # Same path as a real job: WAV bytes → PyAV decode → Whisper.
    decoded = whisper.decode(wav_bytes(samples, rate))
    duration_ms = round(len(decoded) * 1000 / 16_000)
    assert abs(duration_ms - len(samples) * 1000 / rate) < 50

    result = whisper.transcribe(decoded)
    words = clean_words(result.words, duration_ms)
    assert result.language == "en"

    tokens = script_tokens(SCRIPT)
    heard = {match_key(w.text) for w in words}
    found = sum(match_key(t) in heard for t in tokens)
    assert found / len(tokens) >= 0.8, [w.text for w in words]

    for prev, cur in zip(words, words[1:], strict=False):
        assert prev.end_ms <= cur.start_ms <= cur.end_ms <= duration_ms

    aligned = align_to_script(tokens, words, duration_ms)
    assert aligned is not None
    assert [w.text for w in aligned] == tokens
    # Speech starts near the beginning and the last word ends near the end.
    assert aligned[0].start_ms < 800
    assert aligned[-1].end_ms > duration_ms - 1500


def test_rejects_non_audio(engines: tuple[KokoroEngine, WhisperEngine]) -> None:
    from app.asr.engine import AudioDecodeError

    with pytest.raises(AudioDecodeError):
        engines[1].decode(np.zeros(10).tobytes())
