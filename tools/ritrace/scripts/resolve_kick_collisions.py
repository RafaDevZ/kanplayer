"""Audit or resolve kick events in dense rhythm-grid cells."""

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
class ResolutionConfig:
    enabled: bool
    subdivision: int
    window_before_ms: float
    window_after_ms: float
    block_bars: int
    min_dense_classes: int
    remove_score: float
    add_score: float
    min_drums_low_flux: float
    min_kick_flux: float


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layers", required=True, type=Path)
    parser.add_argument("--events", required=True, type=Path)
    parser.add_argument("--config", type=Path, default=Path("configs/kick-resolution.yaml"))
    parser.add_argument("--audit-output", type=Path)
    parser.add_argument("--apply", action="store_true", help="write resolved kick events")
    arguments = parser.parse_args()
    payload = _load_payload(arguments.events)
    rhythm = payload.get("rhythm")
    if not isinstance(rhythm, dict):
        raise ValueError("events JSON has no rhythm grid")
    config = _load_config(arguments.config)
    audit_output = arguments.audit_output or arguments.events.with_name(
        "kick-collision-audit.json"
    )
    resolved, audit, summary = _resolve(
        payload["events"], arguments.layers, rhythm, config, arguments.apply
    )
    audit_output.parent.mkdir(parents=True, exist_ok=True)
    audit_output.write_text(
        json.dumps({"summary": summary, "cells": audit}, indent=2) + "\n",
        encoding="utf-8",
    )
    if arguments.apply and config.enabled:
        payload["events"] = resolved
        payload["kick_collision_resolution"] = summary
        arguments.events.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print("kick collision audit written to " + str(audit_output))
    print(json.dumps(summary, ensure_ascii=False))


def _load_payload(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("events"), list):
        raise ValueError("events JSON must contain an events list")
    return payload


def _load_config(path: Path) -> ResolutionConfig:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("kick resolution configuration must be a mapping")
    return ResolutionConfig(**raw)


def _resolve(
    events: list[dict[str, object]],
    layers: Path,
    rhythm: dict[str, Any],
    config: ResolutionConfig,
    apply: bool,
) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, object]]:
    bpm = rhythm.get("bpm")
    grid_start = rhythm.get("grid_start_seconds")
    if not isinstance(bpm, int | float) or not isinstance(grid_start, int | float):
        raise ValueError("rhythm grid is incomplete")
    drums_path = _drums_path(layers)
    paths = {
        "drums_low": drums_path,
        "drums_sub": drums_path,
        "kick": layers / "kick.wav",
        "snare": layers / "snare.wav",
        "hihat": layers / "hihat.wav",
        "toms": layers / "toms.wav",
    }
    bands = {
        "drums_low": (35.0, 180.0),
        "drums_sub": (35.0, 90.0),
        "kick": (35.0, 250.0),
        "snare": (120.0, 7_000.0),
        "hihat": (4_000.0, 18_000.0),
        "toms": (35.0, 300.0),
    }
    envelopes, sample_rate, duration = _load_envelopes(paths, bands)
    step = 60 / float(bpm) / config.subdivision
    grid_times = np.arange(float(grid_start), duration + step, step)
    grid_times = grid_times[grid_times >= 0]
    features = {
        name: _cell_features(envelope, sample_rate, grid_times, config)
        for name, envelope in envelopes.items()
    }
    normalized = {
        name: _robust_block_normalize(values, config, float(bpm))
        for name, values in features.items()
    }
    by_cell: dict[int, list[dict[str, object]]] = {}
    for event in events:
        cell = round((float(event["time_seconds"]) - float(grid_start)) / step)
        by_cell.setdefault(cell, []).append(event)
    dense_cells = {
        cell
        for cell, cell_events in by_cell.items()
        if len({str(event["class_name"]) for event in cell_events}) >= config.min_dense_classes
    }
    kick_share = features["kick"] / (
        features["kick"] + features["snare"] + features["hihat"] + features["toms"] + 1e-9
    )
    existing_dense_kick_shares = [
        float(kick_share[index])
        for cell in dense_cells
        if any(event["class_name"] == "kick" for event in by_cell[cell])
        if (index := _grid_index(cell, grid_times, float(grid_start), step)) is not None
    ]
    share_threshold = float(np.quantile(existing_dense_kick_shares, 0.15))
    remove_ids: set[int] = set()
    additions: list[dict[str, object]] = []
    audit: list[dict[str, object]] = []
    for cell in sorted(dense_cells):
        index = _grid_index(cell, grid_times, float(grid_start), step)
        if index is None:
            continue
        cell_events = by_cell[cell]
        existing_kicks = [event for event in cell_events if event["class_name"] == "kick"]
        scores = {name: float(values[index]) for name, values in normalized.items()}
        score = _kick_score(scores)
        share = float(kick_share[index])
        classes = sorted({str(event["class_name"]) for event in cell_events})
        decision = "keep"
        if existing_kicks:
            if (
                score < config.remove_score
                and scores["drums_low"] < config.min_drums_low_flux
                and scores["snare"] > scores["kick"]
                and share < share_threshold * 0.55
            ):
                decision = "remove"
                remove_ids.update(id(event) for event in existing_kicks)
        elif (
            score >= config.add_score
            and scores["drums_low"] >= config.min_drums_low_flux
            and scores["kick"] >= config.min_kick_flux
            and share >= share_threshold
        ):
            decision = "add"
            peak_time = _peak_time(
                envelopes["drums_low"],
                sample_rate,
                float(grid_times[index]),
                config.window_after_ms,
            )
            additions.append(
                {
                    "class_name": "kick",
                    "time_seconds": round(peak_time, 4),
                    "confidence": 1.0,
                    "grid_distance_ms": round(
                        abs(peak_time - float(grid_times[index])) * 1_000, 1
                    ),
                    "resolution": "recovered_from_collision",
                    "kick_score": round(score, 3),
                }
            )
        audit.append(
            {
                "grid_time_seconds": round(float(grid_times[index]), 4),
                "classes_before": classes,
                "decision": decision,
                "kick_score": round(score, 3),
                "kick_stem_share": round(share, 4),
                "features": {name: round(value, 3) for name, value in scores.items()},
            }
        )
    resolved = [event for event in events if id(event) not in remove_ids] + additions
    resolved.sort(key=lambda event: float(event["time_seconds"]))
    summary: dict[str, object] = {
        "dense_cells": len(dense_cells),
        "removed_kicks": len(remove_ids),
        "recovered_kicks": len(additions),
        "events_before": len(events),
        "events_after": len(resolved),
        "kick_stem_share_threshold": round(share_threshold, 4),
        "mode": "applied" if apply and config.enabled else "audit_only",
    }
    return resolved, audit, summary


def _drums_path(layers: Path) -> Path:
    metadata = json.loads((layers / "metadata.json").read_text(encoding="utf-8"))
    source = metadata.get("source_drums") if isinstance(metadata, dict) else None
    path = Path(source) if isinstance(source, str) else layers / "drums.wav"
    if not path.is_file():
        raise FileNotFoundError(f"original drums stem not found: {path}")
    return path


def _load_envelopes(
    paths: dict[str, Path], bands: dict[str, tuple[float, float]]
) -> tuple[dict[str, np.ndarray], int, float]:
    envelopes: dict[str, np.ndarray] = {}
    sample_rate: int | None = None
    duration = 0.0
    for name, path in paths.items():
        if not path.is_file():
            raise FileNotFoundError(f"required layer not found: {path}")
        samples, current_rate = librosa.load(path, sr=None, mono=True)
        if sample_rate is None:
            sample_rate = current_rate
        elif sample_rate != current_rate:
            raise ValueError("all collision resolver inputs must use one sample rate")
        filtered = _bandpass(samples, current_rate, *bands[name])
        envelopes[name] = _smoothed_envelope(filtered, current_rate)
        duration = max(duration, len(samples) / current_rate)
    if sample_rate is None:
        raise ValueError("no collision resolver audio was loaded")
    return envelopes, sample_rate, duration


def _bandpass(samples: np.ndarray, sample_rate: int, minimum: float, maximum: float) -> np.ndarray:
    nyquist = sample_rate / 2
    coefficients = butter(
        4, [minimum / nyquist, maximum / nyquist], btype="bandpass", output="sos"
    )
    return sosfiltfilt(coefficients, samples).astype(np.float32, copy=False)


def _smoothed_envelope(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    width = max(1, round(sample_rate * 0.005))
    kernel = np.full(width, 1 / width, dtype=np.float32)
    return np.convolve(np.abs(samples), kernel, mode="same")


def _cell_features(
    envelope: np.ndarray,
    sample_rate: int,
    grid_times: np.ndarray,
    config: ResolutionConfig,
) -> np.ndarray:
    values: list[float] = []
    before = round(config.window_before_ms * sample_rate / 1_000)
    after = round(config.window_after_ms * sample_rate / 1_000)
    guard = round(sample_rate * 0.005)
    for time in grid_times:
        center = round(float(time) * sample_rate)
        pre = envelope[max(0, center - before) : max(1, center - guard)]
        post = envelope[max(0, center) : min(len(envelope), center + after)]
        baseline = float(np.median(pre)) if len(pre) else 0.0
        peak = float(np.max(post)) if len(post) else 0.0
        values.append(max(0.0, peak - baseline))
    return np.asarray(values, dtype=np.float32)


def _robust_block_normalize(
    values: np.ndarray, config: ResolutionConfig, bpm: float
) -> np.ndarray:
    cells_per_block = config.block_bars * 4 * config.subdivision
    normalized = np.zeros_like(values)
    for start in range(0, len(values), cells_per_block):
        block = values[start : start + cells_per_block]
        median = float(np.median(block))
        mad = float(np.median(np.abs(block - median)))
        scale = mad * 1.4826
        if scale <= np.finfo(np.float32).eps:
            scale = float(np.quantile(block, 0.9)) - median
        scale = max(scale, np.finfo(np.float32).eps)
        normalized[start : start + cells_per_block] = np.clip((block - median) / scale, 0, 3)
    return normalized


def _grid_index(cell: int, grid_times: np.ndarray, grid_start: float, step: float) -> int | None:
    time = grid_start + cell * step
    index = round((time - float(grid_times[0])) / step)
    return index if 0 <= index < len(grid_times) else None


def _kick_score(features: dict[str, float]) -> float:
    return (
        0.35 * features["drums_low"]
        + 0.25 * features["drums_sub"]
        + 0.30 * features["kick"]
        - 0.07 * max(0.0, features["snare"] - features["kick"])
        - 0.03 * max(0.0, features["hihat"] - features["kick"])
        - 0.10 * max(0.0, features["toms"] - features["kick"])
    )


def _peak_time(envelope: np.ndarray, sample_rate: int, time: float, window_ms: float) -> float:
    start = max(0, round(time * sample_rate))
    end = min(len(envelope), start + round(window_ms * sample_rate / 1_000))
    return (start + int(np.argmax(envelope[start:end]))) / sample_rate


if __name__ == "__main__":
    main()

