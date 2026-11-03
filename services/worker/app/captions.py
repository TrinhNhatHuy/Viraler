"""Caption word timing: clean up Whisper's words and align them to the script.

Pure functions (no I/O) so they're easy to test. Times are integer ms.
"""

import difflib
from dataclasses import dataclass

# Below this share of script words found in the transcript, the audio probably
# isn't a reading of the script (ad-lib, other script): use the transcript.
MIN_ALIGN_RATIO = 0.5


@dataclass(frozen=True)
class RawWord:
    """A word as the ASR engine reports it (seconds, text may have spaces)."""

    text: str
    start_s: float
    end_s: float


@dataclass(frozen=True)
class TimedWord:
    text: str
    start_ms: int
    end_ms: int


def clean_words(raw: list[RawWord], duration_ms: int) -> list[TimedWord]:
    """Trims text, drops empty words, rounds to ms, clamps to the audio and makes
    times monotonic and non-overlapping (Whisper occasionally overlaps words)."""
    out: list[TimedWord] = []
    prev_end = 0
    for w in raw:
        text = w.text.strip()
        if not text:
            continue
        start = min(max(round(w.start_s * 1000), prev_end), duration_ms)
        end = min(max(round(w.end_s * 1000), start), duration_ms)
        out.append(TimedWord(text, start, end))
        prev_end = end
    return out


def match_key(text: str) -> str:
    """Comparison form of a word: case-folded letters and digits only."""
    return "".join(ch for ch in text.casefold() if ch.isalnum())


def script_tokens(script: str) -> list[str]:
    """Splits the script on whitespace, keeping punctuation attached ("fastest,").
    Tokens with no letters/digits ("—", "…") join the neighboring word."""
    tokens: list[str] = []
    prefix = ""
    for token in script.split():
        if match_key(token):
            tokens.append(f"{prefix} {token}" if prefix else token)
            prefix = ""
        elif tokens:
            tokens[-1] = f"{tokens[-1]} {token}"
        else:
            prefix = f"{prefix} {token}" if prefix else token
    if prefix and tokens:
        tokens[0] = f"{prefix} {tokens[0]}"
    return tokens


def _spread(tokens: list[str], lo: int, hi: int) -> list[tuple[int, int]]:
    """Splits [lo, hi] across tokens in proportion to their length."""
    hi = max(hi, lo)
    weights = [max(len(t), 1) for t in tokens]
    total = sum(weights)
    bounds = [lo]
    acc = 0
    for w in weights:
        acc += w
        bounds.append(lo + round((hi - lo) * acc / total))
    return list(zip(bounds[:-1], bounds[1:], strict=True))


def align_to_script(
    tokens: list[str], words: list[TimedWord], duration_ms: int
) -> list[TimedWord] | None:
    """Gives each script token a time from the transcript.

    - Matching words take Whisper's timing.
    - A replaced run ("three" heard as "3") shares the time of the words heard instead.
    - Script words Whisper missed share the gap between their neighbors.
    - Extra words Whisper heard are dropped.

    Returns None if too few script words were found in the transcript.
    """
    if not tokens or not words:
        return None
    a = [match_key(t) for t in tokens]
    b = [match_key(w.text) for w in words]
    timing: list[tuple[int, int] | None] = [None] * len(tokens)
    matched = 0

    matcher = difflib.SequenceMatcher(None, a, b, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                w = words[j1 + k]
                timing[i1 + k] = (w.start_ms, w.end_ms)
            matched += i2 - i1
        elif tag == "replace":
            spans = _spread(tokens[i1:i2], words[j1].start_ms, words[j2 - 1].end_ms)
            timing[i1:i2] = spans
        # "delete" (missed by Whisper) is filled below; "insert" (extra words) is dropped.

    if matched / len(tokens) < MIN_ALIGN_RATIO:
        return None

    i = 0
    while i < len(tokens):
        if timing[i] is not None:
            i += 1
            continue
        j = i
        while j < len(tokens) and timing[j] is None:
            j += 1
        prev = timing[i - 1] if i > 0 else None
        nxt = timing[j] if j < len(tokens) else None
        lo = prev[1] if prev else 0
        hi = nxt[0] if nxt else duration_ms
        timing[i:j] = _spread(tokens[i:j], lo, hi)
        i = j

    aligned: list[TimedWord] = []
    for token, span in zip(tokens, timing, strict=True):
        assert span is not None  # every gap was filled above
        aligned.append(TimedWord(token, *span))
    return aligned
