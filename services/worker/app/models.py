"""Pydantic mirrors of packages/shared/src/{project,job}.ts. Keep in sync.

The shared fixture packages/shared/fixtures/project.sample.json is validated by
both the Zod and these models (see tests/test_models.py) to catch drift.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

SCRIPT_MAX_CHARS = 5000
MAX_JOB_ATTEMPTS = 3
TTS_SPEED_MIN = 0.5
TTS_SPEED_MAX = 2.0
# packages/shared/src/limits.ts
MAX_AUDIO_BYTES = 25 * 1024 * 1024
MAX_AUDIO_DURATION_MS = 10 * 60 * 1000

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


# Defaults below mirror packages/shared/src/project.ts: fields added after a
# format was in use default to the old look, so older projects still validate.
Entrance = Literal["none", "pop"]


class CaptionStyle(TextStyle):
    highlight_color: HexColor
    max_words_per_line: Annotated[int, Field(gt=0, strict=True)]
    highlight_mode: Literal["color", "box", "karaoke", "none"] = "color"
    animation: Literal["none", "pop"] = "none"
    max_lines: Literal[1, 2] = 1


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
    script_hash: str | None = None


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
    voiceover_src: str | None = None


class HookTitle(CamelModel):
    enabled: StrictBool
    text: str
    duration_ms: Ms
    style: TextStyle
    entrance: Entrance = "none"


def _text_style(**overrides: object) -> "TextStyle":
    base: dict[str, object] = {
        "font_family": "Inter",
        "font_size_px": 72,
        "color": "#ffffff",
        "stroke_color": "#000000",
        "stroke_width_px": 6,
        "position_y": 0.2,
        "align": "center",
        "uppercase": True,
    }
    return TextStyle(**{**base, **overrides})  # type: ignore[arg-type]


# DEFAULT_RANKING_TITLE_STYLE / DEFAULT_RANK_LABEL_STYLE in project.ts
def _ranking_title_style() -> "TextStyle":
    return _text_style(font_size_px=64, position_y=0.09, stroke_width_px=6)


def _rank_label_style() -> "TextStyle":
    return _text_style(font_size_px=88, position_y=0.17, stroke_width_px=8)


class Ranking(CamelModel):
    enabled: StrictBool
    title: str
    order: Literal["descending", "ascending"]
    layout: Literal["badge", "list"] = "badge"
    title_style: TextStyle = Field(default_factory=_ranking_title_style)
    label_style: TextStyle = Field(default_factory=_rank_label_style)
    rank_color: HexColor = "#ffd400"
    entrance: Entrance = "none"


class Clip(CamelModel):
    id: Annotated[str, Field(min_length=1)]
    media_id: Annotated[str, Field(min_length=1)]
    start_ms: Ms
    duration_ms: Ms
    trim_in_ms: Ms
    muted: StrictBool
    rank: Annotated[int, Field(gt=0, strict=True)] | None = None
    label: str | None = None


MEDIA_NAME_MAX = 200


class MediaItem(CamelModel):
    id: Annotated[str, Field(min_length=1)]
    kind: Literal["video", "image", "audio"]
    src: Annotated[str, Field(min_length=1)]
    duration_ms: Ms | None = None
    origin: Literal["upload", "stock", "ai"]
    width: Annotated[int, Field(gt=0, strict=True)] | None = None
    height: Annotated[int, Field(gt=0, strict=True)] | None = None
    thumbnail: Annotated[str, Field(min_length=1)] | None = None
    name: Annotated[str, Field(max_length=MEDIA_NAME_MAX)] | None = None


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


# Must match packages/shared/src/voices.json (checked in tests/test_models.py).
VoiceId = Literal[
    "af_heart",
    "af_bella",
    "af_nicole",
    "af_aoede",
    "af_kore",
    "af_sarah",
    "am_fenrir",
    "am_michael",
    "am_puck",
    "bf_emma",
    "bf_isabella",
    "bm_george",
    "bm_fable",
]


class TtsInput(CamelModel):
    text: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=SCRIPT_MAX_CHARS)
    ]
    voice: VoiceId
    speed: Annotated[float, Field(ge=TTS_SPEED_MIN, le=TTS_SPEED_MAX)] = 1.0


class TtsOutput(CamelModel):
    path: Annotated[str, Field(min_length=1)]
    duration_ms: Ms
    sample_rate: Annotated[int, Field(gt=0)]
    voice: str


class TranscribeInput(CamelModel):
    audio_path: Annotated[str, Field(min_length=1)]
    script: Annotated[str, Field(max_length=SCRIPT_MAX_CHARS)] = ""


class TranscribeOutput(CamelModel):
    audio_path: Annotated[str, Field(min_length=1)]
    words: list[CaptionWord]
    language: str
    aligned: StrictBool
    duration_ms: Ms


STOCK_PAGE_SIZE = 20


class StockSearchInput(CamelModel):
    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    kind: Literal["video", "image"]
    page: Annotated[int, Field(gt=0, le=100, strict=True)] = 1


class StockItem(CamelModel):
    provider: Literal["pexels"]
    provider_id: Annotated[str, Field(min_length=1)]
    kind: Literal["video", "image"]
    url: str
    thumbnail_url: str
    width: Annotated[int, Field(gt=0)]
    height: Annotated[int, Field(gt=0)]
    duration_ms: Ms | None = None
    page_url: str
    author: str
    author_url: str


class StockSearchOutput(CamelModel):
    items: list[StockItem]
    page: Annotated[int, Field(gt=0)]
    has_more: StrictBool
    total_results: Annotated[int, Field(ge=0)]


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
