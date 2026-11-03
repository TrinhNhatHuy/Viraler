"""Transcribe job end to end through the real queue + Storage. Decoding is real
(PyAV, no model needed); the transcription itself is faked."""

from pathlib import Path
from typing import Any

import numpy as np
import psycopg
import pytest
from psycopg.types.json import Jsonb

from app.asr.engine import SAMPLE_RATE, AsrResult, WhisperEngine
from app.audio import wav_bytes
from app.captions import RawWord
from app.config import get_settings
from app.jobs.transcribe import make_transcribe_handler
from app.runner import run_once
from app.storage import MEDIA_BUCKET, StorageClient, voiceover_path


class DecodeOnlyEngine(WhisperEngine):
    def __init__(self) -> None:
        super().__init__(Path("unused"), "small.en")
        self.seen_samples = 0

    def transcribe(self, samples: np.ndarray) -> AsrResult:
        self.seen_samples = len(samples)
        return AsrResult([RawWord(" Hello", 0.1, 0.5), RawWord(" there.", 0.5, 1.2)], "en")


@pytest.fixture
def storage() -> StorageClient:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        pytest.skip("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    return StorageClient(settings.supabase_url, settings.supabase_service_role_key)


def _queue(db: psycopg.Connection[Any], uid: str, pid: str, input_: dict[str, Any]) -> str:
    return db.execute(
        "insert into public.jobs (user_id, project_id, type, input) "
        "values (%s, %s, 'transcribe', %s) returning id::text",
        (uid, pid, Jsonb(input_)),
    ).fetchone()["id"]


def test_transcribe_job_reads_the_voiceover_and_completes(
    db: psycopg.Connection[Any], make_user, storage: StorageClient
) -> None:
    uid = make_user()
    pid = db.execute(
        "insert into public.projects (user_id, data) values (%s, '{}') returning id::text", (uid,)
    ).fetchone()["id"]
    # 1.5 s of 24 kHz audio, as the TTS job writes it; decoding resamples to 16 kHz.
    t = np.arange(36_000) / 24_000
    path = voiceover_path(uid, pid, "tts-test.wav")
    storage.upload(
        MEDIA_BUCKET, path, wav_bytes((0.2 * np.sin(2 * np.pi * 220 * t)), 24_000), "audio/wav"
    )

    engine = DecodeOnlyEngine()
    job_id = _queue(db, uid, pid, {"audioPath": path, "script": "Hello there!"})
    assert run_once(db, {"transcribe": make_transcribe_handler(engine, storage)})

    job = db.execute(
        "select status, output, error from public.jobs where id = %s", (job_id,)
    ).fetchone()
    assert job["status"] == "done", job["error"]
    assert abs(engine.seen_samples - int(1.5 * SAMPLE_RATE)) < 200
    assert job["output"] == {
        "audioPath": path,
        "words": [
            {"text": "Hello", "startMs": 100, "endMs": 500},
            {"text": "there!", "startMs": 500, "endMs": 1200},
        ],
        "language": "en",
        "aligned": True,
        "durationMs": 1500,
    }


def test_missing_or_undecodable_audio_fails_without_retry(
    db: psycopg.Connection[Any], make_user, storage: StorageClient
) -> None:
    uid = make_user()
    pid = db.execute(
        "insert into public.projects (user_id, data) values (%s, '{}') returning id::text", (uid,)
    ).fetchone()["id"]
    garbage = voiceover_path(uid, pid, "uploaded-garbage.mp3")
    storage.upload(MEDIA_BUCKET, garbage, b"definitely not audio" * 100, "audio/mpeg")
    handlers = {"transcribe": make_transcribe_handler(DecodeOnlyEngine(), storage)}

    for path, message in [
        (voiceover_path(uid, pid, "missing.wav"), "not found"),
        (garbage, "Couldn't read"),
    ]:
        job_id = _queue(db, uid, pid, {"audioPath": path})
        assert run_once(db, handlers)
        job = db.execute(
            "select status, attempts, error from public.jobs where id = %s", (job_id,)
        ).fetchone()
        assert (job["status"], job["attempts"]) == ("failed", 1)
        assert message in job["error"]
