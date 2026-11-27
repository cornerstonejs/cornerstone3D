interface CPUFallbackLUT {
  lut: number[];
  id?: string;
  /** The stored value the first LUT entry maps, from LUT Descriptor (0028,3002) */
  firstValueMapped?: number;
  /** Bits per LUT entry, from LUT Descriptor (0028,3002) */
  numBitsPerEntry?: number;
}

export type { CPUFallbackLUT as default };
