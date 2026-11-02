"""RLS: users only see their own rows and can't write jobs."""

import json
from contextlib import contextmanager
from typing import Any

import psycopg
import pytest
from psycopg.types.json import Jsonb


@contextmanager
def as_user(db: psycopg.Connection[Any], user_id: str):
    """Run statements as the `authenticated` role with auth.uid() = user_id, then roll back."""
    with db.transaction(force_rollback=True):
        db.execute("set local role authenticated")
        db.execute(
            "select set_config('request.jwt.claims', %s, true)",
            (json.dumps({"sub": user_id, "role": "authenticated"}),),
        )
        yield db


def insert_project(db: psycopg.Connection[Any], user_id: str) -> str:
    row = db.execute(
        "insert into public.projects (user_id, data) values (%s, %s) returning id::text",
        (user_id, Jsonb({"version": 1})),
    ).fetchone()
    assert row
    return row["id"]


def test_user_sees_only_own_projects(db, make_user) -> None:
    alice, bob = make_user(), make_user()
    alice_project = insert_project(db, alice)
    insert_project(db, bob)

    with as_user(db, alice):
        ids = [r["id"] for r in db.execute("select id::text from public.projects").fetchall()]
    assert ids == [alice_project]


def test_user_cannot_update_others_project(db, make_user) -> None:
    alice, bob = make_user(), make_user()
    bob_project = insert_project(db, bob)

    with as_user(db, alice):
        cur = db.execute("update public.projects set title = 'pwned' where id = %s", (bob_project,))
        assert cur.rowcount == 0


def test_user_cannot_insert_project_for_someone_else(db, make_user) -> None:
    alice, bob = make_user(), make_user()
    with pytest.raises(psycopg.errors.InsufficientPrivilege), as_user(db, alice):
        insert_project(db, bob)


def test_user_sees_only_own_media(db, make_user) -> None:
    alice, bob = make_user(), make_user()
    for uid in (alice, bob):
        db.execute(
            "insert into public.media (user_id, kind, origin, storage_path) "
            "values (%s, 'image', 'upload', %s)",
            (uid, f"{uid}/a.jpg"),
        )
    with as_user(db, alice):
        rows = db.execute("select user_id::text from public.media").fetchall()
    assert [r["user_id"] for r in rows] == [alice]


def test_user_can_read_own_jobs_but_not_others(db, make_user) -> None:
    alice, bob = make_user(), make_user()
    for uid in (alice, bob):
        db.execute(
            "insert into public.jobs (user_id, type, status) values (%s, 'tts', 'done')", (uid,)
        )
    with as_user(db, alice):
        rows = db.execute("select user_id::text from public.jobs").fetchall()
    assert [r["user_id"] for r in rows] == [alice]


def test_user_cannot_insert_jobs(db, make_user) -> None:
    alice = make_user()
    with pytest.raises(psycopg.errors.InsufficientPrivilege), as_user(db, alice):
        db.execute("insert into public.jobs (user_id, type) values (%s, 'tts')", (alice,))


def test_job_cannot_reference_another_users_project(db, make_user) -> None:
    alice, bob = make_user(), make_user()
    bob_project = insert_project(db, bob)
    with pytest.raises(psycopg.errors.ForeignKeyViolation), db.transaction():
        db.execute(
            "insert into public.jobs (user_id, project_id, type) values (%s, %s, 'tts')",
            (alice, bob_project),
        )
