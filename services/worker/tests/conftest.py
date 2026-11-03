"""DB fixtures. DB tests run against local Supabase (`pnpm supabase start`) and
are skipped when DATABASE_URL isn't set or the DB is unreachable."""

import os
import uuid
from collections.abc import Iterator
from typing import Any

import psycopg
import pytest

from app.db import WORKER_APPLICATION_NAME, connect

TEST_APPLICATION_NAME = "viraler-tests"


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
    """A connection whose writes are all rolled back after the test.

    Uncommitted rows are invisible to other connections, so a worker running
    against the same database (`uv run python -m app.main`) can't claim the
    test's jobs, and NOTIFY only fires on commit, so it isn't even woken.
    """
    conn = connect(database_url, application_name=TEST_APPLICATION_NAME)
    queued = conn.execute("select count(*) as n from public.jobs where status = 'queued'")
    if queued.fetchone()["n"]:  # type: ignore[index]
        conn.close()
        pytest.skip("jobs table has pre-existing queued jobs; tests would claim them")
    with conn.transaction(force_rollback=True):
        yield conn
    conn.close()


@pytest.fixture
def committed_db(database_url: str) -> Iterator[psycopg.Connection[Any]]:
    """An autocommit connection, for tests whose rows other connections must see."""
    conn = connect(database_url, application_name=TEST_APPLICATION_NAME)
    yield conn
    conn.close()


def live_worker_connected(conn: psycopg.Connection[Any]) -> bool:
    """A worker loop is connected: by name, or (older workers) by its claim query."""
    row = conn.execute(
        """
        select exists(
          select 1 from pg_stat_activity
          where pid <> pg_backend_pid()
            and (application_name = %(worker)s
                 or (application_name <> %(tests)s and query ilike '%%skip locked%%'))
        ) as up
        """,
        {"worker": WORKER_APPLICATION_NAME, "tests": TEST_APPLICATION_NAME},
    ).fetchone()
    return bool(row and row["up"])


def _user_factory(conn: psycopg.Connection[Any]) -> tuple[Any, list[str]]:
    created: list[str] = []

    def _make() -> str:
        uid = str(uuid.uuid4())
        conn.execute(
            "insert into auth.users (id, aud, role, email) "
            "values (%s, 'authenticated', 'authenticated', %s)",
            (uid, f"test-{uid}@example.test"),
        )
        created.append(uid)
        return uid

    return _make, created


@pytest.fixture
def make_committed_user(committed_db: psycopg.Connection[Any]) -> Iterator[Any]:
    """Committed auth.users rows (deleted afterwards, cascading to their jobs)."""
    make, created = _user_factory(committed_db)
    yield make
    for uid in created:
        committed_db.execute("delete from auth.users where id = %s", (uid,))


@pytest.fixture
def make_user(db: psycopg.Connection[Any]) -> Iterator[Any]:
    """auth.users rows inside the test's transaction (rolled back with it)."""
    make, _ = _user_factory(db)
    yield make
