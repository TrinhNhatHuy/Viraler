"""Job loop: claim with FOR UPDATE SKIP LOCKED, run handler, record result."""

import logging
import threading
from typing import Any

import psycopg
from psycopg.types.json import Jsonb
from pydantic import ValidationError

from app.db import connect
from app.jobs.base import Handler, PermanentJobError
from app.models import MAX_JOB_ATTEMPTS, ClaimedJob

__all__ = ["PermanentJobError", "claim_job", "complete_job", "fail_job", "run_once", "run_forever"]

log = logging.getLogger(__name__)


CLAIM_SQL = """
update public.jobs
set status = 'running', attempts = attempts + 1, locked_at = now(), error = null
where id = (
    select id from public.jobs
    where status = 'queued' and attempts < %(max_attempts)s
    order by created_at
    for update skip locked
    limit 1
)
returning id::text, user_id::text, project_id::text, type, input, attempts
"""

COMPLETE_SQL = """
update public.jobs
set status = 'done', output = %(output)s, error = null, locked_at = null
where id = %(id)s and status = 'running'
"""

# Requeue if attempts remain (and the error is retryable), else mark failed.
FAIL_SQL = """
update public.jobs
set status = case when %(retry)s and attempts < %(max_attempts)s then 'queued' else 'failed' end,
    error = %(error)s,
    locked_at = null
where id = %(id)s and status = 'running'
returning status
"""


def claim_job(conn: psycopg.Connection[Any]) -> ClaimedJob | None:
    row = conn.execute(CLAIM_SQL, {"max_attempts": MAX_JOB_ATTEMPTS}).fetchone()
    return ClaimedJob.model_validate(row) if row else None


def complete_job(conn: psycopg.Connection[Any], job_id: str, output: dict[str, Any]) -> None:
    conn.execute(COMPLETE_SQL, {"id": job_id, "output": Jsonb(output)})


def fail_job(conn: psycopg.Connection[Any], job_id: str, error: str, *, retry: bool) -> str | None:
    """Returns the new status ('queued' or 'failed'), or None if the job wasn't running."""
    row = conn.execute(
        FAIL_SQL,
        {"id": job_id, "error": error[:2000], "retry": retry, "max_attempts": MAX_JOB_ATTEMPTS},
    ).fetchone()
    return row["status"] if row else None


def process_job(
    conn: psycopg.Connection[Any], job: ClaimedJob, handlers: dict[str, Handler]
) -> None:
    handler = handlers.get(job.type)
    try:
        if handler is None:
            raise PermanentJobError(f"no handler for job type '{job.type}'")
        output = handler(job)
    except (PermanentJobError, ValidationError) as e:
        log.warning("job %s (%s) failed permanently: %s", job.id, job.type, e)
        fail_job(conn, job.id, str(e), retry=False)
    except Exception as e:
        log.exception("job %s (%s) attempt %d failed", job.id, job.type, job.attempts)
        fail_job(conn, job.id, f"{type(e).__name__}: {e}", retry=True)
    else:
        complete_job(conn, job.id, output)
        log.info("job %s (%s) done", job.id, job.type)


def run_once(conn: psycopg.Connection[Any], handlers: dict[str, Handler]) -> bool:
    """Claim and process one job. Returns False if the queue was empty."""
    job = claim_job(conn)
    if job is None:
        return False
    process_job(conn, job, handlers)
    return True


def run_forever(
    database_url: str,
    poll_interval: float,
    stop: threading.Event,
    handlers: dict[str, Handler],
) -> None:
    log.info("worker loop started (poll every %.1fs)", poll_interval)
    conn: psycopg.Connection[Any] | None = None
    backoff = poll_interval
    while not stop.is_set():
        try:
            if conn is None or conn.closed:
                conn = connect(database_url)
                log.info("connected to database")
                backoff = poll_interval
            if run_once(conn, handlers):
                continue  # drain the queue without sleeping
            stop.wait(poll_interval)
        except psycopg.OperationalError as e:
            log.error("database unavailable: %s (retrying in %.0fs)", e, backoff)
            if conn is not None:
                conn.close()
            conn = None
            stop.wait(backoff)
            backoff = min(backoff * 2, 30)
    if conn is not None:
        conn.close()
    log.info("worker loop stopped")
