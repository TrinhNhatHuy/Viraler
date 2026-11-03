import uuid
from typing import Any

import httpx
import numpy as np
import pytest
from pydantic import ValidationError

from app.asr.engine import SAMPLE_RATE, AsrResult, AudioDecodeError
from app.captions import RawWord
from app.jobs.base import PermanentJobError
from app.jobs.transcribe import make_transcribe_handler
from app.models import ClaimedJob, TranscribeOutput
from app.storage import ObjectTooLargeError

AUDIO = "u1/p1/voiceover/tts-1.wav"


class FakeAsr:
    """Decodes any bytes to `seconds` of silence and "hears" fixed words."""

    def __init__(self, words: list[RawWord], seconds: float = 2.0) -> None:
        self.words = words
        self.seconds = seconds
        self.decode_error = False
        self.decoded: list[bytes] = []

    def decode(self, data: bytes) -> np.ndarray:
        if self.decode_error:
            raise AudioDecodeError("Invalid data found when processing input")
        self.decoded.append(data)
        return np.zeros(round(self.seconds * SAMPLE_RATE), dtype=np.float32)

    def transcribe(self, samples: np.ndarray) -> AsrResult:
        return AsrResult(self.words, "en")


class FakeStorage:
    def __init__(self, objects: dict[str, bytes] | None = None, status: int | None = None) -> None:
        self.objects = objects if objects is not None else {f"media/{AUDIO}": b"RIFF"}
        self.status = status
        self.too_large = False
        self.uploads = 0

    def download(self, bucket: str, path: str, *, max_bytes: int | None = None) -> bytes:
        if self.too_large:
            raise ObjectTooLargeError(path)
        if self.status is not None:
            request = httpx.Request("GET", f"http://storage.test/{path}")
            response = httpx.Response(self.status, request=request)
            raise httpx.HTTPStatusError("error", request=request, response=response)
        key = f"{bucket}/{path}"
        if key not in self.objects:
            request = httpx.Request("GET", f"http://storage.test/{path}")
            response = httpx.Response(400, request=request)
            raise httpx.HTTPStatusError("not found", request=request, response=response)
        return self.objects[key]

    def upload(self, *args: Any, **kwargs: Any) -> None:
        self.uploads += 1


HEARD = [
    RawWord(" Top", 0.0, 0.25),
    RawWord(" 3", 0.25, 0.5),
    RawWord(" fastest", 0.5, 1.0),
    RawWord(" animals.", 1.0, 1.6),
]


def make_job(input_: dict[str, Any], project_id: str | None = "p1") -> ClaimedJob:
    return ClaimedJob(
        id=str(uuid.uuid4()),
        user_id="u1",
        project_id=project_id,
        type="transcribe",
        input=input_,
        attempts=1,
    )


def run(input_: dict[str, Any], asr: FakeAsr | None = None, storage: FakeStorage | None = None):
    handle = make_transcribe_handler(asr or FakeAsr(HEARD), storage or FakeStorage())  # type: ignore[arg-type]
    return handle(make_job(input_))


def test_aligns_to_the_script() -> None:
    out = run({"audioPath": AUDIO, "script": "Top three fastest animals!"})
    TranscribeOutput.model_validate(out)
    assert out["aligned"] is True
    assert out["audioPath"] == AUDIO
    assert out["durationMs"] == 2000
    assert out["language"] == "en"
    assert out["words"] == [
        {"text": "Top", "startMs": 0, "endMs": 250},
        {"text": "three", "startMs": 250, "endMs": 500},
        {"text": "fastest", "startMs": 500, "endMs": 1000},
        {"text": "animals!", "startMs": 1000, "endMs": 1600},
    ]


def test_falls_back_to_the_transcript_when_the_script_does_not_match() -> None:
    out = run({"audioPath": AUDIO, "script": "Something else entirely, said differently."})
    assert out["aligned"] is False
    assert [w["text"] for w in out["words"]] == ["Top", "3", "fastest", "animals."]


def test_without_a_script_uses_the_transcript() -> None:
    out = run({"audioPath": AUDIO})
    assert out["aligned"] is False
    assert len(out["words"]) == 4


def test_no_speech_gives_no_words() -> None:
    out = run({"audioPath": AUDIO, "script": "Hello"}, asr=FakeAsr([]))
    assert out["words"] == [] and out["aligned"] is False


def test_writes_nothing_so_retries_are_safe() -> None:
    storage = FakeStorage()
    handle = make_transcribe_handler(FakeAsr(HEARD), storage)  # type: ignore[arg-type]
    job = make_job({"audioPath": AUDIO, "script": "Top three"})
    assert handle(job) == handle(job.model_copy(update={"attempts": 2}))
    assert storage.uploads == 0


@pytest.mark.parametrize(
    "path",
    [
        "u2/p1/voiceover/tts-1.wav",  # another user
        "u1/p2/voiceover/tts-1.wav",  # another project
        "u1/p1/../p2/voiceover/tts-1.wav",
        "u1/p1",
    ],
)
def test_paths_outside_the_project_are_permanent(path: str) -> None:
    with pytest.raises(PermanentJobError, match="outside"):
        run({"audioPath": path})


def test_missing_project_is_permanent() -> None:
    handle = make_transcribe_handler(FakeAsr(HEARD), FakeStorage())  # type: ignore[arg-type]
    with pytest.raises(PermanentJobError):
        handle(make_job({"audioPath": AUDIO}, project_id=None))


@pytest.mark.parametrize("bad", [{}, {"audioPath": ""}, {"audioPath": AUDIO, "script": "x" * 5001}])
def test_invalid_input_is_a_validation_error(bad: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        run(bad)


def test_missing_file_is_permanent() -> None:
    with pytest.raises(PermanentJobError, match="not found"):
        run({"audioPath": AUDIO}, storage=FakeStorage(objects={}))


def test_storage_outage_is_retried() -> None:
    with pytest.raises(httpx.HTTPStatusError):
        run({"audioPath": AUDIO}, storage=FakeStorage(status=503))


def test_oversized_file_is_permanent() -> None:
    storage = FakeStorage()
    storage.too_large = True
    with pytest.raises(PermanentJobError, match="too large"):
        run({"audioPath": AUDIO}, storage=storage)


def test_undecodable_audio_is_permanent() -> None:
    asr = FakeAsr(HEARD)
    asr.decode_error = True
    with pytest.raises(PermanentJobError, match="Couldn't read"):
        run({"audioPath": AUDIO}, asr=asr)


@pytest.mark.parametrize(("seconds", "message"), [(0, "empty"), (11 * 60 + 1, "too long")])
def test_empty_or_too_long_audio_is_permanent(seconds: float, message: str) -> None:
    with pytest.raises(PermanentJobError, match=message):
        run({"audioPath": AUDIO}, asr=FakeAsr(HEARD, seconds=seconds))
