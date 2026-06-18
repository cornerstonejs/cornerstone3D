import { describe, it, expect } from '@jest/globals';
import { fillSegmentation } from '../src/adapters/Cornerstone/Segmentation_4X';

const EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';

// Minimal fake of the dcmjs Segmentation derivation. fillSegmentation reaches
// the per-frame functional group logic (and the source-UID resolution we care
// about) before any pixel encoding, and the Explicit VR LE branch only calls
// bitPackPixelData(), so these no-ops are enough.
function makeFakeSegmentation() {
  return {
    dataset: { _vrMap: {}, _meta: {}, Rows: 2, Columns: 2 },
    setNumberOfFrames() {},
    addSegmentFromLabelmap() {},
    bitPackPixelData() {},
    assignToDataset() {},
  };
}

const frameWithSegment = () => ({
  pixelData: new Uint8Array([0, 1, 0, 1]),
  segmentsOnLabelmap: [1],
});

const emptyFrame = () => ({
  pixelData: new Uint8Array([0, 0, 0, 0]),
  segmentsOnLabelmap: [],
});

function makeLabelmap3D(labelmaps2D) {
  return {
    metadata: [undefined, { SegmentNumber: '1', SegmentLabel: 'Segment 1' }],
    labelmaps2D,
  };
}

function makeMetadata(sopByImageId) {
  return {
    get: (_module, imageId) =>
      imageId && sopByImageId[imageId]
        ? { SOPInstanceUID: sopByImageId[imageId] }
        : {},
    // Keep frame resolution deterministic (never falls through to FrameRange).
    getFrameInformationFromURL: () => 1,
  };
}

describe('fillSegmentation - per-frame source image references', () => {
  it('references source images by original frame index when interior frames are empty', () => {
    // Frames 0 and 2 carry the segment; frame 1 is empty and filtered out of the
    // SEG, but the source references must still resolve to imgA and imgC — not
    // imgA/imgB — which only holds if images stay aligned to original indices.
    const labelmap3D = makeLabelmap3D([
      frameWithSegment(),
      emptyFrame(),
      frameWithSegment(),
    ]);

    const images = [
      { imageId: 'imgA' },
      { imageId: 'imgB' },
      { imageId: 'imgC' },
    ];

    const metadata = makeMetadata({
      imgA: 'SOP-A',
      imgB: 'SOP-B',
      imgC: 'SOP-C',
    });

    const segmentation = makeFakeSegmentation();

    fillSegmentation(
      segmentation,
      labelmap3D,
      { transferSyntaxUid: EXPLICIT_VR_LITTLE_ENDIAN },
      images,
      metadata
    );

    const perFrame = segmentation.dataset.PerFrameFunctionalGroupsSequence;
    expect(perFrame).toHaveLength(2);

    const sopOf = (group) =>
      group.DerivationImageSequence[0].SourceImageSequence[0]
        .ReferencedSOPInstanceUID;

    expect(sopOf(perFrame[0])).toBe('SOP-A');
    expect(sopOf(perFrame[1])).toBe('SOP-C');
    expect(segmentation.dataset.NumberOfFrames).toBe(2);
  });

  it('rejects when a frame source SOP Instance UID cannot be resolved', () => {
    const labelmap3D = makeLabelmap3D([frameWithSegment()]);
    const images = [{ imageId: 'imgA' }];
    // Metadata returns no SOPInstanceUID for imgA.
    const metadata = makeMetadata({});

    expect(() =>
      fillSegmentation(
        makeFakeSegmentation(),
        labelmap3D,
        { transferSyntaxUid: EXPLICIT_VR_LITTLE_ENDIAN },
        images,
        metadata
      )
    ).toThrow(/Cannot resolve a source ReferencedSOPInstanceUID/);
  });
});
