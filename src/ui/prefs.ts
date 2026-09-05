/**
 * Preferências persistidas entre sessões.
 *
 * Só entram aqui as escolhas ligadas ao equipamento e ao jeito de estudar do
 * usuário — alcance do teclado, modo espera, qual mão ele toca. Reconfigurá-las
 * a cada recarga irritaria rápido. O que é da peça (loop, velocidade) fica de
 * fora de propósito: pertence à peça, não ao usuário.
 */

const PREFIX = 'piano-tutor:';

export function readPref<T>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    // Modo privativo, cookies bloqueados, JSON corrompido: seguir com o padrão.
    return fallback;
  }
}

export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Persistir é conveniência, não requisito.
  }
}

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
