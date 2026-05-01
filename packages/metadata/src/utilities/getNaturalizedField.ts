/**
 * Reads an UpperCamelCase field from a NATURALIZED metadata object.
 *
 * `fieldName` must be the exact NATURALIZED key (UpperCamelCase DICOM-style
 * attribute name, for example `PhotometricInterpretation` or `NumberOfFrames`).
 * This helper does not perform any casing fallback.
 *
 * `defaultValue` is returned when the field (or indexed value) is unavailable.
 * `index` applies only to array values; non-array values require `index = 0`.
 */
export function getNaturalizedField<T = unknown>(
  naturalized: Record<string, unknown> | null | undefined,
  fieldName: string,
  defaultValue: T | undefined = undefined,
  index = 0
): unknown | T | undefined {
  if (!naturalized) {
    return defaultValue;
  }

  const value = naturalized[fieldName];
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (Array.isArray(value)) {
    const indexedValue = value[index];
    return indexedValue === undefined || indexedValue === null
      ? defaultValue
      : indexedValue;
  }

  if (index !== 0) {
    return defaultValue;
  }

  return value;
}

/**
 * Reads a NATURALIZED field as a string.
 */
export function getNaturalizedString(
  naturalized: Record<string, unknown> | null | undefined,
  fieldName: string,
  defaultValue: string | undefined = undefined,
  index = 0
): string | undefined {
  const value = getNaturalizedField(
    naturalized,
    fieldName,
    defaultValue,
    index
  );
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return String(value);
}

/**
 * Reads a NATURALIZED field as a finite number.
 */
export function getNaturalizedNumber(
  naturalized: Record<string, unknown> | null | undefined,
  fieldName: string,
  defaultValue: number | undefined = undefined,
  index = 0
): number | undefined {
  const value = getNaturalizedField(
    naturalized,
    fieldName,
    defaultValue,
    index
  );
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : defaultValue;
}
