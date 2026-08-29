# Ritrace runtime

This directory is a self-contained, vendored copy of the Ritrace-clean audio
analysis core used by KanPlayer. It intentionally excludes Ritrace reports,
viewers, test artifacts, cached models, virtual environments and generated
outputs.

The pipeline is executed with `run_analysis.py` and produces only the public
artifacts consumed by KanPlayer later:

- `timestamps.json` — kick, snare and hihat event timestamps;
- `sync.json` — BPM, first beat and beat interval for timeline alignment.

The caller must provide two environments/assets that are machine-specific and
must not be committed to this repository:

- a Python environment with `requirements.txt` installed, used to run the
  MDX/event pipeline;
- a Python environment with Demucs installed, supplied through
  `--demucs-python`, plus the MDX23C 5-stem checkpoint supplied through
  `--checkpoint`.

Example:

```powershell
python tools/ritrace/run_analysis.py `
  --audio "C:\music\song.mp3" `
  --output "C:\temp\kanplayer-analysis" `
  --checkpoint "C:\models\drumsep_5stems_mdx23c_jarredou.ckpt" `
  --demucs-python "C:\venvs\demucs\Scripts\python.exe"
```

KanPlayer does not invoke this runner from the interface yet; the next step is
to expose it through a Tauri command and import the two resulting JSON files
into a timeline.
