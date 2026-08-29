"""Run the vendored Ritrace analysis pipeline for one audio file.

This is intentionally a local runner: it only writes the public Ritrace
artifacts (timestamps.json and sync.json) to the directory supplied by the
caller. Intermediate audio stems live in a temporary workspace and are removed
when the run ends.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SCRIPTS = ROOT / "scripts"
CONFIGS = ROOT / "configs"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the vendored Ritrace pipeline")
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--checkpoint", required=True, type=Path)
    parser.add_argument("--device", choices=("cuda", "cpu"), default="cuda")
    parser.add_argument("--demucs-python", default=sys.executable)
    parser.add_argument("--mdx-overlap", type=int, default=8)
    parser.add_argument("--kick-min-confidence", type=float, default=0)
    parser.add_argument("--snare-min-confidence", type=float, default=0)
    parser.add_argument("--hihat-min-confidence", type=float, default=0)
    return parser.parse_args()


def progress(stage: str, percent: int, started_at: float) -> None:
    elapsed_seconds = time.monotonic() - started_at
    remaining_seconds = (
        elapsed_seconds * (100 - percent) / percent if percent > 0 else None
    )
    payload = {
        "stage": stage,
        "percent": percent,
        "elapsed_seconds": round(elapsed_seconds, 1),
        "remaining_seconds": round(remaining_seconds, 1)
        if remaining_seconds is not None
        else None,
    }
    print(f"RITRACE_PROGRESS:{json.dumps(payload)}", flush=True)


def run(command: list[str]) -> None:
    subprocess.run(command, check=True, cwd=ROOT)


def filter_events(events_path: Path, minimum_confidence: dict[str, float]) -> None:
    payload = json.loads(events_path.read_text(encoding="utf-8"))
    payload["events"] = [
        event
        for event in payload.get("events", [])
        if float(event.get("confidence", 0))
        >= minimum_confidence.get(str(event.get("class_name")), 0)
    ]
    events_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> None:
    arguments = parse_arguments()
    audio = arguments.audio.resolve()
    output = arguments.output.resolve()
    checkpoint = arguments.checkpoint.resolve()

    if not audio.is_file():
        raise FileNotFoundError(f"audio file not found: {audio}")
    if not checkpoint.is_file():
        raise FileNotFoundError(f"MDX checkpoint not found: {checkpoint}")
    minimum_confidence = {
        "kick": arguments.kick_min_confidence,
        "snare": arguments.snare_min_confidence,
        "hihat": arguments.hihat_min_confidence,
    }
    if any(value < 0 or value > 1 for value in minimum_confidence.values()):
        raise ValueError("confidence values must be between 0 and 1")

    output.mkdir(parents=True, exist_ok=True)
    started_at = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="kanplayer-ritrace-") as temporary_directory:
        workspace = Path(temporary_directory)
        stems = workspace / "demucs"
        layers = workspace / "layers"
        events = workspace / "events.json"
        sequences = workspace / "sequence-audit.json"
        sequence_resolution = workspace / "sequence-resolution-audit.json"
        kick_audit = workspace / "kick-collision-audit.json"

        progress("Separando bateria e vocais", 0, started_at)
        run([
            arguments.demucs_python,
            str(SCRIPTS / "separate_stems.py"),
            "--audio", str(audio), "--output", str(stems), "--device", arguments.device,
        ])
        progress("Separando kick, snare e hihat", 15, started_at)
        run([
            sys.executable,
            str(SCRIPTS / "separate_mdx5.py"),
            "--audio", str(stems / "drums.wav"), "--output", str(layers),
            "--checkpoint", str(checkpoint), "--device", arguments.device,
            "--overlap", str(arguments.mdx_overlap),
        ])
        progress("Detectando eventos de bateria", 50, started_at)
        run([
            sys.executable,
            str(SCRIPTS / "extract_drum_events.py"),
            "--layers", str(layers), "--output", str(events),
            "--config", str(CONFIGS / "onsets.yaml"),
        ])
        progress("Analisando sequências", 75, started_at)
        run([sys.executable, str(SCRIPTS / "analyze_sequences.py"), "--events", str(events), "--output", str(sequences)])
        progress("Resolvendo sequências", 83, started_at)
        progress("Resolvendo colisões de kick", 90, started_at)
        run([
            sys.executable, str(SCRIPTS / "resolve_sequences.py"),
            "--events", str(events), "--sequences", str(sequences),
            "--audit-output", str(sequence_resolution), "--apply",
        ])
        progress("Filtrando eventos por fidelidade", 95, started_at)
        filter_events(events, minimum_confidence)
        progress("Exportando resultado", 97, started_at)
        run([
            sys.executable, str(SCRIPTS / "resolve_kick_collisions.py"),
            "--layers", str(layers), "--events", str(events),
            "--config", str(CONFIGS / "kick-resolution.yaml"),
            "--audit-output", str(kick_audit), "--apply",
        ])
        run([
            sys.executable, str(SCRIPTS / "export_engine_result.py"),
            "--audio", str(audio), "--events", str(events),
            "--timestamps-output", str(output / "timestamps.json"),
            "--sync-output", str(output / "sync.json"),
        ])
        progress("Concluído", 100, started_at)


if __name__ == "__main__":
    main()
