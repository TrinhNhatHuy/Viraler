"""Model files (Kokoro TTS, Whisper ASR): pinned by URL + sha256, downloaded once
into MODELS_DIR.

Run `uv run python -m app.model_files` to download ahead of time.
"""

import hashlib
import logging
import os
import sys
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import httpx

log = logging.getLogger(__name__)

KokoroVariant = Literal["fp32", "int8", "fp16"]

_RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"


@dataclass(frozen=True)
class ModelFile:
    name: str
    url: str
    sha256: str


MODEL_FILES: dict[KokoroVariant, ModelFile] = {
    "fp32": ModelFile(
        "kokoro-v1.0.onnx",
        f"{_RELEASE}/kokoro-v1.0.onnx",
        "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a",
    ),
    "int8": ModelFile(
        "kokoro-v1.0.int8.onnx",
        f"{_RELEASE}/kokoro-v1.0.int8.onnx",
        "ae315a79b623f244700e4afb9246c46a26066782e049ba174bf3ba433970ee9c",
    ),
    "fp16": ModelFile(
        "kokoro-v1.0.fp16.onnx",
        f"{_RELEASE}/kokoro-v1.0.fp16.onnx",
        "f3a290d384fbb27966d462905c71a46cef9e5fd00516b40df32a0b4afe77ac96",
    ),
}

VOICES_FILE = ModelFile(
    "voices-v1.0.bin",
    f"{_RELEASE}/voices-v1.0.bin",
    "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
)

# --- Whisper (CTranslate2 conversions by Systran, pinned to a commit) ----------

WhisperModelName = Literal["small.en", "base.en"]

_HF = "https://huggingface.co"


@dataclass(frozen=True)
class WhisperSpec:
    repo: str
    commit: str
    files: tuple[ModelFile, ...]


def _hf_files(repo: str, commit: str, sha256: dict[str, str]) -> WhisperSpec:
    files = tuple(
        ModelFile(name, f"{_HF}/{repo}/resolve/{commit}/{name}", digest)
        for name, digest in sha256.items()
    )
    return WhisperSpec(repo, commit, files)


# tokenizer.json and vocabulary.txt are identical for the English-only models.
_EN_TOKENIZER = "929c5252409436dce1b38a75d1abbcb5e132d170d8e324e4e04ed915fa2d22df"
_EN_VOCABULARY = "ff77588746d3a2595d32ab5b69ffd7b95ce2441ac57533cb66fc3eb575a115cf"

WHISPER_MODELS: dict[WhisperModelName, WhisperSpec] = {
    "small.en": _hf_files(
        "Systran/faster-whisper-small.en",
        "d1d751a5f8271d482d14ca55d9e2deeebbae577f",
        {
            "config.json": "666a9605530ac1f61fa8177f3702b4dacec9966749e42610839fcc32661d5fae",
            "model.bin": "62b2a45b05ee59acb4a5341b33ee35e041395d378d418a18acfe4c9e768ee37a",
            "tokenizer.json": _EN_TOKENIZER,
            "vocabulary.txt": _EN_VOCABULARY,
        },
    ),
    "base.en": _hf_files(
        "Systran/faster-whisper-base.en",
        "3d3d5dee26484f91867d81cb899cfcf72b96be6c",
        {
            "config.json": "f3bc3821e9fc76a27bae538e11ae5b677dcdd352b4600429ce7951d398569aeb",
            "model.bin": "2a166925539a16005f14ff328359f9b9adb9dc4fb631bb3b227526862e93e2ef",
            "tokenizer.json": _EN_TOKENIZER,
            "vocabulary.txt": _EN_VOCABULARY,
        },
    ),
}

# Streams the body of `url` as byte chunks. Swappable in tests.
Downloader = Callable[[str], Iterator[bytes]]


class ChecksumError(Exception):
    pass


def _http_download(url: str) -> Iterator[bytes]:
    with httpx.stream("GET", url, follow_redirects=True, timeout=60) as res:
        res.raise_for_status()
        total = int(res.headers.get("content-length", 0))
        done = 0
        last_pct = -10
        for chunk in res.iter_bytes(1 << 20):
            done += len(chunk)
            pct = done * 100 // total if total else 0
            if pct >= last_pct + 10:
                log.info("  %s: %d%%", url.rsplit("/", 1)[-1], pct)
                last_pct = pct
            yield chunk


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def ensure_file(directory: Path, spec: ModelFile, download: Downloader = _http_download) -> Path:
    """Returns the path to a verified copy of `spec`, downloading it if needed."""
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / spec.name
    if target.exists() and _sha256(target) == spec.sha256:
        return target

    log.info("downloading %s", spec.url)
    part = target.with_name(target.name + ".part")
    h = hashlib.sha256()
    try:
        with part.open("wb") as f:
            for chunk in download(spec.url):
                h.update(chunk)
                f.write(chunk)
        if h.hexdigest() != spec.sha256:
            raise ChecksumError(
                f"{spec.name}: sha256 {h.hexdigest()} does not match pinned {spec.sha256}"
            )
        os.replace(part, target)  # atomic: a crash never leaves a half-written model
    finally:
        part.unlink(missing_ok=True)
    return target


def ensure_model_files(
    directory: Path, variant: KokoroVariant, download: Downloader = _http_download
) -> tuple[Path, Path]:
    """Returns (model_path, voices_path)."""
    model = ensure_file(directory, MODEL_FILES[variant], download)
    voices = ensure_file(directory, VOICES_FILE, download)
    return model, voices


def ensure_whisper_model(
    directory: Path, name: WhisperModelName, download: Downloader = _http_download
) -> Path:
    """Returns the folder holding a verified copy of the Whisper model (loadable by path)."""
    folder = directory / "whisper" / name
    for spec in WHISPER_MODELS[name].files:
        ensure_file(folder, spec, download)
    return folder


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    from app.config import get_settings

    settings = get_settings()
    models_dir = Path(settings.models_dir)
    model, voices = ensure_model_files(models_dir, settings.kokoro_model)
    whisper = ensure_whisper_model(models_dir, settings.whisper_model)
    print(f"ready: {model}\n       {voices}\n       {whisper}", file=sys.stderr)
