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
    download: { wave: 'triangle', notes: [{ freq: 620, duration: 0.07 }], gap: 0 },
    success: {
      wave: 'triangle',
      notes: [
        { freq: 523.25, duration: 0.09 },
        { freq: 783.99, duration: 0.14 },
      ],
      gap: 0.02,
    },
    error: {
      wave: 'sine',
      notes: [
        { freq: 220, duration: 0.1 },
        { freq: 220, duration: 0.1 },
      ],
      gap: 0.06,
    },
    info: { wave: 'triangle', notes: [{ freq: 493.88, duration: 0.12 }], gap: 0 },
  },
  digital: {
    download: { wave: 'square', notes: [{ freq: 1046.5, duration: 0.04 }], gap: 0 },
    success: {
      wave: 'square',
      notes: [
        { freq: 880, duration: 0.05 },
        { freq: 1318.5, duration: 0.08 },
      ],
      gap: 0.015,
    },
    error: {
      wave: 'square',
      notes: [
        { freq: 180, duration: 0.07 },
        { freq: 180, duration: 0.07 },
      ],
      gap: 0.05,
    },
    info: { wave: 'square', notes: [{ freq: 659.25, duration: 0.06 }], gap: 0 },
  },
  suave: {
    download: { wave: 'sine', notes: [{ freq: 440, duration: 0.09 }], gap: 0 },
    success: {
      wave: 'sine',
      notes: [
        { freq: 392, duration: 0.11 },
        { freq: 587.33, duration: 0.18 },
      ],
      gap: 0.03,
    },
    error: {
      wave: 'sine',
      notes: [
        { freq: 196, duration: 0.12 },
        { freq: 174.61, duration: 0.14 },
      ],
      gap: 0.07,
    },
    info: { wave: 'sine', notes: [{ freq: 349.23, duration: 0.15 }], gap: 0 },
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
