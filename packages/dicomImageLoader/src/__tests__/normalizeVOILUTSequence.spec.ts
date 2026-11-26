import normalizeVOILUTSequence from '../imageLoader/normalizeVOILUTSequence';

function toBase64(bytes: number[]): string {
  return Buffer.from(Uint8Array.from(bytes)).toString('base64');
}

describe('normalizeVOILUTSequence', () => {
  it('passes an already normalized (wadouri) LUT through', () => {
    expect(
      normalizeVOILUTSequence([
        { firstValueMapped: 10, numBitsPerEntry: 16, lut: [0, 128, 255] },
      ])
    ).toEqual({
      firstValueMapped: 10,
      numBitsPerEntry: 16,
      lut: [0, 128, 255],
    });
  });

  it('normalizes the naturalized dcmjs shape', () => {
    expect(
      normalizeVOILUTSequence({
        LUTDescriptor: [3, 10, 16],
        LUTData: [0, 128, 255],
      })
    ).toEqual({
      firstValueMapped: 10,
      numBitsPerEntry: 16,
      lut: [0, 128, 255],
    });
  });

  it('decodes 16 bit LUT Data from a buffer', () => {
    const lut = Uint16Array.from([0, 4096, 65535]);

    expect(
      normalizeVOILUTSequence({
        LUTDescriptor: [3, 10, 16],
        LUTData: lut.buffer,
      })?.lut
    ).toEqual([0, 4096, 65535]);
  });

  it('reads First Value Mapped with the pixel representation', () => {
    // A signed image with the descriptor written as US gives 64512 for -1024.
    // A count above 32767 written as SS gives a negative value.
    const item = { LUTDescriptor: [-32768, 64512, 8], LUTData: [0, 255] };

    expect(normalizeVOILUTSequence(item, 1)?.firstValueMapped).toBe(-1024);
    expect(normalizeVOILUTSequence(item, 0)?.firstValueMapped).toBe(64512);
    expect(normalizeVOILUTSequence(item, 1)?.lut).toEqual([0, 255]);
  });

  it('decodes 8 bit LUT Data as one entry per byte', () => {
    // LUT Descriptor value 3 is the width of an entry. Reading an 8 bit LUT as
    // 16 bit words gave half a LUT of nonsense
    const result = normalizeVOILUTSequence({
      LUTDescriptor: [4, 10, 8],
      LUTData: Uint8Array.from([0, 64, 128, 255]).buffer,
    });

    expect(result?.lut).toEqual([0, 64, 128, 255]);
    expect(result?.numBitsPerEntry).toBe(8);
  });

  it('decodes word-allocated 8 bit LUT Data as one entry per word', () => {
    // Two bytes for each entry, with the entry in the low byte (PS3.3 C.11.2.1)
    const bytes = [0, 0, 64, 0, 128, 0, 255, 0];

    expect(
      normalizeVOILUTSequence({
        LUTDescriptor: [4, 10, 8],
        LUTData: Uint8Array.from(bytes),
      })?.lut
    ).toEqual([0, 64, 128, 255]);
    expect(
      normalizeVOILUTSequence({
        '00283002': { Value: [4, 10, 8] },
        '00283006': { InlineBinary: toBase64(bytes) },
      })?.lut
    ).toEqual([0, 64, 128, 255]);
  });

  it('decodes InlineBinary with the declared entry width', () => {
    expect(
      normalizeVOILUTSequence({
        '00283002': { Value: [4, 10, 8] },
        '00283006': { InlineBinary: toBase64([0, 64, 128, 255]) },
      })?.lut
    ).toEqual([0, 64, 128, 255]);

    // Little endian 16 bit: 0x0000, 0x1000, 0xFFFF
    expect(
      normalizeVOILUTSequence({
        '00283002': { Value: [3, 10, 16] },
        '00283006': { InlineBinary: toBase64([0, 0, 0, 0x10, 0xff, 0xff]) },
      })?.lut
    ).toEqual([0, 4096, 65535]);
  });

  it('reinterprets a byte view of a 16 bit LUT', () => {
    expect(
      normalizeVOILUTSequence({
        LUTDescriptor: [3, 10, 16],
        LUTData: Uint8Array.from([0, 0, 0, 0x10, 0xff, 0xff]),
      })?.lut
    ).toEqual([0, 4096, 65535]);
  });

  it('trims to the data actually received', () => {
    // Descriptor value 1 of 0 means 65536 entries, which no real item that
    // short can hold
    expect(
      normalizeVOILUTSequence({
        LUTDescriptor: [0, 10, 16],
        LUTData: [0, 128, 255],
      })?.lut
    ).toEqual([0, 128, 255]);
  });

  it('returns undefined for items it cannot use', () => {
    expect(normalizeVOILUTSequence(undefined)).toBeUndefined();
    expect(normalizeVOILUTSequence([])).toBeUndefined();
    expect(normalizeVOILUTSequence({ LUTDescriptor: [3, 10] })).toBeUndefined();
    expect(
      normalizeVOILUTSequence({ LUTDescriptor: [3, 10, 16], LUTData: [] })
    ).toBeUndefined();
  });

  it('takes the first usable item of the sequence', () => {
    expect(
      normalizeVOILUTSequence([
        { LUTDescriptor: [3, 10] },
        { LUTDescriptor: [3, 20, 16], LUTData: [1, 2, 3] },
      ])
    ).toEqual({ firstValueMapped: 20, numBitsPerEntry: 16, lut: [1, 2, 3] });
  });
});
