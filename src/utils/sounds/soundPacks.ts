export type NotificationSoundType = 'download' | 'success' | 'error' | 'info';

export type SoundPackId = 'sala' | 'digital' | 'suave' | 'custom';

export interface SoundNote {
  freq: number;
  duration: number;
}

export interface SoundRecipe {
  wave: 'sine' | 'triangle' | 'square';
  notes: SoundNote[];
  gap: number;
  gain: number;
  attack: number;
  lowpassHz?: number;
}

export type SynthPackId = 'sala' | 'digital' | 'suave';

export const SOUND_PACK_IDS: readonly SynthPackId[] = ['sala', 'digital', 'suave'];

export const SOUND_PACK_CHOICES: readonly SoundPackId[] = ['sala', 'digital', 'suave', 'custom'];

export const DEFAULT_SOUND_PACK: SynthPackId = 'sala';

export const SOUND_PACK_LABELS: Record<SoundPackId, string> = {
  sala: 'Sala',
  digital: 'Digital',
  suave: 'Suave',
  custom: 'Personalizado',
};

export const SOUND_PACK_HINTS: Record<SoundPackId, string> = {
  sala: 'Cálido y contenido',
  digital: 'Corto y nítido',
  suave: 'Lento y tenue',
  custom: 'Elige o sube tu propio sonido',
};

export const DEFAULT_TYPE_VOLUMES: Record<NotificationSoundType, number> = {
  download: 0.55,
  success: 0.5,
  error: 0.6,
  info: 0.45,
};

const SOUND_PACKS: Record<SynthPackId, Record<NotificationSoundType, SoundRecipe>> = {
  sala: {
    download: { wave: 'triangle', notes: [{ freq: 622.25, duration: 0.08 }], gap: 0, gain: 1, attack: 0.005 },
    success: {
      wave: 'triangle',
      gain: 1,
      attack: 0.005,
      notes: [
        { freq: 523.25, duration: 0.09 },
        { freq: 783.99, duration: 0.14 },
      ],
      gap: 0.02,
    },
    error: {
      wave: 'sine',
      gain: 0.85,
      attack: 0.006,
      notes: [
        { freq: 246.94, duration: 0.12 },
        { freq: 246.94, duration: 0.12 },
      ],
      gap: 0.06,
    },
    info: { wave: 'triangle', notes: [{ freq: 493.88, duration: 0.12 }], gap: 0, gain: 1, attack: 0.005 },
  },
  digital: {
    download: {
      wave: 'square',
      notes: [{ freq: 880, duration: 0.065 }],
      gap: 0,
      gain: 0.5,
      attack: 0.004,
      lowpassHz: 2400,
    },
    success: {
      wave: 'square',
      gain: 0.5,
      attack: 0.004,
      lowpassHz: 2800,
      notes: [
        { freq: 783.99, duration: 0.065 },
        { freq: 1174.66, duration: 0.1 },
      ],
      gap: 0.015,
    },
    error: {
      wave: 'square',
      gain: 0.55,
      attack: 0.006,
      lowpassHz: 1100,
      notes: [
        { freq: 246.94, duration: 0.09 },
        { freq: 220, duration: 0.1 },
      ],
      gap: 0.05,
    },
    info: {
      wave: 'square',
      notes: [{ freq: 659.25, duration: 0.085 }],
      gap: 0,
      gain: 0.5,
      attack: 0.004,
      lowpassHz: 2000,
    },
  },
  suave: {
    download: { wave: 'sine', notes: [{ freq: 440, duration: 0.09 }], gap: 0, gain: 0.6, attack: 0.012 },
    success: {
      wave: 'sine',
      gain: 0.6,
      attack: 0.014,
      notes: [
        { freq: 392, duration: 0.11 },
        { freq: 587.33, duration: 0.18 },
      ],
      gap: 0.03,
    },
    error: {
      wave: 'sine',
      gain: 0.65,
      attack: 0.014,
      notes: [
        { freq: 220, duration: 0.12 },
        { freq: 196, duration: 0.14 },
      ],
      gap: 0.07,
    },
    info: { wave: 'sine', notes: [{ freq: 349.23, duration: 0.15 }], gap: 0, gain: 0.6, attack: 0.014 },
  },
};

export function normalizeSoundPack(value: unknown): SoundPackId {
  return typeof value === 'string' && (SOUND_PACK_CHOICES as readonly string[]).includes(value)
    ? (value as SoundPackId)
    : DEFAULT_SOUND_PACK;
}

export function getSoundRecipe(pack: unknown, type: NotificationSoundType): SoundRecipe {
  const id = normalizeSoundPack(pack);
  const synthId: SynthPackId = id === 'custom' ? DEFAULT_SOUND_PACK : (id as SynthPackId);
  return SOUND_PACKS[synthId][type];
}

export function shouldPlaySystemSound(settings: unknown): boolean {
  const s = (settings || {}) as {
    notificationsSound?: boolean;
    notificationSettings?: { showSystemMessages?: boolean };
  };
  if (s.notificationsSound === false) return false;
  if (s.notificationSettings?.showSystemMessages === false) return false;
  return true;
}
