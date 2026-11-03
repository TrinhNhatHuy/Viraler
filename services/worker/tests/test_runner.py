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


# --- job types, wake-up and pruning (Phase 5) -------------------------------------


def test_claim_filters_by_type(db, make_user) -> None:
    uid = make_user()
    search = insert_job(db, uid, "stock_search")
    tts = insert_job(db, uid, "tts")

    heavy = claim_job(db, ("tts", "transcribe"))
    assert heavy is not None and heavy.id == tts
    assert claim_job(db, ("tts", "transcribe")) is None  # the search is left alone
    light = claim_job(db, ("stock_search",))
    assert light is not None and light.id == search


def test_queued_job_wakes_a_waiting_loop(db, make_user, database_url) -> None:
    import threading
    import time

    from app.runner import NOTIFY_CHANNEL, wait_for_jobs

    uid = make_user()
    listener = connect(database_url)
    try:
        listener.execute(f"listen {NOTIFY_CHANNEL}")
        # A job of another type doesn't wake it; ours does, long before the timeout.
        threading.Timer(0.2, lambda: insert_job(db, uid, "tts")).start()
        threading.Timer(0.4, lambda: insert_job(db, uid, "stock_search")).start()
        started = time.monotonic()
        assert wait_for_jobs(listener, 5.0, ("stock_search",)) is True
        assert 0.3 < time.monotonic() - started < 2.0
        assert wait_for_jobs(listener, 0.2, ("stock_search",)) is False
    finally:
        listener.close()


def test_prune_deletes_only_old_finished_searches(db, make_user) -> None:
    from app.runner import prune_jobs

    uid = make_user()
    old_done = insert_job(db, uid, "stock_search")
    old_tts = insert_job(db, uid, "tts")
    fresh = insert_job(db, uid, "stock_search")
    old_queued = insert_job(db, uid, "stock_search")
    db.execute(
        "update public.jobs set status = 'done' where id = any(%s)", ([old_done, old_tts, fresh],)
    )
    # updated_at is set by a trigger, so backdate it with the trigger disabled.
    db.execute("alter table public.jobs disable trigger jobs_set_updated_at")
    try:
        db.execute(
            "update public.jobs set updated_at = now() - interval '2 days' where id = any(%s)",
            ([old_done, old_tts, old_queued],),
        )
    finally:
        db.execute("alter table public.jobs enable trigger jobs_set_updated_at")

    assert prune_jobs(db) >= 1
    remaining = {
        r["id"]
        for r in db.execute(
            "select id::text from public.jobs where id = any(%s)",
            ([old_done, old_tts, fresh, old_queued],),
        ).fetchall()
    }
    assert remaining == {old_tts, fresh, old_queued}
