"""Transcribe job: voiceover in Storage → Whisper word timestamps → caption words.

Writes nothing (the words go into the job's output), so retries are safe.
"""

from typing import Any

import httpx

from app.asr.engine import SAMPLE_RATE, AsrEngine, AudioDecodeError
from app.captions import align_to_script, clean_words, ensure_min_duration, script_tokens
from app.jobs.base import Handler, PermanentJobError
from app.models import (
    MAX_AUDIO_DURATION_MS,
    CaptionWord,
    ClaimedJob,
    TranscribeInput,
    TranscribeOutput,
)
from app.storage import MEDIA_BUCKET, ObjectTooLargeError, StorageClient, is_in_project_folder

# A WAV from TTS at slow speed is bigger/longer than the browser upload limits allow.
MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
MAX_DURATION_MS = MAX_AUDIO_DURATION_MS + 60_000


def make_transcribe_handler(engine: AsrEngine, storage: StorageClient) -> Handler:
    def handle(job: ClaimedJob) -> dict[str, Any]:
        params = TranscribeInput.model_validate(job.input)  # ValidationError → permanent failure
        if job.project_id is None:
            raise PermanentJobError("transcribe jobs need a project_id")
        # The web API checks this too; the worker reads with the service role, so check again.
        if not is_in_project_folder(params.audio_path, job.user_id, job.project_id):
            raise PermanentJobError("audioPath is outside the project's folder")

        try:
            data = storage.download(MEDIA_BUCKET, params.audio_path, max_bytes=MAX_DOWNLOAD_BYTES)
        except httpx.HTTPStatusError as e:
            # Supabase Storage answers 400 or 404 for a missing object.
            if e.response.status_code in (400, 404):
                raise PermanentJobError("The voiceover file was not found.") from e
            raise
        except ObjectTooLargeError as e:
            raise PermanentJobError("The voiceover file is too large.") from e

        try:
            samples = engine.decode(data)
        except AudioDecodeError as e:
            raise PermanentJobError("Couldn't read the voiceover audio.") from e
        duration_ms = round(len(samples) * 1000 / SAMPLE_RATE)
        if duration_ms == 0:
            raise PermanentJobError("The voiceover is empty.")
        if duration_ms > MAX_DURATION_MS:
            raise PermanentJobError("The voiceover is too long to caption.")

        result = engine.transcribe(samples)
        words = ensure_min_duration(clean_words(result.words, duration_ms), duration_ms)
        tokens = script_tokens(params.script)
        aligned = align_to_script(tokens, words, duration_ms) if tokens else None
        if aligned is not None:
            aligned = ensure_min_duration(aligned, duration_ms)

        output = TranscribeOutput(
            audio_path=params.audio_path,
            words=[
                CaptionWord(text=w.text, start_ms=w.start_ms, end_ms=w.end_ms)
                for w in (aligned if aligned is not None else words)
            ],
            language=result.language,
            aligned=aligned is not None,
            duration_ms=duration_ms,
        )
        return output.model_dump(by_alias=True)

    return handle
