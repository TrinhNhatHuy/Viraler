import io
import wave

import numpy as np

from app.audio import duration_ms, wav_bytes


def test_wav_header_and_samples() -> None:
    samples = np.linspace(-0.5, 0.5, 24_000, dtype=np.float32)
    data = wav_bytes(samples, 24_000)
    with wave.open(io.BytesIO(data)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, 24_000)
        assert w.getnframes() == 24_000


def test_wav_clips_out_of_range_samples() -> None:
    data = wav_bytes(np.array([2.0, -2.0, 0.0], dtype=np.float32), 24_000)
    with wave.open(io.BytesIO(data)) as w:
        pcm = np.frombuffer(w.readframes(3), dtype="<i2")
    assert pcm.tolist() == [32767, -32767, 0]


def test_duration_ms_rounds() -> None:
    assert duration_ms(24_000, 24_000) == 1000
    assert duration_ms(25, 24_000) == 1
    assert duration_ms(36, 24_000) == 2
    assert duration_ms(0, 24_000) == 0
