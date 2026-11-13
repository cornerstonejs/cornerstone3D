import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { utilities } from '@cornerstonejs/core';
import { createNiftiImageIdsAndCacheMetadata } from '../src/createNiftiImageIdsAndCacheMetadata';

// Voxel spacing of the synthetic volume: along i (columns), j (rows) and k.
const di = 0.7;
const dj = 0.8;
const dk = 2.5;

/**
 * A NIfTI-1 file of 4 × 3 × 2 int16 voxels with pixdim [di, dj, dk] and no
 * qform or sform, so the affine is the diagonal of pixdim. The buffer is
 * padded to the 540 bytes the loader reads before it parses the header.
 */
function createNifti() {
  const buffer = new ArrayBuffer(540);
  const view = new DataView(buffer);
  view.setInt32(0, 348, true); // sizeof_hdr
  [3, 4, 3, 2, 1, 1, 1, 1].forEach((dim, index) =>
    view.setInt16(40 + 2 * index, dim, true)
  );
  view.setInt16(70, 4, true); // datatype: int16
  view.setInt16(72, 16, true); // bitpix
  [1, di, dj, dk, 1, 1, 1, 1].forEach((pixdim, index) =>
    view.setFloat32(76 + 4 * index, pixdim, true)
  );
  view.setFloat32(108, 352, true); // vox_offset
  [0x6e, 0x2b, 0x31, 0].forEach((byte, index) =>
    view.setUint8(344 + index, byte)
  ); // magic "n+1"
  return new Uint8Array(buffer);
}

function mockFetch(bytes) {
  let sent = false;
  global.fetch = jest.fn(async () => ({
    ok: true,
    headers: { get: () => null },
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) {
            return { done: true };
          }
          sent = true;
          return { done: false, value: bytes };
        },
      }),
    },
  }));
}

describe('createNiftiImageIdsAndCacheMetadata', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('publishes pixelSpacing in DICOM order, [row spacing, column spacing]', async () => {
    mockFetch(createNifti());

    const imageIds = await createNiftiImageIdsAndCacheMetadata({
      url: 'https://example.com/anisotropic.nii',
    });
    const imagePlane = utilities.genericMetadataProvider.get(
      'imagePlaneModule',
      imageIds[0]
    );

    // Rows are dj apart and columns di apart. Core reads pixelSpacing as
    // DICOM [row, column] (generateVolumePropsFromImageIds builds the volume
    // spacing as [pixelSpacing[1], pixelSpacing[0], z]).
    expect(imagePlane.rowPixelSpacing).toBeCloseTo(dj);
    expect(imagePlane.columnPixelSpacing).toBeCloseTo(di);
    expect(imagePlane.pixelSpacing[0]).toBeCloseTo(dj);
    expect(imagePlane.pixelSpacing[1]).toBeCloseTo(di);
  });
});
