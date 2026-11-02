from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from app.db import connect
from app.models import ClaimedJob
from app.runner import PermanentJobError, claim_job, run_once


def insert_job(db: psycopg.Connection[Any], user_id: str, type_: str = "tts") -> str:
    row = db.execute(
        "insert into public.jobs (user_id, type, input) values (%s, %s, %s) returning id::text",
        (user_id, type_, Jsonb({"text": "hi", "voice": "af_heart"})),
    ).fetchone()
    assert row
    return row["id"]


def get_job(db: psycopg.Connection[Any], job_id: str) -> dict[str, Any]:
    row = db.execute("select * from public.jobs where id = %s", (job_id,)).fetchone()
    assert row
    return row


def test_claim_empty_queue_returns_none(db, make_user) -> None:
    assert claim_job(db) is None


def test_claim_marks_running_oldest_first(db, make_user) -> None:
    uid = make_user()
    first = insert_job(db, uid)
    insert_job(db, uid)

    job = claim_job(db)
    assert job is not None and job.id == first
    row = get_job(db, first)
    assert row["status"] == "running"
    assert row["attempts"] == 1
    assert row["locked_at"] is not None


def test_concurrent_claims_never_return_same_job(db, make_user, database_url) -> None:
    uid = make_user()
    a_id = insert_job(db, uid)
    b_id = insert_job(db, uid)

    other = connect(database_url)
    try:
        # Worker A claims inside an open transaction, so its row lock is held.
        with other.transaction():
            a = claim_job(other)
            b = claim_job(db)  # worker B must skip A's locked row
            assert a is not None and b is not None
            assert {a.id, b.id} == {a_id, b_id}
            assert claim_job(db) is None
    finally:
        other.close()


def test_success_marks_done_with_output(db, make_user) -> None:
    uid = make_user()
    job_id = insert_job(db, uid)

    assert run_once(db, {"tts": lambda job: {"src": f"{job.user_id}/out.wav"}})
    row = get_job(db, job_id)
    assert row["status"] == "done"
    assert row["output"] == {"src": f"{uid}/out.wav"}
    assert row["error"] is None


def test_retryable_error_requeues_then_fails_after_3_attempts(db, make_user) -> None:
    uid = make_user()
    job_id = insert_job(db, uid)

    def boom(job: ClaimedJob) -> dict[str, Any]:
        raise RuntimeError("model crashed")

    for attempt in (1, 2):
        assert run_once(db, {"tts": boom})
        row = get_job(db, job_id)
        assert (row["status"], row["attempts"]) == ("queued", attempt)

    assert run_once(db, {"tts": boom})
    row = get_job(db, job_id)
    assert (row["status"], row["attempts"]) == ("failed", 3)
    assert "model crashed" in row["error"]
    assert claim_job(db) is None


def test_permanent_error_fails_immediately(db, make_user) -> None:
    uid = make_user()
    job_id = insert_job(db, uid)

    def bad_input(job: ClaimedJob) -> dict[str, Any]:
        raise PermanentJobError("bad input")

    run_once(db, {"tts": bad_input})
    row = get_job(db, job_id)
    assert (row["status"], row["attempts"]) == ("failed", 1)


def test_unknown_handler_fails_immediately(db, make_user) -> None:
    uid = make_user()
    job_id = insert_job(db, uid, "render")

    run_once(db, {})
    row = get_job(db, job_id)
    assert row["status"] == "failed"
    assert "no handler" in row["error"]
