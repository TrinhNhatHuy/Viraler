from collections.abc import Callable
from typing import Any

from app.models import ClaimedJob

# A handler receives the claimed job and returns its `output` JSON. It must be
# idempotent: a job may be retried (max 3 attempts) after a partial run.
Handler = Callable[[ClaimedJob], dict[str, Any]]


class PermanentJobError(Exception):
    """Retrying won't help (bad input, no handler). Fail immediately."""
