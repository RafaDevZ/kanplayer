let context: AudioContext | undefined;
let source: MediaElementAudioSourceNode | undefined;
let analyser: AnalyserNode | undefined;
let mainOutputGain: GainNode | undefined;
let sourceAudio: HTMLAudioElement | undefined;
let spectrum: Uint8Array | undefined;
let spectrumSnapshot: { values: Uint8Array; sampleRate: number } | undefined;
let lastSpectrumReadAt = -Infinity;
let audioIsPlaying = false;
let removeAudioStateListeners: (() => void) | undefined;
const bandRangeCache = new Map<string, { start: number; end: number }>();
let vocalSource: MediaElementAudioSourceNode | undefined;
let vocalAnalyser: AnalyserNode | undefined;
let vocalSilenceGain: GainNode | undefined;
let vocalSamples: Uint8Array | undefined;
let vocalAudio: HTMLAudioElement | undefined;
let outputMode: "music" | "vocal" = "music";
let outputVolume = 0.7;

export const connectAudioAnalysis = (audio: HTMLAudioElement) => {
  if (sourceAudio === audio && analyser) return;
  try {
    removeAudioStateListeners?.();
    sourceAudio = audio;
    audioIsPlaying = !audio.paused && !audio.ended;
    const updateAudioState = () => {
      audioIsPlaying = !audio.paused && !audio.ended;
    };
    audio.addEventListener("play", updateAudioState);
    audio.addEventListener("pause", updateAudioState);
    audio.addEventListener("ended", updateAudioState);
    removeAudioStateListeners = () => {
      audio.removeEventListener("play", updateAudioState);
      audio.removeEventListener("pause", updateAudioState);
      audio.removeEventListener("ended", updateAudioState);
    };
    context ??= new AudioContext();
    source?.disconnect();
    analyser?.disconnect();
    mainOutputGain?.disconnect();
    source = context.createMediaElementSource(audio);
    analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    mainOutputGain = context.createGain();
    mainOutputGain.gain.value = outputMode === "music" ? 1 : 0;
    spectrum = new Uint8Array(analyser.frequencyBinCount);
    spectrumSnapshot = undefined;
    lastSpectrumReadAt = -Infinity;
    source.connect(analyser);
    analyser.connect(mainOutputGain);
    mainOutputGain.connect(context.destination);
  } catch {
    source = undefined;
    analyser = undefined;
    mainOutputGain = undefined;
    spectrum = undefined;
    spectrumSnapshot = undefined;
    removeAudioStateListeners?.();
    removeAudioStateListeners = undefined;
  }
};

export const resumeAudioAnalysis = () => {
  if (context?.state === "suspended") void context.resume();
};

export const readFrequencySpectrum = () => {
  if (!analyser || !spectrum) return undefined;
  // O cenário e o espectro podem solicitar os dados no mesmo frame. Reutilize
  // a leitura mais recente para evitar duas chamadas de FFT por frame.
  const now = performance.now();
  if (spectrumSnapshot && now - lastSpectrumReadAt < 12) return spectrumSnapshot;
  analyser.getByteFrequencyData(spectrum);
  spectrumSnapshot = {
    values: spectrum,
    sampleRate: context?.sampleRate ?? 44_100,
  };
  lastSpectrumReadAt = now;
  return spectrumSnapshot;
};

export const isAudioAnalysisPlaying = () => audioIsPlaying;

export const setAudioOutputMode = (mode: "music" | "vocal") => {
  outputMode = mode;
  if (!context) return;
  const at = context.currentTime;
  mainOutputGain?.gain.setTargetAtTime(mode === "music" ? 1 : 0, at, 0.015);
  vocalSilenceGain?.gain.setTargetAtTime(mode === "vocal" ? outputVolume : 0, at, 0.015);
};

export const setVocalOutputVolume = (volume: number) => {
  outputVolume = Math.max(0, Math.min(1, volume));
  if (!context || outputMode !== "vocal") return;
  vocalSilenceGain?.gain.setTargetAtTime(outputVolume, context.currentTime, 0.015);
};

export const connectVocalAnalysis = (audio: HTMLAudioElement) => {
  if (vocalAudio === audio && vocalAnalyser) return;
  try {
    vocalAudio = audio;
    context ??= new AudioContext();
    vocalSource?.disconnect();
    vocalAnalyser?.disconnect();
    vocalSilenceGain?.disconnect();
    vocalSource = context.createMediaElementSource(audio);
    vocalAnalyser = context.createAnalyser();
    vocalAnalyser.fftSize = 1024;
    vocalAnalyser.smoothingTimeConstant = 0.7;
    vocalSamples = new Uint8Array(vocalAnalyser.frequencyBinCount);
    vocalSilenceGain = context.createGain();
    vocalSilenceGain.gain.value = outputMode === "vocal" ? outputVolume : 0;
    vocalSource.connect(vocalAnalyser);
    // Mantém o grafo ativo para o AnalyserNode sem enviar o vocal ao mixer.
    vocalAnalyser.connect(vocalSilenceGain);
    vocalSilenceGain.connect(context.destination);
  } catch {
    vocalSource = undefined;
    vocalAnalyser = undefined;
    vocalSilenceGain = undefined;
    vocalSamples = undefined;
  }
};

export const readVocalIntensity = () => {
  if (!vocalAnalyser || !vocalSamples) return 0;
  vocalAnalyser.getByteFrequencyData(vocalSamples);
  let sum = 0;
  for (let index = 0; index < vocalSamples.length; index += 1) {
    const sample = vocalSamples[index] / 255;
    sum += sample * sample;
  }
  // Energia espectral RMS do vocal isolado. Isso não depende do volume do
  // player, que permanece em uma saída silenciosa separada.
  return Math.min(1, Math.sqrt(sum / vocalSamples.length) * 4);
};

export const getFrequencyBandIntensity = (minHz: number, maxHz: number) => {
  const data = readFrequencySpectrum();
  if (!data) return 0;
  return getFrequencyBandIntensityFromSpectrum(data, minHz, maxHz);
};

export const getFrequencyBandIntensityFromSpectrum = (
  data: { values: Uint8Array; sampleRate: number },
  minHz: number,
  maxHz: number,
) => {
  const nyquist = data.sampleRate / 2;
  const cacheKey = `${data.sampleRate}:${data.values.length}:${minHz}:${maxHz}`;
  let range = bandRangeCache.get(cacheKey);
  if (!range) {
    const start = Math.max(0, Math.min(data.values.length - 1, Math.floor((minHz / nyquist) * data.values.length)));
    const end = Math.max(start + 1, Math.min(data.values.length, Math.ceil((maxHz / nyquist) * data.values.length)));
    range = { start, end };
    // Limite defensivo para não reter combinações antigas quando o usuário
    // arrasta continuamente os limites da faixa.
    if (bandRangeCache.size >= 512) bandRangeCache.clear();
    bandRangeCache.set(cacheKey, range);
  }
  let total = 0;
  for (let index = range.start; index < range.end; index += 1) total += data.values[index] / 255;
  return total / Math.max(1, range.end - range.start);
};
