import copy
import json
from pathlib import Path
from typing import get_args

import pytest
from pydantic import ValidationError

from app.models import (
    JOB_INPUT_BY_TYPE,
    SCRIPT_MAX_CHARS,
    Project,
    StockSearchInput,
    TranscribeInput,
    TranscribeOutput,
    VoiceId,
)

SHARED = Path(__file__).resolve().parents[3] / "packages/shared"
FIXTURE = SHARED / "fixtures/project.sample.json"
VOICES = SHARED / "src/voices.json"


@pytest.fixture
def sample() -> dict:
    return json.loads(FIXTURE.read_text())


def test_fixture_validates(sample: dict) -> None:
    Project.model_validate(sample)


def test_fixture_round_trips_exactly(sample: dict) -> None:
    # Same keys out as in: catches camelCase/alias drift vs the Zod schema.
    dumped = Project.model_validate(sample).model_dump(by_alias=True, exclude_unset=True)
    assert dumped == sample


def test_without_voiceover(sample: dict) -> None:
    del sample["voiceover"]
    assert Project.model_validate(sample).voiceover is None


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("clips", 0, "startMs"), -1),
        (("clips", 0, "durationMs"), 100.5),
        (("canvas", "fit"), "stretch"),
        (("canvas", "width"), 720),
        (("version",), 2),
        (("script",), "a" * (SCRIPT_MAX_CHARS + 1)),
        (("captions", "words", 0), {"text": "x", "startMs": 500, "endMs": 100}),
        (("captions", "style", "color"), "white"),
    ],
)
def test_rejects_invalid(sample: dict, path: tuple, value: object) -> None:
    doc = copy.deepcopy(sample)
    target = doc
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(ValidationError):
        Project.model_validate(doc)


def test_rejects_unknown_keys(sample: dict) -> None:
    sample["canvas"]["zoom"] = 2
    with pytest.raises(ValidationError):
        Project.model_validate(sample)


def test_every_job_type_has_input_model() -> None:
    assert set(JOB_INPUT_BY_TYPE) == {"tts", "transcribe", "stock_search", "image", "render"}


def test_voice_ids_match_shared_voices_json() -> None:
    shared = [v["id"] for v in json.loads(VOICES.read_text())]
    assert list(get_args(VoiceId)) == shared


def test_fixture_keeps_script_hash(sample: dict) -> None:
    assert Project.model_validate(sample).voiceover.script_hash == sample["voiceover"]["scriptHash"]


def test_fixture_keeps_captions_voiceover_src(sample: dict) -> None:
    captions = Project.model_validate(sample).captions
    assert captions.voiceover_src == sample["captions"]["voiceoverSrc"]


def test_transcribe_input_defaults_script() -> None:
    assert TranscribeInput.model_validate({"audioPath": "a"}).script == ""
    with pytest.raises(ValidationError):
        TranscribeInput.model_validate({"audioPath": "a", "script": "x" * (SCRIPT_MAX_CHARS + 1)})


def test_transcribe_output_uses_camel_case() -> None:
    out = TranscribeOutput.model_validate(
        {
            "audioPath": "a",
            "words": [{"text": "Hi", "startMs": 0, "endMs": 100}],
            "language": "en",
            "aligned": True,
            "durationMs": 100,
        }
    )
    assert set(out.model_dump(by_alias=True)) == {
        "audioPath",
        "words",
        "language",
        "aligned",
        "durationMs",
    }


def test_fixture_keeps_media_display_fields(sample: dict) -> None:
    media = Project.model_validate(sample).media[0]
    assert (media.width, media.height, media.name) == (1080, 1920, "Pronghorn running")
    assert media.thumbnail == sample["media"][0]["thumbnail"]


def test_stock_search_input_strips_and_limits() -> None:
    assert StockSearchInput.model_validate({"query": " sea ", "kind": "image"}).query == "sea"
    with pytest.raises(ValidationError):
        StockSearchInput.model_validate({"query": "sea", "kind": "image", "page": 101})


def test_older_project_gets_style_defaults(sample: dict) -> None:
    for key in ("highlightMode", "animation", "maxLines"):
        del sample["captions"]["style"][key]
    del sample["hookTitle"]["entrance"]
    for key in ("layout", "titleStyle", "labelStyle", "rankColor", "entrance"):
        del sample["ranking"][key]
    project = Project.model_validate(sample)
    assert (project.captions.style.highlight_mode, project.captions.style.max_lines) == ("color", 1)
    assert project.hook_title.entrance == "none"
    assert project.ranking.layout == "badge"
    assert project.ranking.title_style.font_size_px == 64
    assert project.ranking.label_style.position_y == 0.17
