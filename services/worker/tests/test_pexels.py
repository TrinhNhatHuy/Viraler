from typing import Any

import httpx
import pytest

from app.pexels import (
    PexelsAuthError,
    PexelsClient,
    PexelsRateLimitError,
    is_allowed_url,
    pick_video_file,
)


def vfile(w: int, h: int, link: str | None = None, file_type: str = "video/mp4") -> dict[str, Any]:
    return {
        "file_type": file_type,
        "width": w,
        "height": h,
        "link": link or f"https://videos.pexels.com/video-files/1/1-{w}x{h}.mp4",
    }


VIDEO = {
    "id": 3571264,
    "width": 1080,
    "height": 1920,
    "duration": 12,
    "url": "https://www.pexels.com/video/ocean-3571264/",
    "image": "https://images.pexels.com/videos/3571264/free-video-3571264.jpg?w=1200",
    "user": {"name": "Jane Doe", "url": "https://www.pexels.com/@jane"},
    "video_files": [vfile(720, 1280), vfile(1080, 1920), vfile(2160, 3840)],
}
PHOTO = {
    "id": 2014422,
    "width": 3000,
    "height": 4000,
    "url": "https://www.pexels.com/photo/2014422/",
    "photographer": "Joe",
    "photographer_url": "https://www.pexels.com/@joe",
    "src": {
        "original": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg",
        "medium": "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?h=350",
    },
}


class Api:
    """Fake Pexels API: records requests, answers with `status` and `body`."""

    def __init__(self, status: int = 200, body: dict[str, Any] | None = None) -> None:
        self.status = status
        self.body = body
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.body is not None:
            return httpx.Response(self.status, json=self.body)
        if request.url.path.startswith("/videos"):
            body = {"page": 1, "total_results": 40, "videos": [VIDEO], "next_page": "x"}
        else:
            body = {"page": 2, "total_results": 21, "photos": [PHOTO]}
        return httpx.Response(self.status, json=body)


def client(api: Api, clock: Any = None) -> PexelsClient:
    kwargs: dict[str, Any] = {"client": httpx.Client(transport=httpx.MockTransport(api))}
    if clock is not None:
        kwargs["clock"] = clock
    return PexelsClient("secret-key", **kwargs)


def test_video_search_request_and_mapping() -> None:
    api = Api()
    out = client(api).search("ocean waves", "video", 1)

    (req,) = api.requests
    assert req.url.host == "api.pexels.com" and req.url.path == "/videos/search"
    assert dict(req.url.params) == {
        "query": "ocean waves",
        "orientation": "portrait",
        "per_page": "20",
        "page": "1",
    }
    assert req.headers["authorization"] == "secret-key"

    assert out.has_more is True and out.total_results == 40 and out.page == 1
    (item,) = out.items
    assert item.model_dump(by_alias=True) == {
        "provider": "pexels",
        "providerId": "3571264",
        "kind": "video",
        "url": "https://videos.pexels.com/video-files/1/1-1080x1920.mp4",
        "thumbnailUrl": VIDEO["image"],
        "width": 1080,
        "height": 1920,
        "durationMs": 12000,
        "pageUrl": VIDEO["url"],
        "author": "Jane Doe",
        "authorUrl": "https://www.pexels.com/@jane",
    }


def test_photo_search_resizes_to_canvas_height() -> None:
    api = Api()
    out = client(api).search("cat", "image", 2)
    assert api.requests[0].url.path == "/v1/search"
    (item,) = out.items
    assert item.url == (
        "https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg"
        "?auto=compress&cs=tinysrgb&h=1920"
    )
    assert (item.width, item.height) == (1440, 1920)
    assert item.duration_ms is None
    assert out.has_more is False and out.page == 2


def test_pick_video_file_prefers_full_hd_then_largest() -> None:
    assert pick_video_file([vfile(720, 1280), vfile(2160, 3840), vfile(1080, 1920)]) == vfile(
        1080, 1920
    )
    # Landscape: long side counts.
    assert pick_video_file([vfile(1920, 1080), vfile(3840, 2160)]) == vfile(1920, 1080)
    assert pick_video_file([vfile(360, 640), vfile(540, 960)]) == vfile(540, 960)


def test_pick_video_file_skips_unusable_files() -> None:
    vimeo = vfile(1080, 1920, link="https://player.vimeo.com/external/1.hd.mp4")
    webm = vfile(1080, 1920, file_type="video/webm")
    no_size = {**vfile(1080, 1920), "width": None}
    assert pick_video_file([vimeo, webm, no_size]) is None


def test_items_off_the_allowed_hosts_are_dropped() -> None:
    bad_video = {**VIDEO, "video_files": [vfile(1080, 1920, link="https://evil.test/a.mp4")]}
    bad_photo = {**PHOTO, "src": {**PHOTO["src"], "original": "https://evil.test/a.jpg"}}
    api = Api(body={"page": 1, "total_results": 1, "videos": [bad_video], "photos": [bad_photo]})
    assert client(api).search("x", "video").items == []
    assert client(api).search("x", "image").items == []


def test_is_allowed_url() -> None:
    assert is_allowed_url("https://videos.pexels.com/a.mp4")
    assert not is_allowed_url("https://videos.pexels.com@evil.test/a.mp4")
    assert not is_allowed_url("http://images.pexels.com/a.jpg")


def test_repeat_searches_are_cached_for_an_hour() -> None:
    api = Api()
    now = [1000.0]
    pexels = client(api, clock=lambda: now[0])
    pexels.search("Ocean", "video", 1)
    pexels.search("ocean", "video", 1)  # case-insensitive
    assert len(api.requests) == 1
    pexels.search("ocean", "video", 2)  # other page
    pexels.search("ocean", "image", 1)  # other kind
    assert len(api.requests) == 3
    now[0] += 3601
    pexels.search("ocean", "video", 1)
    assert len(api.requests) == 4


@pytest.mark.parametrize(
    ("status", "error"),
    [(401, PexelsAuthError), (403, PexelsAuthError), (429, PexelsRateLimitError)],
)
def test_auth_and_rate_limit_errors(status: int, error: type[Exception]) -> None:
    with pytest.raises(error):
        client(Api(status=status, body={})).search("x", "video")


def test_server_errors_raise_for_retry() -> None:
    with pytest.raises(httpx.HTTPStatusError):
        client(Api(status=502, body={})).search("x", "video")
