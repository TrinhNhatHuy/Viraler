"""Job handler registry. One module per job type (tts.py, transcribe.py, ...)."""

from pathlib import Path

from app.asr.engine import WhisperEngine
from app.config import Settings
from app.jobs.base import Handler, PermanentJobError
from app.tts.engine import KokoroEngine

__all__ = ["Handler", "PermanentJobError", "Handlers", "build_handlers"]

Handlers = dict[str, Handler]


def build_handlers(
    settings: Settings,
    *,
    kokoro: KokoroEngine | None = None,
    whisper: WhisperEngine | None = None,
) -> Handlers:
    from app.jobs.transcribe import make_transcribe_handler
    from app.jobs.tts import make_tts_handler
    from app.storage import StorageClient

    storage = StorageClient(settings.supabase_url, settings.supabase_service_role_key)
    models_dir = Path(settings.models_dir)
    tts_engine = kokoro or KokoroEngine(models_dir, settings.kokoro_model)
    asr_engine = whisper or WhisperEngine(models_dir, settings.whisper_model)
    return {
        "tts": make_tts_handler(tts_engine, storage),
        "transcribe": make_transcribe_handler(asr_engine, storage),
    }
