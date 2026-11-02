"""TTS job: script text → Kokoro → 16-bit WAV in Storage.

Idempotent: the object key depends only on the job id and is upserted, so a
retry after a partial run overwrites the same file.
"""

import re
from typing import Any

from app.audio import duration_ms, wav_bytes
from app.jobs.base import Handler, PermanentJobError
from app.models import ClaimedJob, TtsInput, TtsOutput
from app.storage import MEDIA_BUCKET, StorageClient, voiceover_path
from app.tts.engine import TtsEngine


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def make_tts_handler(engine: TtsEngine, storage: StorageClient) -> Handler:
    def handle(job: ClaimedJob) -> dict[str, Any]:
        params = TtsInput.model_validate(job.input)  # ValidationError → permanent failure
        if job.project_id is None:
            raise PermanentJobError("tts jobs need a project_id")
        text = normalize_text(params.text)
        if not text:
            raise PermanentJobError("text is empty")

        samples, sample_rate = engine.synthesize(text, params.voice, params.speed)
        if len(samples) == 0:
            raise RuntimeError("TTS produced no audio")

        path = voiceover_path(job.user_id, job.project_id, f"tts-{job.id}.wav")
        storage.upload(MEDIA_BUCKET, path, wav_bytes(samples, sample_rate), "audio/wav")

        output = TtsOutput(
            path=path,
            duration_ms=duration_ms(len(samples), sample_rate),
            sample_rate=sample_rate,
            voice=params.voice,
        )
        return output.model_dump(by_alias=True)

    return handle
