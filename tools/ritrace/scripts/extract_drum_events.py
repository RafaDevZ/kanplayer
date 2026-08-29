"""Extract synchronized kick, snare and hi-hat onsets from DrumSep WAV layers."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import yaml
from scipy.signal import butter, sosfiltfilt


@dataclass(frozen=True, slots=True)
class ClassOnsetConfig:
    delta: float
    min_distance_ms: float
    min_frequency_hz: float
    max_frequency_hz: float
    min_confidence: float
    peak_window_ms: float
    tail_guard_ms: float
    min_relative_peak: float
    onset_fft_size: int = 2_048
    max_peak_duration_ms: float | None = None
    peak_decay_ratio: float = 0.35
    grid_subdivision: int | None = None
    grid_tolerance_ms: float | None = None
    low_band_max_frequency_hz: float | None = None
    mid_band_max_frequency_hz: float | None = None
    min_low_to_mid_ratio: float | None = None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layers", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--config", type=Path, default=Path("configs/onsets.yaml"))
    parser.add_argument(
        "--remove-layers",
        action="store_true",
        help="remove generated WAV layers after events.json is safely written",
    )
    arguments = parser.parse_args()
    hop_length, class_configs = _load_config(arguments.config)
    events: list[dict[str, object]] = []
    raw_onsets: dict[str, list[dict[str, object]]] = {}
    for class_name, config in class_configs.items():
        layer = arguments.layers / f"{class_name}.wav"
        if not layer.is_file():
            raise FileNotFoundError(f"required DrumSep layer not found: {layer}")
        raw_events, resolved_events = _extract_events(layer, class_name, hop_length, config)
        raw_onsets[class_name] = raw_events
        events.extend(resolved_events)
    events.sort(key=lambda event: float(event["time_seconds"]))
    rhythm = _detect_rhythm(arguments.layers, hop_length)
    events = _discard_off_grid_events(events, rhythm, class_configs)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(
            {"events": events, "raw_onsets": raw_onsets, "rhythm": rhythm}, indent=2
        )
        + "\n",
        encoding="utf-8",
    )
    counts = {name: sum(event["class_name"] == name for event in events) for name in class_configs}
    raw_counts = {name: len(values) for name, values in raw_onsets.items()}
    print("events written to " + str(arguments.output) + " " + str(counts))
    print("raw onset candidates: " + str(raw_counts))
    if rhythm is not None:
        print(f"rhythm grid: {rhythm['bpm']} BPM, {len(rhythm['beats_seconds'])} beats")
    if arguments.remove_layers:
        removed = _remove_generated_wavs(arguments.layers)
        print(f"removed {removed} generated WAV layer(s)")


def _detect_rhythm(layers: Path, hop_length: int) -> dict[str, object] | None:
    """Estimate a beat grid from the original Demucs drum stem when available."""
    source: Path | None = None
    metadata_path = layers / "metadata.json"
    if metadata_path.is_file():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        candidate = metadata.get("source_drums") if isinstance(metadata, dict) else None
        if isinstance(candidate, str) and Path(candidate).is_file():
            source = Path(candidate)
    samples, sample_rate = librosa.load(source or layers / "kick.wav", sr=None, mono=True)
    onset_envelope = librosa.onset.onset_strength(
        y=samples, sr=sample_rate, hop_length=hop_length
    )
    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_envelope,
        sr=sample_rate,
        hop_length=hop_length,
        trim=False,
    )
    bpm_values = np.asarray(tempo).reshape(-1)
    if not len(beat_frames) or not len(bpm_values):
        return None
    bpm = float(bpm_values[0])
    if not 30 <= bpm <= 300:
        return None
    beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate, hop_length=hop_length)
    rounded_bpm = round(bpm)
    beat_interval = 60 / rounded_bpm
    phase_vector = np.mean(np.exp(2j * np.pi * beat_times / beat_interval))
    phase = float(np.angle(phase_vector) % (2 * np.pi) / (2 * np.pi) * beat_interval)
    grid_start = phase - np.ceil(phase / beat_interval) * beat_interval
    fitted = grid_start + np.round((beat_times - grid_start) / beat_interval) * beat_interval
    alignment_ms = np.abs(beat_times - fitted) * 1_000
    duration = librosa.get_duration(y=samples, sr=sample_rate)
    exact_beats = np.arange(grid_start, duration + beat_interval, beat_interval)
    return {
        "bpm": rounded_bpm,
        "grid_start_seconds": round(float(grid_start), 6),
        "beat_fit_median_ms": round(float(np.median(alignment_ms)), 2),
        "beats_seconds": [round(float(time), 4) for time in exact_beats if time >= 0],
    }


def _discard_off_grid_events(
    events: list[dict[str, object]],
    rhythm: dict[str, object] | None,
    class_configs: dict[str, ClassOnsetConfig],
) -> list[dict[str, object]]:
    """Keep configured event classes close to an exact BPM subdivision grid."""
    if rhythm is None:
        return events
    bpm = rhythm.get("bpm")
    grid_start = rhythm.get("grid_start_seconds")
    if not isinstance(bpm, int | float) or not isinstance(grid_start, int | float):
        return events
    filtered: list[dict[str, object]] = []
    for event in events:
        config = class_configs.get(str(event.get("class_name")))
        if (
            config is None
            or config.grid_subdivision is None
            or config.grid_tolerance_ms is None
        ):
            filtered.append(event)
            continue
        time = float(event["time_seconds"])
        subdivision_interval = 60 / float(bpm) / config.grid_subdivision
        tolerance_seconds = config.grid_tolerance_ms / 1_000
        grid_index = round((time - float(grid_start)) / subdivision_interval)
        grid_time = float(grid_start) + grid_index * subdivision_interval
        distance = abs(time - grid_time)
        event["grid_distance_ms"] = round(distance * 1_000, 1)
        if distance <= tolerance_seconds:
            filtered.append(event)
    return filtered


def _remove_generated_wavs(layers: Path) -> int:
    """Delete only the audio intermediates owned by the separation pipeline."""
    layer_names = ("drums", "kick", "snare", "hihat", "toms", "ride", "crash")
    removed = 0
    for layer_name in layer_names:
        path = layers / f"{layer_name}.wav"
        if path.is_file():
            path.unlink()
            removed += 1
    return removed


def _load_config(path: Path) -> tuple[int, dict[str, ClassOnsetConfig]]:
    with path.open(encoding="utf-8") as file:
        raw: Any = yaml.safe_load(file)
    if not isinstance(raw, dict) or not isinstance(raw.get("hop_length"), int):
        raise ValueError("onset configuration must define an integer hop_length")
    raw_classes = raw.get("classes")
    if not isinstance(raw_classes, dict) or not raw_classes:
        raise ValueError("onset configuration must define class settings")
    configs = {
        name: ClassOnsetConfig(**settings)
        for name, settings in raw_classes.items()
        if isinstance(name, str) and isinstance(settings, dict)
    }
    if set(configs) != set(raw_classes):
        raise ValueError("each onset class setting must be a mapping")
    return raw["hop_length"], configs


def _extract_events(
    layer: Path,
    class_name: str,
    hop_length: int,
    config: ClassOnsetConfig,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    raw_samples, sample_rate = librosa.load(layer, sr=None, mono=True)
    samples = _bandpass(raw_samples, sample_rate, config)
    envelope = librosa.onset.onset_strength(
        y=samples,
        sr=sample_rate,
        hop_length=hop_length,
        n_fft=config.onset_fft_size,
    )
    wait_frames = max(1, round(config.min_distance_ms * sample_rate / (hop_length * 1_000)))
    peak_window_frames = max(
        1, round(config.peak_window_ms * sample_rate / (hop_length * 1_000))
    )
    raw_peak_window_frames = max(1, round(25 * sample_rate / (hop_length * 1_000)))
    raw_frames = librosa.onset.onset_detect(
        onset_envelope=envelope,
        sr=sample_rate,
        hop_length=hop_length,
        delta=config.delta * 0.5,
        wait=0,
        pre_max=raw_peak_window_frames,
        post_max=raw_peak_window_frames,
        pre_avg=raw_peak_window_frames,
        post_avg=raw_peak_window_frames,
        units="frames",
    )
    raw_events = _events_from_frames(
        raw_frames, envelope, sample_rate, hop_length, class_name, 0.0, raw=True
    )
    frames = librosa.onset.onset_detect(
        onset_envelope=envelope,
        sr=sample_rate,
        hop_length=hop_length,
        delta=config.delta,
        wait=wait_frames,
        pre_max=peak_window_frames,
        post_max=peak_window_frames,
        pre_avg=peak_window_frames,
        post_avg=peak_window_frames,
        units="frames",
    )
    frames = _discard_tail_candidates(frames, samples, sample_rate, hop_length, config)
    frames = _discard_sustained_peaks(frames, samples, sample_rate, hop_length, config)
    frames = _discard_non_bass_kicks(
        frames, raw_samples, sample_rate, hop_length, config
    )
    return raw_events, _events_from_frames(
        frames,
        envelope,
        sample_rate,
        hop_length,
        class_name,
        config.min_confidence,
    )


def _events_from_frames(
    frames: np.ndarray,
    envelope: np.ndarray,
    sample_rate: int,
    hop_length: int,
    class_name: str,
    min_confidence: float,
    *,
    raw: bool = False,
) -> list[dict[str, object]]:
    times = librosa.frames_to_time(frames, sr=sample_rate, hop_length=hop_length)
    scale = max(float(np.quantile(envelope, 0.99)), np.finfo(np.float32).eps)
    events = [
        {
            "class_name": class_name,
            "time_seconds": round(float(time), 4),
            "confidence": round(float(min(1.0, envelope[frame] / scale)), 4),
        }
        for frame, time in zip(frames, times, strict=True)
        if envelope[frame] / scale >= min_confidence
    ]
    if raw:
        for event, frame in zip(events, frames, strict=True):
            event["onset_strength"] = round(float(envelope[frame]), 6)
    return events


def _discard_tail_candidates(
    frames: np.ndarray,
    samples: np.ndarray,
    sample_rate: int,
    hop_length: int,
    config: ClassOnsetConfig,
) -> np.ndarray:
    """Keep a new onset only when it rises above the prior event's fading tail."""
    if not len(frames):
        return frames
    rms = librosa.feature.rms(y=samples, frame_length=hop_length * 4, hop_length=hop_length)[0]
    accepted: list[int] = []
    last_frame = -1
    last_peak = 0.0
    for frame in frames:
        local_peak = float(np.max(rms[frame : frame + 3]))
        elapsed_ms = (frame - last_frame) * hop_length * 1_000 / sample_rate
        is_tail = (
            accepted
            and elapsed_ms < config.tail_guard_ms
            and local_peak < last_peak * config.min_relative_peak
        )
        if is_tail:
            continue
        accepted.append(int(frame))
        last_frame = int(frame)
        last_peak = local_peak
    return np.asarray(accepted, dtype=np.int64)


def _discard_sustained_peaks(
    frames: np.ndarray,
    samples: np.ndarray,
    sample_rate: int,
    hop_length: int,
    config: ClassOnsetConfig,
) -> np.ndarray:
    """Reject candidates whose local energy stays near its peak for too long."""
    if not len(frames) or config.max_peak_duration_ms is None:
        return frames
    rms = librosa.feature.rms(y=samples, frame_length=hop_length * 4, hop_length=hop_length)[0]
    max_frames = max(1, round(config.max_peak_duration_ms * sample_rate / (hop_length * 1_000)))
    accepted: list[int] = []
    for frame in frames:
        start = min(int(frame), len(rms) - 1)
        local_peak = float(np.max(rms[start : min(len(rms), start + 3)]))
        if local_peak <= np.finfo(np.float32).eps:
            continue
        end = min(len(rms), start + max_frames + 1)
        if np.any(rms[end - 1 : end] >= local_peak * config.peak_decay_ratio):
            continue
        accepted.append(int(frame))
    return np.asarray(accepted, dtype=np.int64)


def _discard_non_bass_kicks(
    frames: np.ndarray,
    samples: np.ndarray,
    sample_rate: int,
    hop_length: int,
    config: ClassOnsetConfig,
) -> np.ndarray:
    """Reject kick candidates whose energy is dominated by snare-like mid lows."""
    if (
        not len(frames)
        or config.low_band_max_frequency_hz is None
        or config.mid_band_max_frequency_hz is None
        or config.min_low_to_mid_ratio is None
    ):
        return frames
    low = _bandpass_range(
        samples, sample_rate, config.min_frequency_hz, config.low_band_max_frequency_hz
    )
    mid = _bandpass_range(
        samples,
        sample_rate,
        config.low_band_max_frequency_hz,
        config.mid_band_max_frequency_hz,
    )
    low_rms = librosa.feature.rms(y=low, frame_length=hop_length * 4, hop_length=hop_length)[0]
    mid_rms = librosa.feature.rms(y=mid, frame_length=hop_length * 4, hop_length=hop_length)[0]
    accepted = [
        int(frame)
        for frame in frames
        if low_rms[min(frame, len(low_rms) - 1)]
        >= mid_rms[min(frame, len(mid_rms) - 1)] * config.min_low_to_mid_ratio
    ]
    return np.asarray(accepted, dtype=np.int64)


def _bandpass(
    samples: np.ndarray, sample_rate: int, config: ClassOnsetConfig
) -> np.ndarray:
    return _bandpass_range(
        samples, sample_rate, config.min_frequency_hz, config.max_frequency_hz
    )


def _bandpass_range(
    samples: np.ndarray, sample_rate: int, min_frequency_hz: float, max_frequency_hz: float
) -> np.ndarray:
    nyquist = sample_rate / 2
    if not 0 < min_frequency_hz < max_frequency_hz < nyquist:
        raise ValueError("onset frequency range must fall between zero and the Nyquist frequency")
    coefficients = butter(
        4,
        [min_frequency_hz / nyquist, max_frequency_hz / nyquist],
        btype="bandpass",
        output="sos",
    )
    return sosfiltfilt(coefficients, samples).astype(np.float32, copy=False)


if __name__ == "__main__":
    main()

