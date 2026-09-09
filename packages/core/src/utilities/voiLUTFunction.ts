import VOILUTFunctionType from '../enums/VOILUTFunctionType';

/**
 * The values of VOI LUT Function (0028,1056) that DICOM defines, mapped to the
 * enum members cornerstone uses internally. `SAMPLED_SIGMOID` has the string
 * value `SIGMOID`, so both the DICOM defined term and the enum key resolve to
 * the same member.
 *
 * See https://dicom.nema.org/medical/dicom/current/output/html/part03.html#sect_C.11.2.1.3
 */
const definedTerms = new Map<string, VOILUTFunctionType>([
  ['LINEAR', VOILUTFunctionType.LINEAR],
  ['LINEAR_EXACT', VOILUTFunctionType.LINEAR_EXACT],
  ['SIGMOID', VOILUTFunctionType.SAMPLED_SIGMOID],
  ['SAMPLED_SIGMOID', VOILUTFunctionType.SAMPLED_SIGMOID],
]);

const warnedValues = new Set<string>();

/**
 * Normalizes a raw VOI LUT Function (0028,1056) value into a
 * {@link VOILUTFunctionType}.
 *
 * The value reaches us in a few different shapes depending on which metadata
 * provider produced it: dicom-parser returns a `string`, DICOMweb JSON returns
 * a single element `Value` array, and some providers hand back the whole
 * multi-valued array. It is a CS attribute, so it can also arrive padded with
 * whitespace or a trailing null, and in the wrong case.
 *
 * Note that indexing a `string` (`value[0]`) yields its first *character*, so
 * treating the string shape as an array silently produces `'S'` for
 * `'SIGMOID'`, which caused the "Invalid VOI LUT function" throw reported in
 * cornerstone3D#2844.
 *
 * @param value - the raw attribute value from a metadata provider
 * @returns the matching VOILUTFunctionType, or undefined when the value is
 * absent or not a DICOM defined term.
 */
function normalizeVOILUTFunction(
  value: unknown
): VOILUTFunctionType | undefined {
  const raw = Array.isArray(value)
    ? value.find((item) => typeof item === 'string' && item.trim() !== '')
    : value;

  if (typeof raw !== 'string') {
    return undefined;
  }

  // CS values may be padded with spaces or a null byte, and are case
  // insensitive in practice even though the standard defines them uppercase.
  const cleaned = raw.replace(/\0/g, '').trim().toUpperCase();

  if (cleaned === '') {
    return undefined;
  }

  return definedTerms.get(cleaned);
}

/**
 * Same as {@link normalizeVOILUTFunction} but always resolves to a usable
 * value, falling back to `LINEAR` (the DICOM default when the attribute is
 * absent) for anything unrecognized. An unrecognized non-empty value is warned
 * about once so bad metadata is still noticeable, but it never throws: a VOI
 * LUT Function we do not know about should degrade to a linear window rather
 * than break rendering.
 *
 * @param value - the raw attribute value from a metadata provider
 * @returns a valid VOILUTFunctionType
 */
function getValidVOILUTFunction(value: unknown): VOILUTFunctionType {
  const normalized = normalizeVOILUTFunction(value);

  if (normalized) {
    return normalized;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const key = value.trim();
    if (!warnedValues.has(key)) {
      warnedValues.add(key);
      console.warn(
        `Unsupported VOI LUT Function "${key}", falling back to LINEAR`
      );
    }
  }

  return VOILUTFunctionType.LINEAR;
}

export { normalizeVOILUTFunction, getValidVOILUTFunction };
