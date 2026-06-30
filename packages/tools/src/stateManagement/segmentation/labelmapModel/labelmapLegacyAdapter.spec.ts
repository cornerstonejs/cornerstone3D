import type { Segmentation } from '../../../types/SegmentationStateTypes';
import { ensureLabelmapState } from './normalizeLabelmapSegmentationData';
import {
  getReferencedImageIdToCurrentImageIdMap,
  syncLegacyLabelmapData,
} from './labelmapLegacyAdapter';

function createSegment(segmentIndex: number) {
  return {
    segmentIndex,
    label: `Segment ${segmentIndex}`,
    locked: false,
    cachedStats: {},
    active: segmentIndex === 1,
  };
}

function createSegmentation(
  labelmapData: Segmentation['representationData']['Labelmap']
): Segmentation {
  return {
    segmentationId: 'segmentation',
    label: 'Segmentation',
    cachedStats: {},
    segments: {
      1: createSegment(1),
    },
    representationData: {
      Labelmap: labelmapData,
    },
  };
}

describe('labelmap legacy adapter', () => {
  it('does not expose undefined volume fields for stack labelmaps', () => {
    const segmentation = createSegmentation({
      imageIds: ['labelmap-image-1'],
      referencedImageIds: ['source-image-1'],
    });

    ensureLabelmapState(segmentation);
    syncLegacyLabelmapData(segmentation);

    const labelmapData = segmentation.representationData.Labelmap;
    const primaryLayer = labelmapData.labelmaps[labelmapData.primaryLabelmapId];

    expect(labelmapData.imageIds).toEqual(['labelmap-image-1']);
    expect(labelmapData.referencedImageIds).toEqual(['source-image-1']);
    expect('volumeId' in labelmapData).toBe(false);
    expect('referencedVolumeId' in labelmapData).toBe(false);
    expect(primaryLayer.storageKind).toBe('stack');
    expect('volumeId' in primaryLayer).toBe(false);
    expect('referencedVolumeId' in primaryLayer).toBe(false);
  });

  it('keeps real volume fields for volume labelmaps', () => {
    const segmentation = createSegmentation({
      volumeId: 'labelmap-volume',
      referencedVolumeId: 'source-volume',
    });

    ensureLabelmapState(segmentation);
    syncLegacyLabelmapData(segmentation);

    const labelmapData = segmentation.representationData.Labelmap;
    const primaryLayer = labelmapData.labelmaps[labelmapData.primaryLabelmapId];

    expect(labelmapData.volumeId).toBe('labelmap-volume');
    expect(labelmapData.referencedVolumeId).toBe('source-volume');
    expect(primaryLayer.storageKind).toBe('volume');
    expect(primaryLayer.volumeId).toBe('labelmap-volume');
    expect(primaryLayer.referencedVolumeId).toBe('source-volume');
  });

  it('maps chunked stack labelmap images back to every referenced source image', () => {
    const segmentation = createSegmentation({
      imageIds: [
        'labelmap-source-1-layer-1',
        'labelmap-source-2-layer-1',
        'labelmap-source-1-layer-2',
        'labelmap-source-2-layer-2',
      ],
      referencedImageIds: ['source-image-1', 'source-image-2'],
    });

    ensureLabelmapState(segmentation);

    expect(getReferencedImageIdToCurrentImageIdMap(segmentation)).toEqual(
      new Map([
        [
          'source-image-1',
          ['labelmap-source-1-layer-1', 'labelmap-source-1-layer-2'],
        ],
        [
          'source-image-2',
          ['labelmap-source-2-layer-1', 'labelmap-source-2-layer-2'],
        ],
      ])
    );
  });
});
