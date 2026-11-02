import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.runner import run_forever


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    stop = threading.Event()
    thread = threading.Thread(
        target=run_forever,
        args=(settings.database_url, settings.worker_poll_interval_seconds, stop),
        name="job-loop",
        daemon=True,
    )
    thread.start()
    app.state.loop_thread = thread
    yield
    stop.set()
    thread.join(timeout=10)


app = FastAPI(title="Viraler worker", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, bool]:
    thread: threading.Thread | None = getattr(app.state, "loop_thread", None)
    return {"ok": True, "loop_alive": bool(thread and thread.is_alive())}
