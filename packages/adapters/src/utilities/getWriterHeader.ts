import { version } from '../version';

export type WriterHeader = {
  Manufacturer: string;
  ManufacturerModelName: string;
  SoftwareVersions: string | string[];
};

/** The writer header that the adapters use when the caller gives no value. */
export const DEFAULT_WRITER_HEADER: Readonly<WriterHeader> = {
  Manufacturer: 'CornerstoneJS',
  ManufacturerModelName: '@cornerstonejs/adapters',
  SoftwareVersions: version,
};

const valueOr = <T>(value: T | null | undefined, fallback: T): T =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && !value.length)
    ? fallback
    : value;

/**
 * Gets the header attributes that name the writer of a derived object (SR,
 * SEG or RTSTRUCT): `Manufacturer`, `ManufacturerModelName` and
 * `SoftwareVersions`. A value in `options` wins over the default of
 * `DEFAULT_WRITER_HEADER`. An empty value (`undefined`, `null`, `''` or `[]`)
 * gets the default. Every writer uses this function, so all of them apply the
 * same rule.
 *
 * Each instance names the software that wrote it. A revision that is saved
 * into an existing series does not copy the writer of the predecessor, so
 * the instances of one series can name different writers.
 */
export function getWriterHeader(
  options: Partial<WriterHeader> = {}
): WriterHeader {
  return {
    Manufacturer: valueOr(
      options.Manufacturer,
      DEFAULT_WRITER_HEADER.Manufacturer
    ),
    ManufacturerModelName: valueOr(
      options.ManufacturerModelName,
      DEFAULT_WRITER_HEADER.ManufacturerModelName
    ),
    SoftwareVersions: valueOr(
      options.SoftwareVersions,
      DEFAULT_WRITER_HEADER.SoftwareVersions
    ),
  };
}
