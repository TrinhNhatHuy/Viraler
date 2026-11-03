"""Pexels stock search (https://www.pexels.com/api/documentation/).

Results are linked, not copied: the CDN hosts send CORS headers, so the browser
can draw and export them. Only items on those hosts are returned.
"""

import re
import threading
import time
from typing import Any, Literal
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx

from app.models import STOCK_PAGE_SIZE, StockItem, StockSearchOutput

API = "https://api.pexels.com"
CACHE_TTL_S = 3600
CACHE_MAX = 256

# Mirrors isAllowedExternalUrl in packages/shared/src/storage-paths.ts.
_ALLOWED_URL = re.compile(r"^https://(?:images|videos)\.pexels\.com/[^\s\\]*$")

Kind = Literal["video", "image"]


def is_allowed_url(url: str) -> bool:
    return len(url) <= 2048 and bool(_ALLOWED_URL.match(url))


class PexelsAuthError(Exception):
    pass


class PexelsRateLimitError(Exception):
    pass


def pick_video_file(files: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Smallest MP4 whose long side is at least 1920 (Full HD), else the largest one."""
    usable = [
        f
        for f in files
        if f.get("file_type") == "video/mp4"
        and f.get("width")
        and f.get("height")
        and is_allowed_url(str(f.get("link", "")))
    ]
    if not usable:
        return None
    area = lambda f: f["width"] * f["height"]  # noqa: E731
    full_hd = [f for f in usable if max(f["width"], f["height"]) >= 1920]
    return min(full_hd, key=area) if full_hd else max(usable, key=area)


def _with_query(url: str, params: dict[str, str]) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(query=urlencode(params)))


def _video_item(v: dict[str, Any]) -> StockItem | None:
    file = pick_video_file(v.get("video_files") or [])
    thumb = str(v.get("image") or "")
    if file is None or not is_allowed_url(thumb):
        return None
    user = v.get("user") or {}
    return StockItem(
        provider="pexels",
        provider_id=str(v["id"]),
        kind="video",
        url=file["link"],
        thumbnail_url=thumb,
        width=file["width"],
        height=file["height"],
        duration_ms=int(v.get("duration") or 0) * 1000 or None,
        page_url=str(v.get("url") or ""),
        author=str(user.get("name") or ""),
        author_url=str(user.get("url") or ""),
    )


def _photo_item(p: dict[str, Any]) -> StockItem | None:
    src = p.get("src") or {}
    original = str(src.get("original") or "")
    thumb = str(src.get("medium") or "")
    if not is_allowed_url(original) or not is_allowed_url(thumb):
        return None
    width, height = int(p["width"]), int(p["height"])
    # Pexels resizes on the fly: 1920 px tall is enough for the 1080×1920 canvas.
    scale = min(1.0, 1920 / height)
    return StockItem(
        provider="pexels",
        provider_id=str(p["id"]),
        kind="image",
        url=_with_query(original, {"auto": "compress", "cs": "tinysrgb", "h": "1920"}),
        thumbnail_url=thumb,
        width=max(1, round(width * scale)),
        height=max(1, round(height * scale)),
        page_url=str(p.get("url") or ""),
        author=str(p.get("photographer") or ""),
        author_url=str(p.get("photographer_url") or ""),
    )


class PexelsClient:
    def __init__(
        self,
        api_key: str,
        *,
        client: httpx.Client | None = None,
        clock: Any = time.monotonic,
    ) -> None:
        self._key = api_key
        self._client = client or httpx.Client(timeout=httpx.Timeout(10))
        self._clock = clock
        self._lock = threading.Lock()
        # Pexels allows 200 requests/hour: repeat searches are served from here.
        self._cache: dict[tuple[str, str, int], tuple[float, StockSearchOutput]] = {}

    def search(self, query: str, kind: Kind, page: int = 1) -> StockSearchOutput:
        key = (kind, query.casefold(), page)
        now = self._clock()
        with self._lock:
            hit = self._cache.get(key)
            if hit and hit[0] > now:
                return hit[1]

        path = "/videos/search" if kind == "video" else "/v1/search"
        res = self._client.get(
            f"{API}{path}",
            params={
                "query": query,
                "orientation": "portrait",
                "per_page": STOCK_PAGE_SIZE,
                "page": page,
            },
            headers={"Authorization": self._key},
        )
        if res.status_code in (401, 403):
            raise PexelsAuthError("Pexels rejected the API key")
        if res.status_code == 429:
            raise PexelsRateLimitError("Pexels rate limit reached")
        res.raise_for_status()  # 5xx → retried by the runner
        body = res.json()

        raw = body.get("videos" if kind == "video" else "photos") or []
        to_item = _video_item if kind == "video" else _photo_item
        items = [item for r in raw if (item := to_item(r)) is not None]
        output = StockSearchOutput(
            items=items,
            page=int(body.get("page") or page),
            has_more=bool(body.get("next_page")),
            total_results=int(body.get("total_results") or 0),
        )

        with self._lock:
            if len(self._cache) >= CACHE_MAX:
                oldest = min(self._cache, key=lambda k: self._cache[k][0])
                del self._cache[oldest]
            self._cache[key] = (now + CACHE_TTL_S, output)
        return output
