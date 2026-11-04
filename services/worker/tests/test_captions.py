from app.captions import (
    RawWord,
    TimedWord,
    align_to_script,
    clean_words,
    match_key,
    script_tokens,
)


def tw(text: str, start: int, end: int) -> TimedWord:
    return TimedWord(text, start, end)


# --- clean_words ----------------------------------------------------------------


def test_clean_trims_rounds_and_drops_empty_words() -> None:
    raw = [RawWord(" Hello", 0.0, 0.3004), RawWord("  ", 0.3, 0.4), RawWord(" world.", 0.42, 0.9)]
    assert clean_words(raw, 1000) == [tw("Hello", 0, 300), tw("world.", 420, 900)]


def test_clean_removes_overlaps_and_backwards_times() -> None:
    raw = [RawWord("a", 0.0, 0.5), RawWord("b", 0.4, 0.45), RawWord("c", 0.6, 0.55)]
    assert clean_words(raw, 1000) == [tw("a", 0, 500), tw("b", 500, 500), tw("c", 600, 600)]


def test_clean_clamps_to_the_audio_duration() -> None:
    raw = [RawWord("end", 0.9, 1.4), RawWord("past", 1.5, 1.8)]
    assert clean_words(raw, 1000) == [tw("end", 900, 1000), tw("past", 1000, 1000)]


# --- script_tokens ---------------------------------------------------------------


def test_tokens_keep_punctuation_attached() -> None:
    assert script_tokens("Top 3 fastest,\nanimals!") == ["Top", "3", "fastest,", "animals!"]


def test_punctuation_only_tokens_join_a_neighbor() -> None:
    assert script_tokens("Wait — what? …") == ["Wait —", "what? …"]
    assert script_tokens("“ Hello there") == ["“ Hello", "there"]
    assert script_tokens("  ") == []


def test_match_key() -> None:
    assert match_key("Don't!") == "dont"
    assert match_key("1,000") == "1000"
    assert match_key("Café,") == "café"


# --- align_to_script ------------------------------------------------------------


def test_exact_match_uses_script_text_and_whisper_timing() -> None:
    words = [tw("top", 0, 200), tw("three", 200, 500), tw("fastest", 500, 900)]
    aligned = align_to_script(["Top", "three", "fastest!"], words, 1000)
    assert aligned == [tw("Top", 0, 200), tw("three", 200, 500), tw("fastest!", 500, 900)]


def test_replaced_run_shares_the_heard_words_time() -> None:
    # Script says "three" and "hundred", Whisper heard "300".
    words = [tw("about", 0, 300), tw("300", 300, 900), tw("cats", 900, 1200)]
    aligned = align_to_script(["about", "three", "hundred", "cats"], words, 1500)
    assert aligned is not None
    assert [w.text for w in aligned] == ["about", "three", "hundred", "cats"]
    # 600 ms split by length (5 vs 7 chars).
    assert aligned[1] == tw("three", 300, 550)
    assert aligned[2] == tw("hundred", 550, 900)
    assert aligned[3] == tw("cats", 900, 1200)


def test_missed_words_fill_the_gap_between_neighbors() -> None:
    words = [tw("one", 0, 200), tw("four", 800, 1000)]
    aligned = align_to_script(["one", "two", "three", "four"], words, 1000)
    assert aligned is not None
    assert aligned[1] == tw("two", 200, 425)
    assert aligned[2] == tw("three", 425, 800)


def test_missed_words_at_the_edges_use_the_audio_bounds() -> None:
    words = [tw("b", 300, 400), tw("c", 400, 500)]
    aligned = align_to_script(["a", "b", "c", "d"], words, 1000)
    assert aligned is not None
    assert aligned[0] == tw("a", 0, 300)
    assert aligned[3] == tw("d", 500, 1000)


def test_extra_heard_words_are_dropped() -> None:
    words = [tw("so", 0, 100), tw("um", 100, 200), tw("yes", 200, 400)]
    assert align_to_script(["so", "yes"], words, 500) == [tw("so", 0, 100), tw("yes", 200, 400)]


def test_alignment_is_monotonic() -> None:
    words = [tw(w, i * 100, i * 100 + 80) for i, w in enumerate(["a", "b", "x", "d", "e", "f"])]
    aligned = align_to_script(["a", "b", "c", "d", "e", "f"], words, 1000)
    assert aligned is not None
    for prev, cur in zip(aligned, aligned[1:], strict=False):
        assert prev.end_ms <= cur.start_ms and cur.start_ms <= cur.end_ms


def test_returns_none_when_the_audio_does_not_match() -> None:
    words = [tw("completely", 0, 100), tw("different", 100, 200), tw("words", 200, 300)]
    assert align_to_script(["the", "script", "text", "words"], words, 300) is None


def test_returns_none_without_words_or_tokens() -> None:
    assert align_to_script([], [tw("a", 0, 1)], 1) is None
    assert align_to_script(["a"], [], 1) is None


# --- ensure_min_duration -----------------------------------------------------------


def test_short_word_takes_the_gap_after_it() -> None:
    from app.captions import ensure_min_duration

    words = [tw("number", 1000, 1000), tw("three", 1300, 1600)]
    assert ensure_min_duration(words, 2000) == [tw("number", 1000, 1080), tw("three", 1300, 1600)]


def test_short_word_nudges_the_next_start_but_keeps_its_minimum() -> None:
    from app.captions import ensure_min_duration

    words = [tw("number", 2740, 2740), tw("three:", 2740, 3000)]
    out = ensure_min_duration(words, 5000)
    assert out == [tw("number", 2740, 2820), tw("three:", 2820, 3000)]
    # The next word is short too: both keep at least 80 ms where possible.
    tight = ensure_min_duration([tw("a", 100, 100), tw("b", 100, 150)], 5000)
    assert tight[0] == tw("a", 100, 180) and tight[1].start_ms == 180
    assert tight[1].end_ms - tight[1].start_ms >= 80


def test_min_duration_stays_inside_the_audio_and_leaves_normal_words() -> None:
    from app.captions import ensure_min_duration

    words = [tw("ok", 0, 300), tw("end", 990, 1000)]
    out = ensure_min_duration(words, 1000)
    assert out[0] == tw("ok", 0, 300)
    assert out[1] == tw("end", 920, 1000)  # grows backwards: the audio ends at 1000
    for prev, cur in zip(out, out[1:], strict=False):
        assert prev.end_ms <= cur.start_ms <= cur.end_ms
