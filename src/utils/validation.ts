/**
 * Validación de nombres de archivos/carpetas para Google Drive.
 *
 * Reglas:
 * - No vacío
 * - Máximo 255 caracteres
 * - Sin caracteres prohibidos: \ / : * ? " < > |
 */

export const FORBIDDEN_CHARS = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'] as const;
export const MAX_NAME_LENGTH = 255;

export interface NameValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Valida un nombre de archivo según las reglas de Google Drive.
 * Retorna { valid: true } si es válido, o { valid: false, error } si no.
 */
export function validateFileName(name: string): NameValidationResult {
  if (!name.trim()) {
    return { valid: false, error: 'El nombre no puede estar vacío' };
  }

  if (name.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `El nombre no puede tener más de ${MAX_NAME_LENGTH} caracteres` };
  }

  for (const char of FORBIDDEN_CHARS) {
    if (name.includes(char)) {
      return { valid: false, error: `El nombre no puede contener "${char}"` };
    }
  }

  return { valid: true, error: null };
}
