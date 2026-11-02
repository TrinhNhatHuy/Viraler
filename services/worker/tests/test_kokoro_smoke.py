"""Real Kokoro synthesis. Slow: run with `uv run pytest -m slow` after downloading models."""

from pathlib import Path

import pytest

from app.config import get_settings
from app.model_files import MODEL_FILES, VOICES_FILE
from app.tts.engine import KokoroEngine

pytestmark = pytest.mark.slow


@pytest.fixture(scope="module")
def engine() -> KokoroEngine:
    settings = get_settings()
    models = Path(settings.models_dir)
    if (
        not (models / MODEL_FILES[settings.kokoro_model].name).exists()
        or not (models / VOICES_FILE.name).exists()
    ):
        pytest.skip("model files not downloaded (uv run python -m app.model_files)")
    return KokoroEngine(models, settings.kokoro_model)


@pytest.mark.parametrize("voice", ["af_heart", "bm_george"])
def test_says_hello_world(engine: KokoroEngine, voice: str) -> None:
    samples, rate = engine.synthesize("Hello world. This is Viraler.", voice, 1.0)
    seconds = len(samples) / rate
    assert rate == 24_000
    assert 1.0 < seconds < 6.0
    assert 0.05 < float(abs(samples).max()) <= 1.0


def test_faster_speed_is_shorter(engine: KokoroEngine) -> None:
    text = "The quick brown fox jumps over the lazy dog."
    normal, _ = engine.synthesize(text, "af_heart", 1.0)
    fast, _ = engine.synthesize(text, "af_heart", 1.5)
    assert len(fast) < len(normal) * 0.85
