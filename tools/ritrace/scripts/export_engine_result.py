"""Export the two non-audio artifacts produced by the Ritrace engine."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import librosa


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--events", required=True, type=Path)
    parser.add_argument("--timestamps-output", required=True, type=Path)
    parser.add_argument("--sync-output", required=True, type=Path)
    arguments = parser.parse_args()
    if not arguments.audio.is_file():
        raise FileNotFoundError(f"audio file not found: {arguments.audio}")
    payload = _load_payload(arguments.events)
    events = payload.get("events")
    rhythm = payload.get("rhythm")
    if not isinstance(events, list) or not isinstance(rhythm, dict):
        raise ValueError("events JSON must contain events and rhythm")

    timestamp_events = [_public_event(event) for event in events if isinstance(event, dict)]
    timestamp_events.sort(key=lambda event: float(event["time_seconds"]))
    timestamps = {"schema_version": "1.0", "events": timestamp_events}
    duration = float(librosa.get_duration(path=str(arguments.audio)))
    sync = {
        "schema_version": "1.0",
        "timeline": {
            "origin": "input_audio_start",
            "duration_seconds": round(duration, 6),
            "audio_sha256": _sha256(arguments.audio),
        },
        "beat_grid": _public_rhythm(rhythm),
    }
    _write_json(arguments.timestamps_output, timestamps)
    _write_json(arguments.sync_output, sync)
    print("timestamps written to " + str(arguments.timestamps_output))
    print("sync metadata written to " + str(arguments.sync_output))


def _load_payload(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("events JSON must contain an object")
    return value


def _public_event(event: dict[str, object]) -> dict[str, object]:
    class_name = event.get("class_name")
    time_seconds = event.get("time_seconds")
    confidence = event.get("confidence")
    if not isinstance(class_name, str) or not isinstance(time_seconds, int | float):
        raise ValueError("each event must contain class_name and time_seconds")
    output: dict[str, object] = {
        "instrument": class_name,
        "time_seconds": round(float(time_seconds), 4),
    }
    if isinstance(confidence, int | float):
        output["confidence"] = round(float(confidence), 4)
    resolution = event.get("resolution")
    if isinstance(resolution, str):
        output["origin"] = resolution
    return output


def _public_rhythm(rhythm: dict[str, object]) -> dict[str, object]:
    bpm = rhythm.get("bpm")
    grid_start = rhythm.get("grid_start_seconds")
    fit = rhythm.get("beat_fit_median_ms")
    if not isinstance(bpm, int | float) or not isinstance(grid_start, int | float):
        raise ValueError("rhythm metadata must contain BPM and grid start")
    interval = 60 / float(bpm)
    first_beat = float(grid_start) + max(0, math.ceil(-float(grid_start) / interval)) * interval
    output: dict[str, object] = {
        "bpm": round(float(bpm), 3),
        "first_beat_seconds": round(first_beat, 6),
        "beat_interval_seconds": round(interval, 9),
    }
    if isinstance(fit, int | float):
        output["beat_fit_median_ms"] = round(float(fit), 2)
    return output


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1_048_576), b""):
            digest.update(block)
    return digest.hexdigest()


def _write_json(path: Path, value: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

