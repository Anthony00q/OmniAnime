export type NotificationSoundType = 'download' | 'success' | 'error' | 'info';

const DEFAULT_TYPE_VOLUMES: Record<NotificationSoundType, number> = {
  download: 0.55,
  success: 0.5,
  error: 0.6,
  info: 0.45,
};

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

// Contexto único: crear uno por clic agota el límite del navegador (~6) y
// deja sin sonido hasta reiniciar. Se reutiliza y se reanuda si está pausado.
let sharedCtx: AudioContext | null = null;
let activeOsc: OscillatorNode | null = null;

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

export function playNotificationSound(settings: any, type?: NotificationSoundType) {
  if (settings?.notificationsSound === false) return;
  if (type && settings?.soundEnabled?.[type] === false) return;

  const globalVolume = clamp01(settings?.soundVolume ?? 0.5);
  const typeVolume = type ? clamp01(settings?.soundProfiles?.[type] ?? DEFAULT_TYPE_VOLUMES[type]) : 1;
  const volume = globalVolume * typeVolume;
  if (volume <= 0) return;

  const audioCtx = getSharedContext();
  if (!audioCtx) {
    console.error('Web Audio API no soportado');
    return;
  }
  try {
    // Corta el pitido anterior para que el spam de clics no apile nodos
    try {
      activeOsc?.stop();
    } catch {}
    activeOsc = null;

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    activeOsc = oscillator;
    oscillator.onended = () => {
      try {
        oscillator.disconnect();
        gainNode.disconnect();
      } catch {}
      if (activeOsc === oscillator) activeOsc = null;
    };
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.error('Web Audio API no soportado', e);
  }
}
