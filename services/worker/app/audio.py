import io
import wave

import numpy as np
from numpy.typing import NDArray


def duration_ms(num_samples: int, sample_rate: int) -> int:
    return round(num_samples * 1000 / sample_rate)


def wav_bytes(samples: NDArray[np.floating], sample_rate: int) -> bytes:
    """Mono float samples in [-1, 1] → 16-bit PCM WAV."""
    mono = np.asarray(samples, dtype=np.float32).reshape(-1)
    pcm = (np.clip(mono, -1.0, 1.0) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()
