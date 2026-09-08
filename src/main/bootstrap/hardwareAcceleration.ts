import { app } from 'electron';
import { readBootHardwareAcceleration } from '../../services/SettingsManager';

export function setupHardwareAcceleration(): void {
  try {
    const useHardwareAcceleration = readBootHardwareAcceleration();

    if (useHardwareAcceleration) {
      app.commandLine.appendSwitch('ignore-gpu-blocklist');
      app.commandLine.appendSwitch('enable-gpu-rasterization');
      app.commandLine.appendSwitch('enable-oop-rasterization');
      app.commandLine.appendSwitch('enable-zero-copy');
      app.commandLine.appendSwitch('disable-software-rasterizer');
    } else {
      app.disableHardwareAcceleration();
    }
  } catch (e) {
    console.error('Error setting up hardware acceleration switches:', e);
  }
}
