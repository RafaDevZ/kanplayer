"""Run Demucs and retain selected named stems in a stable output directory."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--stems", nargs="+", default=["drums", "vocals"])
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    parser.add_argument("--model", default="htdemucs")
    arguments = parser.parse_args()
    if not arguments.audio.is_file():
        raise FileNotFoundError(f"audio file not found: {arguments.audio}")
    if arguments.output.exists() and any(arguments.output.iterdir()):
        raise FileExistsError(f"output directory must be empty: {arguments.output}")
    arguments.output.mkdir(parents=True, exist_ok=True)
    work_dir = arguments.output / ".demucs-work"
    environment = os.environ.copy()
    environment["PYTHONIOENCODING"] = "utf-8"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "demucs",
            "--name",
            arguments.model,
            "--device",
            arguments.device,
            "--out",
            str(work_dir),
            str(arguments.audio),
        ],
        check=True,
        env=environment,
    )
    source_directory = work_dir / arguments.model / arguments.audio.stem
    missing: list[str] = []
    for stem in arguments.stems:
        source = source_directory / f"{stem}.wav"
        if not source.is_file():
            missing.append(source.name)
        else:
            shutil.copyfile(source, arguments.output / source.name)
    if missing:
        raise FileNotFoundError("Demucs did not produce: " + ", ".join(missing))
    shutil.rmtree(work_dir)
    print("stems written to " + str(arguments.output) + ": " + ", ".join(arguments.stems))


if __name__ == "__main__":
    main()

