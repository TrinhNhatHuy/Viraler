import psycopg
from psycopg.rows import dict_row

WORKER_APPLICATION_NAME = "viraler-worker"


def connect(
    database_url: str, *, application_name: str = WORKER_APPLICATION_NAME
) -> psycopg.Connection[dict]:
    # Autocommit: each claim/complete/fail is a single atomic statement.
    # application_name shows in pg_stat_activity (tests use it to spot a live worker).
    return psycopg.connect(
        database_url, autocommit=True, row_factory=dict_row, application_name=application_name
    )
