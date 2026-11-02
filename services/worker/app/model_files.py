"""Kokoro model files: pinned by URL + sha256, downloaded once into MODELS_DIR.

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


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    from app.config import get_settings

    settings = get_settings()
    model, voices = ensure_model_files(Path(settings.models_dir), settings.kokoro_model)
    print(f"ready: {model}\n       {voices}", file=sys.stderr)
