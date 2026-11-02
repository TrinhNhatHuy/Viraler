import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app.config import get_settings
from app.jobs import build_handlers
from app.runner import run_forever
from app.tts.engine import KokoroEngine

log = logging.getLogger(__name__)


def _warm_up(engine: KokoroEngine) -> None:
    """Download (first run) and load the model in the background so the first job is fast."""
    try:
        engine.load()
    except Exception:
        log.exception("Kokoro warm-up failed; TTS jobs will retry loading")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    kokoro = KokoroEngine(Path(settings.models_dir), settings.kokoro_model)
    handlers = build_handlers(settings, kokoro=kokoro)

    threading.Thread(target=_warm_up, args=(kokoro,), name="kokoro-warmup", daemon=True).start()

    stop = threading.Event()
    thread = threading.Thread(
        target=run_forever,
        args=(settings.database_url, settings.worker_poll_interval_seconds, stop, handlers),
        name="job-loop",
        daemon=True,
    )
    thread.start()
    app.state.loop_thread = thread
    app.state.kokoro = kokoro
    yield
    stop.set()
    thread.join(timeout=10)


app = FastAPI(title="Viraler worker", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, bool]:
    thread: threading.Thread | None = getattr(app.state, "loop_thread", None)
    kokoro: KokoroEngine | None = getattr(app.state, "kokoro", None)
    return {
        "ok": True,
        "loop_alive": bool(thread and thread.is_alive()),
        "models_ready": bool(kokoro and kokoro.ready.is_set()),
    }
