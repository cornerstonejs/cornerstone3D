#!/usr/bin/env node
// Builds the HTJ2K Lossless (1.2.840.10008.1.2.4.201) fixture from CTImage.dcm.
//
// This one is separate from make-fixtures.py because nothing in the Python
// stack encodes HTJ2K: imagecodecs' OpenJPEG build decodes it but will not
// write it, so the encoder has to be the OpenJPH already installed here as
// @cornerstonejs/codec-openjph.
//
// Encoding and decoding with the same implementation would let a matched
// encoder/decoder bug pass unnoticed, so the fixture is verified with
// OpenJPEG - a different implementation - before it is kept. That check lives
// in make-fixtures.py's verify step, which this script defers to by writing the
// codestream where it can pick it up:
//
//   node make-htj2k-fixture.mjs <testImages dir>
//
// Requires a `python3` with pydicom, numpy and imagecodecs on PATH.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const testImages = process.argv[2];

if (!testImages) {
  console.error('usage: node make-htj2k-fixture.mjs <testImages dir>');
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), 'htj2k-fixture-'));

try {
  // Pull the source frame and its geometry out of the DICOM.
  const info = JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `import pydicom, json, sys
ds = pydicom.dcmread(sys.argv[1])
open(sys.argv[2], 'wb').write(ds.PixelData)
print(json.dumps({
  'width': int(ds.Columns), 'height': int(ds.Rows),
  'bitsPerSample': int(ds.BitsAllocated),
  'componentCount': int(ds.SamplesPerPixel),
  'isSigned': int(ds.PixelRepresentation) == 1,
}))`,
        join(testImages, 'CTImage.dcm'),
        join(scratch, 'frame.raw'),
      ],
      { encoding: 'utf8' }
    )
  );

  const require = createRequire(import.meta.url);
  const factory = (
    await import(
      pathToFileURL(require.resolve('@cornerstonejs/codec-openjph/wasmjs')).href
    )
  ).default;

  const codec = await factory();
  const encoder = new codec.HTJ2KEncoder();

  encoder
    .getDecodedBuffer({ ...info, isUsingColorTransform: false })
    .set(new Uint8Array(readFileSync(join(scratch, 'frame.raw'))));
  encoder.setQuality(true, 0.001); // lossless
  encoder.setDecompositions(5);
  encoder.encode();

  const encoded = Buffer.from(encoder.getEncodedBuffer());
  writeFileSync(join(scratch, 'frame.j2c'), encoded);

  // Wrap and verify. A file that does not round-trip through OpenJPEG is not
  // left behind, matching make-fixtures.py.
  execFileSync(
    'python3',
    [
      '-c',
      `import numpy as np, pydicom, imagecodecs, sys
from pathlib import Path
from pydicom.encaps import encapsulate, generate_frames
from pydicom.uid import UID

test_images, codestream_path = Path(sys.argv[1]), Path(sys.argv[2])
expected = pydicom.dcmread(test_images / 'CTImage.dcm').pixel_array

codestream = codestream_path.read_bytes()
if len(codestream) % 2:
    codestream += b'\\x00'

ds = pydicom.dcmread(test_images / 'CTImage.dcm')
ds.file_meta.TransferSyntaxUID = UID('1.2.840.10008.1.2.4.201')
ds.PixelData = encapsulate([codestream])
ds['PixelData'].is_undefined_length = True
out = test_images / 'CTImage.dcm_HTJ2KLosslessTransferSyntax_1.2.840.10008.1.2.4.201.dcm'
ds.save_as(out, implicit_vr=False, little_endian=True, enforce_file_format=True)

frame = next(generate_frames(pydicom.dcmread(out).PixelData, number_of_frames=1))
got = np.asarray(imagecodecs.jpeg2k_decode(frame)).reshape(expected.shape).astype(expected.dtype)
if not np.array_equal(got, expected):
    out.unlink()
    raise SystemExit('HTJ2K fixture does not round-trip through OpenJPEG')
print(f'  {out.name}  {len(frame)} frame bytes, round-trips')`,
      testImages,
      join(scratch, 'frame.j2c'),
    ],
    { stdio: 'inherit' }
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
