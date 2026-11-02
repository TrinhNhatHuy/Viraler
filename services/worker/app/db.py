import psycopg
from psycopg.rows import dict_row


def connect(database_url: str) -> psycopg.Connection[dict]:
    # Autocommit: each claim/complete/fail is a single atomic statement.
    return psycopg.connect(database_url, autocommit=True, row_factory=dict_row)
