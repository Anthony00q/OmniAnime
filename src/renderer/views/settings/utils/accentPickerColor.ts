import { parseColor, type Color } from 'react-aria-components';

export function resolveAccentPickerColor(current: Color, hex: string): Color {
  return current.toString('hex').toLowerCase() === hex.toLowerCase() ? current : parseColor(hex).toFormat('hsb');
}

export function preserveAccentHue(next: Color, previous: Color): Color {
  if (next.getColorSpace() === 'hsb') return next;
  let color = next.toFormat('hsb');
  if (color.getChannelValue('saturation') === 0 || color.getChannelValue('brightness') === 0) {
    color = color.withChannelValue('hue', previous.toFormat('hsb').getChannelValue('hue'));
  }
  if (color.getChannelValue('brightness') === 0) {
    color = color.withChannelValue('saturation', previous.toFormat('hsb').getChannelValue('saturation'));
  }
  return color;
}
