// Contadores de escritura compartidos por las capas de filas.
let writeCount = 0;
let totalPersistMs = 0;

export function measure<T>(label: string, fn: () => T): T {
  const result = fn();
  if (
    label.includes('INSERT') ||
    label.includes('DELETE') ||
    label.toLowerCase().includes('transaction') ||
    label.includes('saveQueue')
  ) {
    writeCount++;
  }
  return result;
}

export function getWriteCount(): number {
  return writeCount;
}

export function getTotalPersistMs(): number {
  return totalPersistMs;
}

export function resetWriteCount(): void {
  writeCount = 0;
  totalPersistMs = 0;
}
