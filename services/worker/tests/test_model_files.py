import hashlib
from collections.abc import Iterator
from pathlib import Path

import pytest

from app.model_files import (
    WHISPER_MODELS,
    ChecksumError,
    ModelFile,
    ensure_file,
    ensure_whisper_model,
)

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


@pytest.mark.parametrize("name", list(WHISPER_MODELS))
def test_whisper_specs_pin_every_file_to_a_commit(name: str) -> None:
    spec = WHISPER_MODELS[name]
    assert {f.name for f in spec.files} == {
        "config.json",
        "model.bin",
        "tokenizer.json",
        "vocabulary.txt",
    }
    assert len(spec.commit) == 40
    for f in spec.files:
        assert f.url == f"https://huggingface.co/{spec.repo}/resolve/{spec.commit}/{f.name}"
        assert len(f.sha256) == 64 and int(f.sha256, 16) >= 0


def test_ensure_whisper_model_downloads_into_its_own_folder(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.model_files as mf

    bodies = {f.url: f.name.encode() for f in WHISPER_MODELS["base.en"].files}
    fake = {
        f.name: ModelFile(f.name, f.url, hashlib.sha256(bodies[f.url]).hexdigest())
        for f in WHISPER_MODELS["base.en"].files
    }
    monkeypatch.setitem(
        mf.WHISPER_MODELS,
        "base.en",
        mf.WhisperSpec("repo", "c" * 40, tuple(fake.values())),
    )
    folder = ensure_whisper_model(tmp_path, "base.en", lambda url: iter([bodies[url]]))
    assert folder == tmp_path / "whisper" / "base.en"
    assert sorted(p.name for p in folder.iterdir()) == sorted(fake)
    assert (folder / "model.bin").read_bytes() == b"model.bin"
