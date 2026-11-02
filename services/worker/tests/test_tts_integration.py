"""TTS job end to end through the real queue + Storage (fake engine, no model needed)."""

import io
import uuid
import wave
from typing import Any

import psycopg
import pytest
from psycopg.types.json import Jsonb

from app.config import get_settings
from app.jobs.tts import make_tts_handler
from app.runner import run_once
from app.storage import MEDIA_BUCKET, StorageClient
from tests.test_tts_job import FakeEngine


@pytest.fixture
def storage() -> StorageClient:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        pytest.skip("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    return StorageClient(settings.supabase_url, settings.supabase_service_role_key)


def test_tts_job_uploads_wav_and_completes(
    db: psycopg.Connection[Any], make_user, storage: StorageClient
) -> None:
    uid = make_user()
    project = db.execute(
        "insert into public.projects (user_id, data) values (%s, '{}') returning id::text", (uid,)
    ).fetchone()
    job_id = db.execute(
        "insert into public.jobs (user_id, project_id, type, input) "
        "values (%s, %s, 'tts', %s) returning id::text",
        (uid, project["id"], Jsonb({"text": "Hello there", "voice": "af_heart", "speed": 1})),
    ).fetchone()["id"]

    assert run_once(db, {"tts": make_tts_handler(FakeEngine(), storage)})

    row = db.execute("select status, output, error from public.jobs where id = %s", (job_id,))
    job = row.fetchone()
    assert job["status"] == "done", job["error"]
    path = job["output"]["path"]
    assert path == f"{uid}/{project['id']}/voiceover/tts-{job_id}.wav"
    assert job["output"]["durationMs"] == 1000

    data = storage.download(MEDIA_BUCKET, path)
    with wave.open(io.BytesIO(data)) as w:
        assert w.getframerate() == 24_000 and w.getnframes() == 24_000

    # The worker bypasses RLS; the owner's folder is what Storage RLS checks for the browser.
    assert path.split("/")[0] == uid
    _ = uuid.UUID(job_id)
