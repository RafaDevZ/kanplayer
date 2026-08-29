"""Find locally regular kick and snare sequences from raw onset candidates."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

MATCH_TOLERANCE_SECONDS = 0.02
SUBDIVISIONS = {"1/16": 4, "1/24_triplet": 6, "1/32": 8}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    arguments = parser.parse_args()
    payload: dict[str, Any] = json.loads(arguments.events.read_text(encoding="utf-8"))
    rhythm = payload.get("rhythm")
    raw_onsets = payload.get("raw_onsets")
    final_events = payload.get("events")
    if not isinstance(rhythm, dict) or not isinstance(raw_onsets, dict):
        raise ValueError("events JSON must contain rhythm and raw_onsets")
    if not isinstance(final_events, list):
        raise ValueError("events JSON must contain events")
    bpm = rhythm.get("bpm")
    if not isinstance(bpm, int | float):
        raise ValueError("rhythm BPM is missing")

    sequences: list[dict[str, object]] = []
    for class_name in ("kick", "snare"):
        raw_events = raw_onsets.get(class_name)
        if isinstance(raw_events, list):
            sequences.extend(_find_sequences(class_name, raw_events, final_events, float(bpm)))
    sequences.sort(key=lambda item: (float(item["start_seconds"]), str(item["class_name"])))
    result = {"bpm": round(float(bpm), 3), "sequence_count": len(sequences), "sequences": sequences}
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    by_class = {
        name: sum(item["class_name"] == name for item in sequences)
        for name in ("kick", "snare")
    }
    print("sequence audit written to " + str(arguments.output) + " " + str(by_class))


def _find_sequences(
    class_name: str, raw_events: list[object], final_events: list[object], bpm: float
) -> list[dict[str, object]]:
    times = sorted(
        float(event["time_seconds"])
        for event in raw_events
        if isinstance(event, dict) and isinstance(event.get("time_seconds"), int | float)
    )
    candidates: list[dict[str, object]] = []
    for subdivision, steps_per_beat in SUBDIVISIONS.items():
        expected = 60 / bpm / steps_per_beat
        tolerance = max(0.008, expected * 0.16)
        for start in times:
            anchors = _follow_cadence(times, start, expected, tolerance)
            if len(anchors) >= 3:
                candidates.append(
                    _sequence(class_name, subdivision, expected, tolerance, anchors, final_events)
                )
    return _select_nonredundant(candidates)


def _follow_cadence(
    times: list[float], start: float, expected: float, tolerance: float
) -> list[float]:
    anchors = [start]
    target = start + expected
    while True:
        match = _closest_time(times, target, tolerance)
        if match is None or match <= anchors[-1]:
            return anchors
        anchors.append(match)
        target = match + expected


def _closest_time(times: list[float], target: float, tolerance: float) -> float | None:
    candidates = [time for time in times if abs(time - target) <= tolerance]
    return min(candidates, key=lambda time: abs(time - target), default=None)


def _sequence(
    class_name: str,
    subdivision: str,
    expected: float,
    tolerance: float,
    anchors: list[float],
    final_events: list[object],
) -> dict[str, object]:
    pairs = zip(anchors, anchors[1:], strict=False)
    iois_ms = [round((right - left) * 1_000, 2) for left, right in pairs]
    errors_ms = [
        round(abs((right - left) - expected) * 1_000, 2)
        for left, right in zip(anchors, anchors[1:], strict=False)
    ]
    matching_final = sum(_has_event(final_events, class_name, time) for time in anchors)
    return {
        "class_name": class_name,
        "subdivision": subdivision,
        "expected_ioi_ms": round(expected * 1_000, 2),
        "tolerance_ms": round(tolerance * 1_000, 2),
        "start_seconds": round(anchors[0], 4),
        "end_seconds": round(anchors[-1], 4),
        "anchor_times_seconds": [round(time, 4) for time in anchors],
        "iois_ms": iois_ms,
        "max_ioi_error_ms": max(errors_ms),
        "raw_onsets": len(anchors),
        "final_events_present": matching_final,
        "discarded_raw_onsets": len(anchors) - matching_final,
    }


def _select_nonredundant(candidates: list[dict[str, object]]) -> list[dict[str, object]]:
    selected: list[dict[str, object]] = []
    ordered = sorted(
        candidates,
        key=lambda item: (
            -int(item["raw_onsets"]),
            float(item["max_ioi_error_ms"]),
            float(item["start_seconds"]),
        ),
    )
    for candidate in ordered:
        anchors = set(candidate["anchor_times_seconds"])
        if any(
            current["class_name"] == candidate["class_name"]
            and len(anchors.intersection(current["anchor_times_seconds"])) >= 2
            for current in selected
        ):
            continue
        selected.append(candidate)
    return selected


def _has_event(events: list[object], class_name: str, time: float) -> bool:
    return any(
        isinstance(event, dict)
        and event.get("class_name") == class_name
        and abs(float(event.get("time_seconds", -99)) - time) <= MATCH_TOLERANCE_SECONDS
        for event in events
    )


if __name__ == "__main__":
    main()

