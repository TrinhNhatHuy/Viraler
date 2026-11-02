import hashlib
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.model_files import ChecksumError, ModelFile, ensure_file

CONTENT = b"model-bytes" * 1000
SPEC = ModelFile("m.onnx", "https://example.test/m.onnx", hashlib.sha256(CONTENT).hexdigest())


class FakeDownload:
    def __init__(self, body: bytes) -> None:
        self.body = body
        self.calls = 0

    def __call__(self, url: str) -> Iterator[bytes]:
        self.calls += 1
        yield self.body[: len(self.body) // 2]
        yield self.body[len(self.body) // 2 :]


def test_downloads_and_verifies(tmp_path: Path) -> None:
    dl = FakeDownload(CONTENT)
    path = ensure_file(tmp_path, SPEC, dl)
    assert path.read_bytes() == CONTENT
    assert dl.calls == 1


def test_skips_download_when_valid_file_exists(tmp_path: Path) -> None:
    (tmp_path / SPEC.name).write_bytes(CONTENT)
    dl = FakeDownload(CONTENT)
    ensure_file(tmp_path, SPEC, dl)
    assert dl.calls == 0


def test_replaces_corrupt_existing_file(tmp_path: Path) -> None:
    (tmp_path / SPEC.name).write_bytes(b"truncated")
    ensure_file(tmp_path, SPEC, FakeDownload(CONTENT))
    assert (tmp_path / SPEC.name).read_bytes() == CONTENT


def test_checksum_mismatch_leaves_no_files(tmp_path: Path) -> None:
    with pytest.raises(ChecksumError):
        ensure_file(tmp_path, SPEC, FakeDownload(b"tampered"))
    assert list(tmp_path.iterdir()) == []
