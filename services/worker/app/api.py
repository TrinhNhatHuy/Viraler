import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app.asr.engine import WhisperEngine
from app.config import get_settings
from app.jobs import HEAVY_JOB_TYPES, LIGHT_JOB_TYPES, build_handlers
from app.runner import run_forever
from app.tts.engine import KokoroEngine

log = logging.getLogger(__name__)


def _warm_up(kokoro: KokoroEngine, whisper: WhisperEngine) -> None:
    """Download (first run) and load the models in the background so the first jobs are fast.
    One after the other, to keep first-run downloads and peak memory down."""
    for name, engine in (("Kokoro", kokoro), ("Whisper", whisper)):
        try:
            engine.load()
        except Exception:
            log.exception("%s warm-up failed; its jobs will retry loading", name)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    models_dir = Path(settings.models_dir)
    kokoro = KokoroEngine(models_dir, settings.kokoro_model)
    whisper = WhisperEngine(models_dir, settings.whisper_model)
    handlers = build_handlers(settings, kokoro=kokoro, whisper=whisper)

    threading.Thread(
        target=_warm_up, args=(kokoro, whisper), name="model-warmup", daemon=True
    ).start()

    stop = threading.Event()
    loops = [
        threading.Thread(
            target=run_forever,
            args=(settings.database_url, settings.worker_poll_interval_seconds, stop, handlers),
            kwargs={"types": types, "name": name, "prune_every_s": prune},
            name=f"{name}-loop",
            daemon=True,
        )
        for name, types, prune in (
            ("heavy", HEAVY_JOB_TYPES, None),
            ("light", LIGHT_JOB_TYPES, 3600.0),
        )
    ]
    for thread in loops:
        thread.start()
    app.state.loops = loops
    app.state.kokoro = kokoro
    app.state.whisper = whisper
    yield
    stop.set()
    for thread in loops:
        thread.join(timeout=10)


app = FastAPI(title="Viraler worker", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, bool]:
    loops: list[threading.Thread] = getattr(app.state, "loops", [])
    kokoro: KokoroEngine | None = getattr(app.state, "kokoro", None)
    whisper: WhisperEngine | None = getattr(app.state, "whisper", None)
    tts_ready = bool(kokoro and kokoro.ready.is_set())
    asr_ready = bool(whisper and whisper.ready.is_set())
    return {
        "ok": True,
        "loop_alive": bool(loops) and all(t.is_alive() for t in loops),
        "models_ready": tts_ready and asr_ready,
        "tts_ready": tts_ready,
        "asr_ready": asr_ready,
    }
