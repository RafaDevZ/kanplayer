"""Resolve reliable local kick and snare sequences using raw onset evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ALLOWED_CLASSES = {"kick", "snare"}
MATCH_TOLERANCE_SECONDS = 0.02


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", required=True, type=Path)
    parser.add_argument("--sequences", required=True, type=Path)
    parser.add_argument("--audit-output", required=True, type=Path)
    parser.add_argument("--apply", action="store_true")
    arguments = parser.parse_args()
    payload = _load_object(arguments.events)
    sequence_payload = _load_object(arguments.sequences)
    events = payload.get("events")
    raw_onsets = payload.get("raw_onsets")
    sequences = sequence_payload.get("sequences")
    if (
        not isinstance(events, list)
        or not isinstance(raw_onsets, dict)
        or not isinstance(sequences, list)
    ):
        raise ValueError("events and sequence files have an invalid shape")

    additions, removals, audit = _resolve(events, raw_onsets, sequences)
    removed_ids = {id(event) for event in removals}
    updated_events = [event for event in events if id(event) not in removed_ids] + additions
    summary = {
        "validated_sequences": len(audit),
        "recovered_events": len(additions),
        "removed_intruders": len(removals),
        "mode": "applied" if arguments.apply else "audit_only",
    }
    arguments.audit_output.parent.mkdir(parents=True, exist_ok=True)
    arguments.audit_output.write_text(
        json.dumps({"summary": summary, "sequences": audit}, indent=2) + "\n",
        encoding="utf-8",
    )
    if arguments.apply:
        payload["events"] = sorted(updated_events, key=lambda event: float(event["time_seconds"]))
        payload["sequence_resolution"] = summary
        arguments.events.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print("sequence resolution audit written to " + str(arguments.audit_output))
    print(json.dumps(summary))


def _load_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain an object")
    return value


def _resolve(
    events: list[object], raw_onsets: dict[str, object], sequences: list[object]
) -> tuple[list[dict[str, object]], list[object], list[dict[str, object]]]:
    additions: list[dict[str, object]] = []
    removals: list[object] = []
    audit: list[dict[str, object]] = []
    for sequence in sequences:
        if not isinstance(sequence, dict):
            continue
        class_name = sequence.get("class_name")
        anchors = sequence.get("anchor_times_seconds")
        if class_name not in ALLOWED_CLASSES or not isinstance(anchors, list) or len(anchors) < 3:
            continue
        times = [float(time) for time in anchors if isinstance(time, int | float)]
        direct_anchors = sum(_has_event(events, class_name, time) for time in times)
        if len(times) < 3 or direct_anchors < 2:
            continue
        recovered = _recover_internal_gaps(events, raw_onsets, sequence, times)
        intruders = _find_intruders(events, class_name, sequence, times)
        additions.extend(recovered)
        removals.extend(intruders)
        audit.append(
            {
                "class_name": class_name,
                "start_seconds": sequence.get("start_seconds"),
                "end_seconds": sequence.get("end_seconds"),
                "subdivision": sequence.get("subdivision"),
                "anchors": len(times),
                "direct_anchors": direct_anchors,
                "recovered_times_seconds": [event["time_seconds"] for event in recovered],
                "removed_intruder_times_seconds": [
                    round(float(event["time_seconds"]), 4)
                    for event in intruders
                    if isinstance(event, dict)
                ],
            }
        )
    return additions, removals, audit


def _recover_internal_gaps(
    events: list[object],
    raw_onsets: dict[str, object],
    sequence: dict[str, object],
    times: list[float],
) -> list[dict[str, object]]:
    class_name = str(sequence["class_name"])
    additions: list[dict[str, object]] = []
    for index in range(1, len(times) - 1):
        current = times[index]
        if _has_event(events, class_name, current):
            continue
        has_left_anchor = any(
            _has_event(events, class_name, anchor) for anchor in times[:index]
        )
        has_right_anchor = any(
            _has_event(events, class_name, anchor) for anchor in times[index + 1 :]
        )
        if not (has_left_anchor and has_right_anchor):
            continue
        raw = _matching_raw(raw_onsets.get(class_name), current)
        if raw is None:
            continue
        additions.append(
            {
                "class_name": class_name,
                "time_seconds": round(current, 4),
                "confidence": raw["confidence"],
                "resolution": "recovered_from_sequence",
                "sequence_subdivision": sequence.get("subdivision"),
                "sequence_ioi_ms": sequence.get("expected_ioi_ms"),
            }
        )
    return additions


def _find_intruders(
    events: list[object],
    class_name: object,
    sequence: dict[str, object],
    anchors: list[float],
) -> list[object]:
    start = float(sequence["start_seconds"])
    end = float(sequence["end_seconds"])
    tolerance = float(sequence["tolerance_ms"]) / 1_000
    intruders: list[object] = []
    for event in events:
        if not isinstance(event, dict) or event.get("class_name") != class_name:
            continue
        time = float(event.get("time_seconds", -99))
        if not start < time < end or _matches_anchor(anchors, time):
            continue
        previous, following = _surrounding_anchors(anchors, time)
        if previous is None or following is None:
            continue
        if time - previous > tolerance and following - time > tolerance:
            intruders.append(event)
    return intruders


def _surrounding_anchors(anchors: list[float], time: float) -> tuple[float | None, float | None]:
    previous = max((anchor for anchor in anchors if anchor < time), default=None)
    following = min((anchor for anchor in anchors if anchor > time), default=None)
    return previous, following


def _matches_anchor(anchors: list[float], time: float) -> bool:
    return any(abs(anchor - time) <= MATCH_TOLERANCE_SECONDS for anchor in anchors)


def _has_event(events: list[object], class_name: object, time: float) -> bool:
    return any(
        isinstance(event, dict)
        and event.get("class_name") == class_name
        and abs(float(event.get("time_seconds", -99)) - time) <= MATCH_TOLERANCE_SECONDS
        for event in events
    )


def _matching_raw(raw_events: object, time: float) -> dict[str, object] | None:
    if not isinstance(raw_events, list):
        return None
    for event in raw_events:
        if (
            isinstance(event, dict)
            and abs(float(event.get("time_seconds", -99)) - time) <= MATCH_TOLERANCE_SECONDS
        ):
            return event
    return None


if __name__ == "__main__":
    main()

