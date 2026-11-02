"""Pydantic mirrors of packages/shared/src/{project,job}.ts. Keep in sync.

The shared fixture packages/shared/fixtures/project.sample.json is validated by
both the Zod and these models (see tests/test_models.py) to catch drift.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator
from pydantic.alias_generators import to_camel

SCRIPT_MAX_CHARS = 5000
MAX_JOB_ATTEMPTS = 3

Ms = Annotated[int, Field(ge=0, strict=True)]
HexColor = Annotated[str, Field(pattern=r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")]


class CamelModel(BaseModel):
    # forbid: an unknown key means the TS schema gained a field this mirror lacks.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


# --- Project document ---------------------------------------------------------


class TextStyle(CamelModel):
    font_family: Annotated[str, Field(min_length=1)]
    font_size_px: Annotated[int, Field(gt=0, strict=True)]
    color: HexColor
    stroke_color: HexColor
    stroke_width_px: Annotated[float, Field(ge=0)]
    background_color: HexColor | None = None
    position_y: Annotated[float, Field(ge=0, le=1)]
    align: Literal["left", "center", "right"]
    uppercase: StrictBool


class CaptionStyle(TextStyle):
    highlight_color: HexColor
    max_words_per_line: Annotated[int, Field(gt=0, strict=True)]


class Canvas(CamelModel):
    width: Literal[1080]
    height: Literal[1920]
    fit: Literal["fill", "fit"]
    background: HexColor


class Voiceover(CamelModel):
    src: Annotated[str, Field(min_length=1)]
    duration_ms: Ms
    source: Literal["tts", "recorded", "uploaded"]
    voice: str | None = None
    volume: Annotated[float, Field(ge=0, le=1)]


class CaptionWord(CamelModel):
    text: str
    start_ms: Ms
    end_ms: Ms

    @model_validator(mode="after")
    def _end_after_start(self) -> "CaptionWord":
        if self.end_ms < self.start_ms:
            raise ValueError("endMs must be >= startMs")
        return self


class Captions(CamelModel):
    enabled: StrictBool
    words: list[CaptionWord]
    style: CaptionStyle


class HookTitle(CamelModel):
    enabled: StrictBool
    text: str
    duration_ms: Ms
    style: TextStyle


class Ranking(CamelModel):
    enabled: StrictBool
    title: str
    order: Literal["descending", "ascending"]


class Clip(CamelModel):
    id: Annotated[str, Field(min_length=1)]
    media_id: Annotated[str, Field(min_length=1)]
    start_ms: Ms
    duration_ms: Ms
    trim_in_ms: Ms
    muted: StrictBool
    rank: Annotated[int, Field(gt=0, strict=True)] | None = None
    label: str | None = None


class MediaItem(CamelModel):
    id: Annotated[str, Field(min_length=1)]
    kind: Literal["video", "image", "audio"]
    src: Annotated[str, Field(min_length=1)]
    duration_ms: Ms | None = None
    origin: Literal["upload", "stock", "ai"]


class Project(CamelModel):
    version: Literal[1]
    canvas: Canvas
    script: Annotated[str, Field(max_length=SCRIPT_MAX_CHARS)]
    voiceover: Voiceover | None = None
    captions: Captions
    hook_title: HookTitle
    ranking: Ranking
    clips: list[Clip]
    media: list[MediaItem]


# --- Jobs ---------------------------------------------------------------------

JobType = Literal["tts", "transcribe", "stock_search", "image", "render"]
JobStatus = Literal["queued", "running", "done", "failed"]


class TtsInput(CamelModel):
    text: Annotated[str, Field(min_length=1, max_length=SCRIPT_MAX_CHARS)]
    voice: Annotated[str, Field(min_length=1)]


class TranscribeInput(CamelModel):
    audio_path: Annotated[str, Field(min_length=1)]


class StockSearchInput(CamelModel):
    query: Annotated[str, Field(min_length=1, max_length=200)]
    kind: Literal["video", "image"]
    page: Annotated[int, Field(gt=0, strict=True)] = 1


class ImageInput(CamelModel):
    prompt: Annotated[str, Field(min_length=1, max_length=1000)]


class RenderInput(CamelModel):
    project_id: str


JOB_INPUT_BY_TYPE: dict[str, type[CamelModel]] = {
    "tts": TtsInput,
    "transcribe": TranscribeInput,
    "stock_search": StockSearchInput,
    "image": ImageInput,
    "render": RenderInput,
}


class ClaimedJob(BaseModel):
    """A job row as claimed by the worker (snake_case DB columns)."""

    id: str
    user_id: str
    project_id: str | None
    type: JobType
    input: dict[str, Any]
    attempts: int
