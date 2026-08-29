"""Remove only the private Ritrace workspace used during production analysis."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path(".ritrace-work"))
    arguments = parser.parse_args()
    expected = (Path.cwd() / ".ritrace-work").resolve()
    workspace = arguments.workspace.resolve()
    if workspace != expected:
        raise ValueError("only the .ritrace-work directory may be removed")
    if workspace.exists():
        shutil.rmtree(workspace)
        print("private engine workspace removed")


if __name__ == "__main__":
    main()

