"""Stock search job: query Pexels and return results (nothing is downloaded)."""

from typing import Any

from app.jobs.base import Handler, PermanentJobError
from app.models import ClaimedJob, StockSearchInput
from app.pexels import PexelsAuthError, PexelsClient, PexelsRateLimitError


def make_stock_search_handler(pexels: PexelsClient | None) -> Handler:
    def handle(job: ClaimedJob) -> dict[str, Any]:
        params = StockSearchInput.model_validate(job.input)  # ValidationError → permanent
        if pexels is None:
            raise PermanentJobError("Stock search isn't set up (PEXELS_API_KEY is missing).")
        try:
            output = pexels.search(params.query, params.kind, params.page)
        except PexelsAuthError as e:
            raise PermanentJobError(
                "Stock search isn't working: the Pexels API key was rejected."
            ) from e
        except PexelsRateLimitError as e:
            raise PermanentJobError("Stock search limit reached. Try again in a while.") from e
        return output.model_dump(by_alias=True, exclude_none=True)

    return handle
