export const getStatusStyles = (status: string | undefined) => {
  const s = status?.toLowerCase() || '';
  if (s.includes('emisión') || s.includes('emision') || s.includes('emitiendo')) {
    return {
      bgContainer: 'bg-success/20',
      borderContainer: 'border-success/30',
      dotBg: 'bg-success',
      text: 'text-success',
    };
  }
  if (s.includes('finalizado') || s.includes('terminado')) {
    return {
      bgContainer: 'bg-destructive/20',
      borderContainer: 'border-destructive/30',
      dotBg: 'bg-destructive-fg',
      text: 'text-destructive-fg',
    };
  }
  if (s.includes('próximamente') || s.includes('proximamente') || s.includes('espera')) {
    return {
      bgContainer: 'bg-warning/20',
      borderContainer: 'border-warning/30',
      dotBg: 'bg-warning',
      text: 'text-warning',
    };
  }
  return {
    bgContainer: 'bg-primary/20',
    borderContainer: 'border-primary/30',
    dotBg: 'bg-primary',
    text: 'text-primary',
  };
};
