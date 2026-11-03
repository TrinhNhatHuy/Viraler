import httpx
import pytest

from app.storage import ObjectTooLargeError, StorageClient, is_in_project_folder, voiceover_path


def test_voiceover_path_layout() -> None:
    assert voiceover_path("u1", "p1", "tts-j1.wav") == "u1/p1/voiceover/tts-j1.wav"


def test_upload_posts_with_service_auth_and_upsert() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"Key": "media/x"})

    client = StorageClient(
        "http://supabase.test/",
        "secret",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    client.upload("media", "u1/p1/voiceover/a b.wav", b"RIFF", "audio/wav")

    (req,) = seen
    assert req.method == "POST"
    assert str(req.url) == "http://supabase.test/storage/v1/object/media/u1/p1/voiceover/a%20b.wav"
    assert req.headers["authorization"] == "Bearer secret"
    assert req.headers["apikey"] == "secret"
    assert req.headers["x-upsert"] == "true"
    assert req.headers["content-type"] == "audio/wav"
    assert req.content == b"RIFF"


def test_upload_raises_on_http_error() -> None:
    client = StorageClient(
        "http://supabase.test",
        "secret",
        client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500))),
    )
    with pytest.raises(httpx.HTTPStatusError):
        client.upload("media", "x.wav", b"", "audio/wav")


def test_requires_credentials() -> None:
    with pytest.raises(ValueError):
        StorageClient("", "")


def _client(handler) -> StorageClient:
    return StorageClient(
        "http://supabase.test",
        "secret",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def test_download_returns_the_body() -> None:
    client = _client(lambda r: httpx.Response(200, content=b"RIFFdata"))
    assert client.download("media", "u1/p1/voiceover/a.wav") == b"RIFFdata"


def test_download_enforces_max_bytes() -> None:
    client = _client(lambda r: httpx.Response(200, content=b"x" * 100))
    assert client.download("media", "a.wav", max_bytes=100) == b"x" * 100
    with pytest.raises(ObjectTooLargeError):
        client.download("media", "a.wav", max_bytes=99)


def test_download_raises_on_missing_object() -> None:
    client = _client(lambda r: httpx.Response(400, json={"error": "not_found"}))
    with pytest.raises(httpx.HTTPStatusError):
        client.download("media", "missing.wav")


@pytest.mark.parametrize(
    ("path", "inside"),
    [
        ("u1/p1/voiceover/a.wav", True),
        ("u1/p1/a.wav", True),
        ("u1/p2/voiceover/a.wav", False),
        ("u2/p1/voiceover/a.wav", False),
        ("u1/p1/../p2/a.wav", False),
        ("u1/p1", False),
        ("u1/p10/a.wav", False),
    ],
)
def test_is_in_project_folder(path: str, inside: bool) -> None:
    assert is_in_project_folder(path, "u1", "p1") is inside
