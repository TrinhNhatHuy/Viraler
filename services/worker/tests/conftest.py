"""DB fixtures. DB tests run against local Supabase (`pnpm supabase start`) and
are skipped when DATABASE_URL isn't set or the DB is unreachable."""

import os
import uuid
from collections.abc import Iterator
from typing import Any

import psycopg
import pytest

from app.db import connect


def _database_url() -> str | None:
    if url := os.environ.get("DATABASE_URL"):
        return url
    try:
        from app.config import get_settings

        return get_settings().database_url
    except Exception:
        return None


@pytest.fixture(scope="session")
def database_url() -> str:
    url = _database_url()
    if not url:
        pytest.skip("DATABASE_URL not set")
    try:
        connect(url).close()
    except psycopg.OperationalError as e:
        pytest.skip(f"database unreachable: {e}")
    return url


@pytest.fixture
def db(database_url: str) -> Iterator[psycopg.Connection[Any]]:
    conn = connect(database_url)
    queued = conn.execute("select count(*) as n from public.jobs where status = 'queued'")
    if queued.fetchone()["n"]:  # type: ignore[index]
        conn.close()
        pytest.skip("jobs table has pre-existing queued jobs; tests would claim them")
    yield conn
    conn.close()


@pytest.fixture
def make_user(db: psycopg.Connection[Any]) -> Iterator[Any]:
    """Creates auth.users rows; deleting them cascades to projects/media/jobs."""
    created: list[str] = []

    def _make() -> str:
        uid = str(uuid.uuid4())
        db.execute(
            "insert into auth.users (id, aud, role, email) "
            "values (%s, 'authenticated', 'authenticated', %s)",
            (uid, f"test-{uid}@example.test"),
        )
        created.append(uid)
        return uid

    yield _make
    for uid in created:
        db.execute("delete from auth.users where id = %s", (uid,))
