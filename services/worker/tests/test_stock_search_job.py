import uuid
from typing import Any

import pytest
from pydantic import ValidationError

from app.jobs.base import PermanentJobError
from app.jobs.stock_search import make_stock_search_handler
from app.models import ClaimedJob, StockSearchOutput
from app.pexels import PexelsAuthError, PexelsRateLimitError
from tests.test_pexels import Api, client


def make_job(input_: dict[str, Any]) -> ClaimedJob:
    return ClaimedJob(
        id=str(uuid.uuid4()),
        user_id="u1",
        project_id="p1",
        type="stock_search",
        input=input_,
        attempts=1,
    )


def test_returns_search_results() -> None:
    api = Api()
    out = make_stock_search_handler(client(api))(make_job({"query": " ocean ", "kind": "video"}))
    StockSearchOutput.model_validate(out)
    assert out["page"] == 1 and out["hasMore"] is True
    assert out["items"][0]["providerId"] == "3571264"
    assert dict(api.requests[0].url.params)["query"] == "ocean"
    # Photos have no duration: omitted rather than null, as in the Zod schema.
    photos = make_stock_search_handler(client(Api()))(make_job({"query": "cat", "kind": "image"}))
    assert "durationMs" not in photos["items"][0]


def test_missing_api_key_is_permanent() -> None:
    with pytest.raises(PermanentJobError, match="PEXELS_API_KEY"):
        make_stock_search_handler(None)(make_job({"query": "ocean", "kind": "video"}))


@pytest.mark.parametrize(
    ("error", "message"),
    [(PexelsAuthError, "rejected"), (PexelsRateLimitError, "limit")],
)
def test_pexels_errors_are_permanent(error: type[Exception], message: str) -> None:
    class Failing:
        def search(self, *args: Any) -> Any:
            raise error("x")

    with pytest.raises(PermanentJobError, match=message):
        make_stock_search_handler(Failing())(make_job({"query": "x", "kind": "image"}))  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "bad",
    [
        {"query": "", "kind": "video"},
        {"query": "x", "kind": "audio"},
        {"query": "x", "kind": "video", "page": 0},
    ],
)
def test_invalid_input(bad: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        make_stock_search_handler(client(Api()))(make_job(bad))
