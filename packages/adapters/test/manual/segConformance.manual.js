import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const {
  generateSegmentation,
} = require('../../src/adapters/Cornerstone3D/Segmentation/generateSegmentation');
const {
  LABELMAP_SEG_SOP_CLASS_UID,
  makeReferencedStack,
  buildLabelmap3D,
  datasetToPart10Buffer,
} = require('../helpers/segRoundTrip');

/**
 * A manual test: runs dciodvfy (dicom3tools) on exported LABELMAP SEGs.
 * `pnpm test:dciodvfy` runs it; the default test run does not. It uses the
 * dciodvfy at DCIODVFY, else the dciodvfy on the PATH, and skips the cases
 * when neither is available.
 */
const DCIODVFY = process.env.DCIODVFY || 'dciodvfy';
const isAvailable = !spawnSync(DCIODVFY, ['-describe']).error;
if (!isAvailable) {
  console.warn(
    `dciodvfy is not available (${DCIODVFY}); the SEG conformance cases are skipped.`
  );
}
const describeWithDciodvfy = isAvailable ? describe : describe.skip;

const SLICE_COUNT = 6;
// prettier-ignore
const TWO_LABELS = [
    1, 1, 0, 0,
    0, 0, 0, 0,
    2, 2, 0, 0,
    0, 0, 0, 0
];

/** The dciodvfy error lines for the SEG that a case exports. */
function dciodvfyErrors(stackOptions, exportOptions = {}) {
  const stack = makeReferencedStack(SLICE_COUNT, stackOptions);
  const { dataset } = generateSegmentation(
    stack.images,
    buildLabelmap3D(SLICE_COUNT, { 1: TWO_LABELS, 4: TWO_LABELS }),
    stack.metadataProvider,
    { sopClassUID: LABELMAP_SEG_SOP_CLASS_UID, ...exportOptions }
  );
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'seg-conformance-')),
    'seg.dcm'
  );
  fs.writeFileSync(file, Buffer.from(datasetToPart10Buffer(dataset)));
  const { stdout, stderr } = spawnSync(DCIODVFY, ['-allpffgitems', file], {
    encoding: 'utf8',
  });
  return `${stdout}${stderr}`
    .split(/\r?\n/)
    .filter((line) => line.startsWith('Error'));
}

describeWithDciodvfy('LABELMAP SEG conformance (dciodvfy)', () => {
  it('has no errors for a volume', () => {
    expect(dciodvfyErrors({})).toEqual([]);
  });

  it('has no errors for a stack of a source that is not a volume', () => {
    expect(dciodvfyErrors({}, { isVolumetric: false })).toEqual([]);
  });

  it('has no errors for one time point of a 4D series', () => {
    expect(
      dciodvfyErrors({ instanceAttributes: { NumberOfTimeSlices: 40 } })
    ).toEqual([]);
  });

  it('has no errors for a source without a Frame of Reference', () => {
    expect(
      dciodvfyErrors({
        frameOfReference: false,
        pixelSpacingForSlice: () => undefined,
      })
    ).toEqual([]);
  });
});
