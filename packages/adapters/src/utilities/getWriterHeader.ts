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

/**
 * Gets the header attributes that name the writer of a derived object (SR,
 * SEG or RTSTRUCT): `Manufacturer`, `ManufacturerModelName` and
 * `SoftwareVersions`. A value in `options` wins over the default of
 * `DEFAULT_WRITER_HEADER`.
 */
export function getWriterHeader(
  options: Partial<WriterHeader> = {}
): WriterHeader {
  return {
    Manufacturer: options.Manufacturer || DEFAULT_WRITER_HEADER.Manufacturer,
    ManufacturerModelName:
      options.ManufacturerModelName ||
      DEFAULT_WRITER_HEADER.ManufacturerModelName,
    SoftwareVersions:
      options.SoftwareVersions || DEFAULT_WRITER_HEADER.SoftwareVersions,
  };
}
