import { app } from 'electron';

// Chromium adormece lo que no ve (timers, animaciones, audio) en ventanas minimizadas u
// ocultas; la app debe seguir viva en segundo plano, así que aquí no se le pide que se contenga.
export function setupBackgroundBehavior(): void {
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  // El tracker nativo de oclusión de Windows es el que da por tapada a la app: sin él,
  // los otros tres no tienen que frenar nada.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  // Sonar sin gesto previo: los avisos llegan con la app en segundo plano.
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
}
