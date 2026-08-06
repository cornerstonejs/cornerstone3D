import { describe, it, expect } from '@jest/globals';
import {
  RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
  EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID,
  getBitmapFramesFromDataset,
  bitPackBinaryFrame,
  unpackBinaryFrameFromPacked,
  decodeSegFramesFromMultiframe,
  getSegNumberOfFramesFromDataset,
  encodeFramesToTransferSyntax,
} from '../src/adapters/Cornerstone3D/encodePixelData';

/**
 * Minimal PackBits (DICOM RLE) decoder used to inspect encoder output directly,
 * independent of the production decode path. Decodes until `expectedLength`
 * output bytes are produced so trailing even-length padding is ignored.
 */
function packBitsDecode(bytes, signed, start, end, expectedLength) {
  const out = [];
  let i = start;

  while (out.length < expectedLength && i < end) {
    const n = signed[i++];

    if (n >= 0) {
      for (let k = 0; k < n + 1 && out.length < expectedLength; k++) {
        out.push(bytes[i++]);
      }
    } else if (n >= -127) {
      const value = bytes[i++];
      for (let k = 0; k < -n + 1 && out.length < expectedLength; k++) {
        out.push(value);
      }
    }
    // n === -128 is a no-op per the PackBits spec.
  }

  return Uint8Array.from(out);
}

/** Splits one RLE frame buffer into its decoded byte-plane segments. */
function decodeRleSegments(arrayBuffer, expectedLength) {
  const bytes = new Uint8Array(arrayBuffer);
  const signed = new Int8Array(arrayBuffer);
  const dataView = new DataView(arrayBuffer);
  const numSegments = dataView.getInt32(0, true);
  const offsets = [];

  for (let s = 0; s < numSegments; s++) {
    offsets.push(dataView.getInt32((s + 1) * 4, true));
  }

  const segments = [];
  for (let s = 0; s < numSegments; s++) {
    const start = offsets[s];
    const end = s + 1 < numSegments ? offsets[s + 1] : bytes.length;
    segments.push(packBitsDecode(bytes, signed, start, end, expectedLength));
  }

  return segments;
}

describe('encodePixelData - binary frame bit packing', () => {
  it('round-trips a binary frame through bitPack/unpack', () => {
    const samplesPerFrame = 37; // not a multiple of 8, exercises the tail byte
    const frame = new Uint8Array(samplesPerFrame);
    for (let i = 0; i < samplesPerFrame; i++) {
      frame[i] = i % 3 === 0 ? 1 : 0;
    }

    const packed = bitPackBinaryFrame(frame);
    expect(packed.length).toBe(Math.ceil(samplesPerFrame / 8));

    const unpacked = unpackBinaryFrameFromPacked(packed, samplesPerFrame);
    expect(Array.from(unpacked)).toEqual(Array.from(frame));
  });
});

describe('getSegNumberOfFramesFromDataset', () => {
  it('prefers NumberOfFrames', () => {
    expect(getSegNumberOfFramesFromDataset({ NumberOfFrames: 5 })).toBe(5);
  });

  it('falls back to PerFrameFunctionalGroupsSequence length', () => {
    expect(
      getSegNumberOfFramesFromDataset({
        PerFrameFunctionalGroupsSequence: [{}, {}, {}],
      })
    ).toBe(3);
  });

  it('defaults to 1', () => {
    expect(getSegNumberOfFramesFromDataset({})).toBe(1);
  });
});

describe('getBitmapFramesFromDataset', () => {
  const baseDataset = { NumberOfFrames: 2, Rows: 2, Columns: 2 };

  it('reads a byte-per-pixel (pre-bitpack) 1-bit layout and normalizes to 0/1', () => {
    const { frames, bitsAllocated } = getBitmapFramesFromDataset({
      ...baseDataset,
      BitsAllocated: 1,
      PixelData: new Uint8Array([0, 255, 0, 1, 1, 1, 0, 0]),
    });

    expect(bitsAllocated).toBe(1);
    expect(Array.from(frames[0])).toEqual([0, 1, 0, 1]);
    expect(Array.from(frames[1])).toEqual([1, 1, 0, 0]);
  });

  it('reads a per-frame-aligned packed 1-bit layout', () => {
    // byte0 bits LSB-first: pixel0=1, pixel2=1 -> 0b0101 = 5
    // byte1 bits LSB-first: pixel1=1, pixel3=1 -> 0b1010 = 10
    const { frames } = getBitmapFramesFromDataset({
      ...baseDataset,
      BitsAllocated: 1,
      PixelData: new Uint8Array([5, 10]),
    });

    expect(Array.from(frames[0])).toEqual([1, 0, 1, 0]);
    expect(Array.from(frames[1])).toEqual([0, 1, 0, 1]);
  });

  it('reads a continuous packed 1-bit bitstream across frames', () => {
    // single byte 0xA5 = 0b10100101, LSB-first bits: 1,0,1,0,0,1,0,1
    const { frames } = getBitmapFramesFromDataset({
      ...baseDataset,
      BitsAllocated: 1,
      PixelData: new Uint8Array([0xa5]),
    });

    expect(Array.from(frames[0])).toEqual([1, 0, 1, 0]);
    expect(Array.from(frames[1])).toEqual([0, 1, 0, 1]);
  });

  it('reads an 8-bit labelmap layout', () => {
    const { frames, bitsAllocated } = getBitmapFramesFromDataset({
      ...baseDataset,
      BitsAllocated: 8,
      PixelData: new Uint8Array([1, 2, 0, 3, 0, 0, 4, 0]),
    });

    expect(bitsAllocated).toBe(8);
    expect(Array.from(frames[0])).toEqual([1, 2, 0, 3]);
    expect(Array.from(frames[1])).toEqual([0, 0, 4, 0]);
  });

  it('reads a 16-bit labelmap layout', () => {
    const { frames, bitsAllocated } = getBitmapFramesFromDataset({
      ...baseDataset,
      BitsAllocated: 16,
      // values > 255 exercise the 16-bit path that the 8-bit branch can't carry
      PixelData: new Uint16Array([1, 2, 0, 300, 0, 0, 4, 40000]),
    });

    expect(bitsAllocated).toBe(16);
    expect(frames[0]).toBeInstanceOf(Uint16Array);
    expect(Array.from(frames[0])).toEqual([1, 2, 0, 300]);
    expect(Array.from(frames[1])).toEqual([0, 0, 4, 40000]);
  });

  it('throws on an unexpected 1-bit PixelData length', () => {
    expect(() =>
      getBitmapFramesFromDataset({
        ...baseDataset,
        BitsAllocated: 1,
        PixelData: new Uint8Array(5),
      })
    ).toThrow(/Unexpected 1-bit SEG PixelData length/);
  });
});

describe('encodeFramesToTransferSyntax - Explicit VR Little Endian', () => {
  it('bit-packs 1-bit frames into a single OW blob', () => {
    const frames = [
      Uint8Array.from([1, 0, 1, 0]),
      Uint8Array.from([0, 0, 1, 1]),
    ];

    const { pixelData, pixelDataVR } = encodeFramesToTransferSyntax({
      transferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID,
      frames,
      bitsAllocated: 1,
    });

    expect(pixelDataVR).toBe('OW');
    // frame0: bit0,bit2 set -> 5 ; frame1: bit2,bit3 set -> 12
    expect(Array.from(pixelData)).toEqual([5, 12]);
  });

  it('concatenates 8-bit frames as OB', () => {
    const { pixelData, pixelDataVR } = encodeFramesToTransferSyntax({
      transferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID,
      frames: [Uint8Array.from([1, 2]), Uint8Array.from([3, 4])],
      bitsAllocated: 8,
    });

    expect(pixelDataVR).toBe('OB');
    expect(Array.from(pixelData)).toEqual([1, 2, 3, 4]);
  });

  it('concatenates 16-bit frames as OW', () => {
    const { pixelData, pixelDataVR } = encodeFramesToTransferSyntax({
      transferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID,
      frames: [Uint16Array.from([0x1234, 0x5678])],
      bitsAllocated: 16,
    });

    expect(pixelDataVR).toBe('OW');
    expect(pixelData).toBeInstanceOf(Uint16Array);
    expect(Array.from(pixelData)).toEqual([0x1234, 0x5678]);
  });
});

describe('encodeFramesToTransferSyntax - RLE Lossless', () => {
  it('round-trips 1-bit frames through the local RLE encoder and decoder', () => {
    const Rows = 4;
    const Columns = 4;
    const samplesPerFrame = Rows * Columns;
    const frames = [
      Uint8Array.from([1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0]),
      Uint8Array.from([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1]),
    ];

    const { pixelData, pixelDataVR } = encodeFramesToTransferSyntax({
      transferSyntaxUID: RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
      frames,
      bitsAllocated: 1,
    });

    expect(pixelDataVR).toBe('OB');
    expect(Array.isArray(pixelData)).toBe(true);

    const decoded = decodeSegFramesFromMultiframe({
      Rows,
      Columns,
      BitsAllocated: 1,
      NumberOfFrames: 2,
      PixelData: pixelData,
      _meta: {
        TransferSyntaxUID: { Value: [RLE_LOSSLESS_TRANSFER_SYNTAX_UID] },
      },
    });

    expect(decoded).toHaveLength(2);
    expect(decoded[0]).toHaveLength(samplesPerFrame);
    expect(Array.from(decoded[0])).toEqual(Array.from(frames[0]));
    expect(Array.from(decoded[1])).toEqual(Array.from(frames[1]));
  });

  it('actually run-length encodes (a uniform frame compresses well)', () => {
    const frame = new Uint8Array(4096); // 64x64 all-zero 8-bit frame

    const { pixelData } = encodeFramesToTransferSyntax({
      transferSyntaxUID: RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
      frames: [frame],
      bitsAllocated: 8,
    });

    // 64-byte header + a handful of replicate-run control bytes — must be far
    // smaller than the raw 4096 bytes (the old encoder emitted ~1 count/pixel).
    expect(pixelData[0].byteLength).toBeLessThan(256);
  });

  it('orders 16-bit RLE byte segments most-significant-byte first', () => {
    // DICOM PS3.5 Annex G: segment 0 = high byte, segment 1 = low byte.
    const samples = Uint16Array.from([0x1234, 0x00ff, 0xab00]);

    const { pixelData } = encodeFramesToTransferSyntax({
      transferSyntaxUID: RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
      frames: [samples],
      bitsAllocated: 16,
    });

    const segments = decodeRleSegments(pixelData[0], samples.length);
    expect(segments).toHaveLength(2);
    // segment 0 must be the high bytes, segment 1 the low bytes.
    expect(Array.from(segments[0])).toEqual([0x12, 0x00, 0xab]);
    expect(Array.from(segments[1])).toEqual([0x34, 0xff, 0x00]);
  });

  it('encodes lazily via buildFrame without requiring a pre-built frames array', () => {
    const Rows = 2;
    const Columns = 2;
    let buildCount = 0;
    const frame0 = Uint8Array.from([1, 0, 0, 1]);
    const frame1 = Uint8Array.from([0, 1, 1, 0]);

    const { pixelData, pixelDataVR } = encodeFramesToTransferSyntax({
      transferSyntaxUID: RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
      buildFrame: (frameIndex) => {
        buildCount++;
        return frameIndex === 0 ? frame0 : frame1;
      },
      frameCount: 2,
      bitsAllocated: 8,
    });

    expect(pixelDataVR).toBe('OB');
    expect(buildCount).toBe(2);
    expect(Array.isArray(pixelData)).toBe(true);
    expect(pixelData).toHaveLength(2);

    const decoded = decodeSegFramesFromMultiframe({
      Rows,
      Columns,
      BitsAllocated: 8,
      NumberOfFrames: 2,
      PixelData: pixelData,
      _meta: {
        TransferSyntaxUID: { Value: [RLE_LOSSLESS_TRANSFER_SYNTAX_UID] },
      },
    });

    expect(Array.from(decoded[0])).toEqual(Array.from(frame0));
    expect(Array.from(decoded[1])).toEqual(Array.from(frame1));
  });

  it('round-trips an 8-bit frame through the local RLE encoder and decoder', () => {
    const Rows = 2;
    const Columns = 3;
    const frames = [Uint8Array.from([0, 5, 5, 5, 200, 0])];

    const { pixelData } = encodeFramesToTransferSyntax({
      transferSyntaxUID: RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
      frames,
      bitsAllocated: 8,
    });

    const decoded = decodeSegFramesFromMultiframe({
      Rows,
      Columns,
      BitsAllocated: 8,
      NumberOfFrames: 1,
      PixelData: pixelData,
      _meta: {
        TransferSyntaxUID: { Value: [RLE_LOSSLESS_TRANSFER_SYNTAX_UID] },
      },
    });

    expect(decoded).toHaveLength(1);
    expect(Array.from(decoded[0])).toEqual(Array.from(frames[0]));
  });

  it('round-trips a 16-bit (>255 label) frame through the local RLE encoder and decoder', () => {
    // Regression: 16-bit RLE previously went through dcmjs' single-sample
    // decoder, which rejects the two segments a 16-bit frame carries and
    // returned all zeros. Labels >255 must survive the round-trip.
    const Rows = 2;
    const Columns = 3;
    const frames = [Uint16Array.from([0, 300, 300, 65535, 1, 0])];

    const { pixelData } = encodeFramesToTransferSyntax({
      transferSyntaxUID: RLE_LOSSLESS_TRANSFER_SYNTAX_UID,
      frames,
      bitsAllocated: 16,
    });

    const decoded = decodeSegFramesFromMultiframe({
      Rows,
      Columns,
      BitsAllocated: 16,
      NumberOfFrames: 1,
      PixelData: pixelData,
      _meta: {
        TransferSyntaxUID: { Value: [RLE_LOSSLESS_TRANSFER_SYNTAX_UID] },
      },
    });

    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toBeInstanceOf(Uint16Array);
    expect(Array.from(decoded[0])).toEqual(Array.from(frames[0]));
  });
});

describe('decodeSegFramesFromMultiframe - uncompressed (Explicit VR LE)', () => {
  it('decodes 16-bit frames as full 16-bit samples (not halved bytes)', () => {
    // Regression: the uncompressed 16-bit path sliced a Uint8 byte view by pixel
    // count, so each "frame" covered only half a real frame and frame values
    // were corrupted. Two 2x2 16-bit frames must decode to their true values.
    const Rows = 2;
    const Columns = 2;
    const frame0 = Uint16Array.from([0, 300, 300, 0]);
    const frame1 = Uint16Array.from([1, 2, 40000, 65535]);
    const combined = Uint16Array.from([...frame0, ...frame1]);

    const decoded = decodeSegFramesFromMultiframe({
      Rows,
      Columns,
      BitsAllocated: 16,
      NumberOfFrames: 2,
      PixelData: combined,
      _meta: {
        TransferSyntaxUID: {
          Value: [EXPLICIT_VR_LITTLE_ENDIAN_TRANSFER_SYNTAX_UID],
        },
      },
    });

    expect(decoded).toHaveLength(2);
    expect(Array.from(decoded[0])).toEqual(Array.from(frame0));
    expect(Array.from(decoded[1])).toEqual(Array.from(frame1));
  });
});
