import { reportRendererError } from './rendererErrorReporting';
import {
  DEFAULT_TYPE_VOLUMES,
  getSoundRecipe,
  type NotificationSoundType,
  type SoundPackId,
  type SoundRecipe,
} from '../../utils/soundPacks';
import { parseSoundRef } from '../../utils/soundCatalog';
import { clampTrim } from '../../utils/soundTrim';
import { SOUND_CATALOG } from '../../utils/soundCatalogData';

export type { NotificationSoundType, SoundPackId };
export { DEFAULT_TYPE_VOLUMES };

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

const BUFFER_CACHE_MAX = 8;
const FADE_S = 0.005;

interface SliceWindow {
  startSec: number;
  sec: number;
}

let sharedCtx: AudioContext | null = null;
let activeOscs: Array<{ stop: () => void }> = [];
const bufferCache = new Map<string, AudioBuffer>();

function getSharedContext(): AudioContext | null {
  try {
    if (!sharedCtx) {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtor) return null;
      sharedCtx = new AudioCtor();
    }
    if (sharedCtx.state === 'suspended') void sharedCtx.resume();
    return sharedCtx;
  } catch {
    return null;
  }
}

function stopActive() {
  for (const node of activeOscs) {
    try {
      node.stop();
    } catch {}
  }
  activeOscs = [];
}

function cacheBuffer(key: string, buffer: AudioBuffer) {
  if (bufferCache.has(key)) bufferCache.delete(key);
  bufferCache.set(key, buffer);
  while (bufferCache.size > BUFFER_CACHE_MAX) {
    const oldest = bufferCache.keys().next().value;
    if (oldest === undefined) break;
    bufferCache.delete(oldest);
  }
}

function sliceBuffer(audioCtx: AudioContext, full: AudioBuffer, window: SliceWindow): AudioBuffer | null {
  try {
    const rate = full.sampleRate;
    const trimmed = clampTrim(window.startSec, window.sec, full.duration);
    const from = Math.min(full.length, Math.max(0, Math.round(trimmed.trimStartSec * rate)));
    const to = Math.min(full.length, from + Math.round(trimmed.trimSec * rate));
    const length = to - from;
    if (length <= 0) return null;
    const channels = Math.max(1, full.numberOfChannels);
    const out = audioCtx.createBuffer(channels, length, rate);
    for (let ch = 0; ch < channels; ch += 1) {
      const data = full.getChannelData(Math.min(ch, full.numberOfChannels - 1));
      const windowSamples = new Float32Array(length);
      windowSamples.set(data.subarray(from, to));
      out.copyToChannel(windowSamples, ch);
    }
    return out;
  } catch {
    return null;
  }
}

async function readAndDecode(audioCtx: AudioContext, ref: string): Promise<AudioBuffer | null> {
  try {
    const api = (window as any).api;
    if (!api?.invoke) return null;
    const res = await api.invoke('read-sound-data', ref);
    if (!res?.ok || !res.data || res.data.byteLength === 0) return null;
    const bytes: Uint8Array = res.data;
    const copy = new Uint8Array(bytes).buffer;
    const buffer = await audioCtx.decodeAudioData(copy);
    if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0) return null;
    return buffer;
  } catch {
    return null;
  }
}

async function loadBuffer(audioCtx: AudioContext, ref: string, window?: SliceWindow): Promise<AudioBuffer | null> {
  const key = window ? `${ref}#${window.startSec}x${window.sec}` : ref;
  const cached = bufferCache.get(key);
  if (cached) {
    cacheBuffer(key, cached);
    return cached;
  }
  const full = await readAndDecode(audioCtx, ref);
  if (!full) return null;
  let out: AudioBuffer | null = full;
  if (window) {
    out = sliceBuffer(audioCtx, full, window);
    if (!out) return null;
  }
  cacheBuffer(key, out);
  return out;
}

function gainTrimFor(ref: string): number {
  const parsed = parseSoundRef(ref);
  if (!parsed || parsed.kind !== 'sample') return 1;
  const entry = (SOUND_CATALOG as readonly { id: string; gainTrim: number }[]).find((s) => s.id === parsed.id);
  return entry && Number.isFinite(entry.gainTrim) && entry.gainTrim > 0 ? entry.gainTrim : 1;
}

function trimWindowFor(settings: any, ref: string): SliceWindow | undefined {
  const parsed = parseSoundRef(ref);
  if (!parsed || parsed.kind !== 'custom') return undefined;
  const files = settings?.customSoundFiles;
  const meta = Array.isArray(files)
    ? (files as Array<{ id: string; trimStartSec?: number; trimSec?: number; durationSec?: number }>).find(
        (f) => f?.id === parsed.id,
      )
    : null;
  if (!meta) return undefined;
  const trimmed = clampTrim(Number(meta.trimStartSec) || 0, Number(meta.trimSec) || 0, Number(meta.durationSec) || 0);
  return { startSec: trimmed.trimStartSec, sec: trimmed.trimSec };
}

function playRecipe(audioCtx: AudioContext, recipe: SoundRecipe, volume: number): void {
  let at = audioCtx.currentTime;
  for (const note of recipe.notes) {
    const oscillator = audioCtx.createOscillator() as OscillatorNode;
    const gainNode = audioCtx.createGain() as GainNode;

    oscillator.type = recipe.wave as OscillatorType;
    oscillator.frequency.setValueAtTime(note.freq, at);

    gainNode.gain.setValueAtTime(volume, at);
    gainNode.gain.exponentialRampToValueAtTime(0.001, at + note.duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const captured = oscillator as unknown as { stop: () => void; onended: (() => void) | null };
    captured.onended = () => {
      try {
        (oscillator as unknown as { disconnect: () => void }).disconnect();
        (gainNode as unknown as { disconnect: () => void }).disconnect();
      } catch {}
      activeOscs = activeOscs.filter((o) => o !== captured);
    };
    activeOscs.push(captured);
    oscillator.start(at);
    oscillator.stop(at + note.duration);

    at += note.duration + recipe.gap;
  }
}

function playBuffer(audioCtx: AudioContext, buffer: AudioBuffer, volume: number, window?: SliceWindow): void {
  const source = audioCtx.createBufferSource() as AudioBufferSourceNode;
  const gainNode = audioCtx.createGain() as GainNode;
  source.buffer = buffer;

  const at = audioCtx.currentTime;
  const offset = window ? window.startSec : 0;
  const length = window ? window.sec : buffer.duration;
  const end = at + length;
  const fadeStart = Math.max(at, end - FADE_S);
  gainNode.gain.setValueAtTime(volume, at);
  gainNode.gain.setValueAtTime(volume, fadeStart);
  gainNode.gain.linearRampToValueAtTime(0.001, end);

  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  const captured = source as unknown as { stop: () => void; onended: (() => void) | null };
  captured.onended = () => {
    try {
      (source as unknown as { disconnect: () => void }).disconnect();
      (gainNode as unknown as { disconnect: () => void }).disconnect();
    } catch {}
    activeOscs = activeOscs.filter((o) => o !== captured);
  };
  activeOscs.push(captured);
  source.start(at, offset, length);
  source.stop(end);
}

export function stopPreviewSound(): void {
  stopActive();
}

export function previewSoundSlice(buffer: AudioBuffer, startSec: number, sec: number, volume = 0.5): void {
  const audioCtx = getSharedContext();
  if (!audioCtx) {
    reportRendererError('ui:sound', 'Web Audio API no soportado');
    return;
  }
  if (!Number.isFinite(volume) || volume <= 0) return;
  stopActive();
  try {
    const trimmed = clampTrim(startSec, sec, buffer.duration);
    playBuffer(audioCtx, buffer, volume, { startSec: trimmed.trimStartSec, sec: trimmed.trimSec });
  } catch (e) {
    reportRendererError('ui:sound', e);
  }
}

export async function loadFullSoundBuffer(ref: string): Promise<AudioBuffer | null> {
  const audioCtx = getSharedContext();
  if (!audioCtx) return null;
  return readAndDecode(audioCtx, ref);
}

export function playNotificationSound(
  settings: any,
  type?: NotificationSoundType,
  refOverride?: string,
): void | Promise<void> {
  if (settings?.notificationsSound === false) return;
  if (type && settings?.soundEnabled?.[type] === false) return;

  const globalVolume = clamp01(settings?.soundVolume ?? 0.5);
  const typeVolume = type ? clamp01(settings?.soundProfiles?.[type] ?? DEFAULT_TYPE_VOLUMES[type]) : 1;
  const volume = globalVolume * typeVolume;
  if (volume <= 0) return;

  const audioCtx = getSharedContext();
  if (!audioCtx) {
    reportRendererError('ui:sound', 'Web Audio API no soportado');
    return;
  }

  stopActive();

  const assignedRef =
    refOverride ??
    (type && settings?.soundPack === 'custom' && settings?.soundCustom ? settings.soundCustom[type] : undefined);
  const parsed = parseSoundRef(assignedRef);

  const recipePack = (settings?.soundPack === 'custom' ? 'sala' : settings?.soundPack) as SoundPackId | undefined;
  const recipe = getSoundRecipe(recipePack, type ?? 'info');

  if (!parsed) {
    try {
      playRecipe(audioCtx, recipe, volume);
    } catch (e) {
      reportRendererError('ui:sound', e);
    }
    return;
  }

  const ref = assignedRef as string;
  const window = trimWindowFor(settings, ref);
  return (async () => {
    try {
      const buffer = await loadBuffer(audioCtx, ref, window);
      if (!buffer) {
        playRecipe(audioCtx, getSoundRecipe('sala', type ?? 'info'), volume);
        return;
      }
      playBuffer(audioCtx, buffer, volume * gainTrimFor(ref));
    } catch (e) {
      reportRendererError('ui:sound', e);
    }
  })();
}
