import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { utilities } from '@cornerstonejs/core';
import { createNiftiImageIdsAndCacheMetadata } from '../src/createNiftiImageIdsAndCacheMetadata';

// Voxel spacing along i (columns), j (rows) and k (slices).
const di = 0.7;
const dj = 0.8;
const dk = 2.5;

/**
 * A NIfTI-1 file of 4 × 3 × 3 int16 voxels with the given sform rows (RAS).
 * The buffer is padded to the 540 bytes the loader reads before it parses
 * the header.
 */
function createNifti(srows) {
  const buffer = new ArrayBuffer(540);
  const view = new DataView(buffer);
  view.setInt32(0, 348, true); // sizeof_hdr
  [3, 4, 3, 3, 1, 1, 1, 1].forEach((dim, index) =>
    view.setInt16(40 + 2 * index, dim, true)
  );
  view.setInt16(70, 4, true); // datatype: int16
  view.setInt16(72, 16, true); // bitpix
  [1, di, dj, dk, 1, 1, 1, 1].forEach((pixdim, index) =>
    view.setFloat32(76 + 4 * index, pixdim, true)
  );
  view.setFloat32(108, 352, true); // vox_offset
  view.setInt16(254, 1, true); // sform_code: scanner
  srows.forEach((row, rowIndex) =>
    row.forEach((value, index) =>
      view.setFloat32(280 + 16 * rowIndex + 4 * index, value, true)
    )
  );
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

describe('createNiftiImageIdsAndCacheMetadata imagePositionPatient', () => {
  afterEach(() => {
    delete global.fetch;
  });

  async function loadPositions(srows) {
    mockFetch(createNifti(srows));

    const imageIds = await createNiftiImageIdsAndCacheMetadata({
      url: `https://example.com/${srows.flat().join('_')}.nii`,
    });
    expect(imageIds).toHaveLength(3);

    return imageIds.map(
      (imageId) =>
        utilities.genericMetadataProvider.get('imagePlaneModule', imageId)
          .imagePositionPatient
    );
  }

  it('places the slices of a coronal volume the slice spacing apart', async () => {
    // i to x, j to z and k to y (RAS). k runs along +y in RAS, -y in LPS.
    const positions = await loadPositions([
      [di, 0, 0, 0],
      [0, 0, dk, 0],
      [0, dj, 0, 0],
    ]);

    positions.forEach((position, index) => {
      expect(position[0]).toBeCloseTo(0);
      expect(position[1]).toBeCloseTo(-index * dk);
      expect(position[2]).toBeCloseTo(0);
    });
  });

  it('places the slices of a sagittal volume the slice spacing apart', async () => {
    // i to y, j to z and k to x (RAS). k runs along +x in RAS, -x in LPS.
    const positions = await loadPositions([
      [0, 0, dk, 0],
      [di, 0, 0, 0],
      [0, dj, 0, 0],
    ]);

    positions.forEach((position, index) => {
      expect(position[0]).toBeCloseTo(-index * dk);
      expect(position[1]).toBeCloseTo(0);
      expect(position[2]).toBeCloseTo(0);
    });
  });
});
