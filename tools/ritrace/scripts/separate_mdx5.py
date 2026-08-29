"""Split an already isolated drum stem with the MDX23C five-stem model."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from mdxnet_infer.config import MDX23CConfig
from mdxnet_infer.inference import MDX23CInference

STEM_FILENAMES = {
    "kick": "kick.wav",
    "snare": "snare.wav",
    "toms": "toms.wav",
    "hh": "hihat.wav",
    "cymbals": "cymbals.wav",
}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", required=True, type=Path, help="isolated drums WAV")
    parser.add_argument("--output", required=True, type=Path, help="output directory")
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path("models/mdx5-weights/drumsep_5stems_mdx23c_jarredou.ckpt"),
        help="local MDX23C five-stem checkpoint",
    )
    parser.add_argument("--device", choices=("cuda", "cpu"), default="cuda")
    parser.add_argument(
        "--overlap",
        type=int,
        default=8,
        help="overlap between windows; 8 prioritizes boundary quality over speed",
    )
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    if not arguments.audio.is_file():
        raise FileNotFoundError(f"drum stem not found: {arguments.audio}")
    if not arguments.checkpoint.is_file():
        raise FileNotFoundError(f"MDX23C checkpoint not found: {arguments.checkpoint}")
    if arguments.overlap < 1:
        raise ValueError("--overlap must be at least 1")

    audio, sample_rate = sf.read(arguments.audio, always_2d=True, dtype="float32")
    if sample_rate != 44100:
        raise ValueError(
            f"MDX23C expects a 44.1 kHz drum stem; got {sample_rate} Hz from {arguments.audio}"
        )
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    elif audio.shape[1] > 2:
        audio = audio[:, :2]

    arguments.output.mkdir(parents=True, exist_ok=True)
    engine = MDX23CInference(
        model_path=arguments.checkpoint,
        config=MDX23CConfig.drumsep_5stem(),
        device=arguments.device,
    )
    separated = engine.separate(
        audio.T,
        sample_rate=sample_rate,
        batch_size=1,
        overlap=arguments.overlap,
        progress=True,
    )
    for stem_name, filename in STEM_FILENAMES.items():
        if stem_name not in separated:
            raise RuntimeError(f"MDX23C did not return the expected '{stem_name}' stem")
        stem = np.asarray(separated[stem_name], dtype=np.float32)
        if stem.ndim != 2:
            raise RuntimeError(f"unexpected shape for {stem_name}: {stem.shape}")
        if stem.shape[0] == 2:
            stem = stem.T
        sf.write(arguments.output / filename, stem, sample_rate, subtype="PCM_16")

    metadata = {
        "source_drums": str(arguments.audio),
        "checkpoint": str(arguments.checkpoint),
        "device": arguments.device,
        "overlap": arguments.overlap,
        "sample_rate": sample_rate,
        "stems": STEM_FILENAMES,
    }
    (arguments.output / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    print("MDX23C layers written: " + ", ".join(STEM_FILENAMES.values()))


if __name__ == "__main__":
    main()

