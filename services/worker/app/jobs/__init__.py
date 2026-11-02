"""Job handler registry. One module per job type (tts.py, transcribe.py, ...)."""

from pathlib import Path

from app.config import Settings
from app.jobs.base import Handler, PermanentJobError
from app.tts.engine import KokoroEngine

__all__ = ["Handler", "PermanentJobError", "Handlers", "build_handlers"]

Handlers = dict[str, Handler]


def build_handlers(settings: Settings, *, kokoro: KokoroEngine | None = None) -> Handlers:
    from app.jobs.tts import make_tts_handler
    from app.storage import StorageClient

    storage = StorageClient(settings.supabase_url, settings.supabase_service_role_key)
    engine = kokoro or KokoroEngine(Path(settings.models_dir), settings.kokoro_model)
    return {"tts": make_tts_handler(engine, storage)}
