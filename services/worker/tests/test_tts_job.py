import io
import uuid
import wave
from typing import Any

import numpy as np
import pytest
from pydantic import ValidationError

from app.jobs.base import PermanentJobError
from app.jobs.tts import make_tts_handler, normalize_text
from app.models import ClaimedJob


class FakeEngine:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, float]] = []

    def synthesize(self, text: str, voice: str, speed: float) -> tuple[np.ndarray, int]:
        self.calls.append((text, voice, speed))
        t = np.arange(24_000) / 24_000
        return (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32), 24_000


class FakeStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def upload(self, bucket: str, path: str, data: bytes, content_type: str, **_: Any) -> None:
        self.objects[f"{bucket}/{path}"] = (data, content_type)


def make_job(input_: dict[str, Any], project_id: str | None = "p1") -> ClaimedJob:
    return ClaimedJob(
        id=str(uuid.uuid4()),
        user_id="u1",
        project_id=project_id,
        type="tts",
        input=input_,
        attempts=1,
    )


@pytest.fixture
def setup() -> tuple[FakeEngine, FakeStorage, Any]:
    engine, storage = FakeEngine(), FakeStorage()
    return engine, storage, make_tts_handler(engine, storage)  # type: ignore[arg-type]


def test_synthesizes_uploads_and_returns_output(setup) -> None:
    engine, storage, handle = setup
    job = make_job({"text": "Hello   world.\n\nSecond line.", "voice": "bf_emma", "speed": 1.2})

    out = handle(job)

    assert engine.calls == [("Hello world. Second line.", "bf_emma", 1.2)]
    path = f"u1/p1/voiceover/tts-{job.id}.wav"
    assert out == {"path": path, "durationMs": 1000, "sampleRate": 24_000, "voice": "bf_emma"}
    data, content_type = storage.objects[f"media/{path}"]
    assert content_type == "audio/wav"
    with wave.open(io.BytesIO(data)) as w:
        assert w.getnframes() == 24_000


def test_speed_defaults_to_1(setup) -> None:
    engine, _, handle = setup
    handle(make_job({"text": "Hi", "voice": "af_heart"}))
    assert engine.calls[0][2] == 1.0


def test_retry_overwrites_the_same_object(setup) -> None:
    _, storage, handle = setup
    job = make_job({"text": "Hi", "voice": "af_heart"})
    first = handle(job)
    second = handle(job.model_copy(update={"attempts": 2}))
    assert first["path"] == second["path"]
    assert len(storage.objects) == 1


@pytest.mark.parametrize(
    "bad",
    [
        {"text": "Hi", "voice": "zz_unknown"},
        {"text": "Hi", "voice": "af_heart", "speed": 3},
        {"text": "   ", "voice": "af_heart"},
        {"text": "x" * 5001, "voice": "af_heart"},
        {"voice": "af_heart"},
        {"text": "Hi", "voice": "af_heart", "extra": 1},
    ],
)
def test_invalid_input_is_a_validation_error(setup, bad: dict[str, Any]) -> None:
    _, _, handle = setup
    with pytest.raises(ValidationError):
        handle(make_job(bad))


def test_missing_project_is_permanent(setup) -> None:
    _, _, handle = setup
    with pytest.raises(PermanentJobError):
        handle(make_job({"text": "Hi", "voice": "af_heart"}, project_id=None))


def test_normalize_text() -> None:
    assert normalize_text("  a\tb\n\nc  ") == "a b c"
