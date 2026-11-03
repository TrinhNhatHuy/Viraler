"""Job handler registry. One module per job type (tts.py, transcribe.py, ...)."""

from pathlib import Path

from app.asr.engine import WhisperEngine
from app.config import Settings
from app.jobs.base import Handler, PermanentJobError
from app.tts.engine import KokoroEngine

__all__ = [
    "HEAVY_JOB_TYPES",
    "LIGHT_JOB_TYPES",
    "Handler",
    "Handlers",
    "PermanentJobError",
    "build_handlers",
]

Handlers = dict[str, Handler]

# The worker runs one loop per group, so a quick search never waits behind a long
# transcription. Mirrors HEAVY_JOB_TYPES in packages/shared/src/job.ts.
HEAVY_JOB_TYPES = ("tts", "transcribe", "image", "render")
LIGHT_JOB_TYPES = ("stock_search",)


def build_handlers(
    settings: Settings,
    *,
    kokoro: KokoroEngine | None = None,
    whisper: WhisperEngine | None = None,
) -> Handlers:
    from app.jobs.stock_search import make_stock_search_handler
    from app.jobs.transcribe import make_transcribe_handler
    from app.jobs.tts import make_tts_handler
    from app.pexels import PexelsClient
    from app.storage import StorageClient

    storage = StorageClient(settings.supabase_url, settings.supabase_service_role_key)
    models_dir = Path(settings.models_dir)
    tts_engine = kokoro or KokoroEngine(models_dir, settings.kokoro_model)
    asr_engine = whisper or WhisperEngine(models_dir, settings.whisper_model)
    pexels = PexelsClient(settings.pexels_api_key) if settings.pexels_api_key else None
    return {
        "tts": make_tts_handler(tts_engine, storage),
        "transcribe": make_transcribe_handler(asr_engine, storage),
        "stock_search": make_stock_search_handler(pexels),
    }
