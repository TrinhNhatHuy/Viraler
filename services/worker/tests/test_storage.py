import httpx
import pytest

from app.storage import StorageClient, voiceover_path


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
