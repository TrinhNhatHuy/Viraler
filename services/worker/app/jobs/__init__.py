"""Job handler registry. One module per job type (tts.py, transcribe.py, ...).

A handler receives the claimed job and returns the `output` JSON. It must be
idempotent: a job may be retried (max 3 attempts) after a partial run.
"""

from collections.abc import Callable
from typing import Any

from app.models import ClaimedJob

Handler = Callable[[ClaimedJob], dict[str, Any]]

# Filled in as job types are implemented (Phase 3+).
HANDLERS: dict[str, Handler] = {}
