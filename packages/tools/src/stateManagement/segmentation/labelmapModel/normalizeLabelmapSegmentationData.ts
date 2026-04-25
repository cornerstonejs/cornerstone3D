import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type {
  LabelmapSegmentationData,
  LabelmapLayer,
  SegmentLabelmapBindingState,
} from '../../../types/LabelmapTypes';

const SOURCE_REPRESENTATION_NAME = 'binaryLabelmap';

type LabelmapSegmentationWithState = LabelmapSegmentationData & {
  labelmaps: {
    [labelmapId: string]: LabelmapLayer;
  };
  segmentBindings: {
    [segmentIndex: number]: SegmentLabelmapBindingState;
  };
};

function getSegmentOrder(segmentation: Segmentation): number[] {
  if (segmentation.segmentOrder?.length) {
    return [...segmentation.segmentOrder];
  }

  return Object.keys(segmentation.segments)
    .map(Number)
    .sort((a, b) => a - b);
}

function getPrimaryLabelmapId(segmentationId: string): string {
  return `${segmentationId}-storage-0`;
}

function getPrimaryLabelmapType(
  labelmapData: LabelmapSegmentationData
): 'volume' | 'stack' {
  return labelmapData.volumeId ? 'volume' : 'stack';
}

function createPrimaryLabelmapLayer(
  segmentation: Segmentation,
  labelmapData: LabelmapSegmentationData,
  labelmapId = getPrimaryLabelmapId(segmentation.segmentationId)
): LabelmapLayer {
  return {
    labelmapId,
    type: getPrimaryLabelmapType(labelmapData),
    volumeId: labelmapData.volumeId,
    referencedVolumeId: labelmapData.referencedVolumeId,
    referencedImageIds: labelmapData.referencedImageIds,
    imageIds: labelmapData.imageIds,
    labelToSegmentIndex: {},
  };
}

function ensureLabelmapState(
  segmentation: Segmentation
): LabelmapSegmentationWithState | undefined {
  const labelmapData = segmentation.representationData.Labelmap;

  if (!labelmapData) {
    return;
  }

  if (
    !labelmapData.labelmaps ||
    Object.keys(labelmapData.labelmaps).length === 0
  ) {
    const labelmapId = getPrimaryLabelmapId(segmentation.segmentationId);
    labelmapData.labelmaps = {
      [labelmapId]: createPrimaryLabelmapLayer(
        segmentation,
        labelmapData,
        labelmapId
      ),
    };
  }

  if (!labelmapData.segmentBindings) {
    labelmapData.segmentBindings = {};
  }

  if (!labelmapData.sourceRepresentationName) {
    labelmapData.sourceRepresentationName = SOURCE_REPRESENTATION_NAME;
  }

  const labelmapIds = Object.keys(labelmapData.labelmaps);
  const fallbackLabelmapId =
    labelmapIds[0] ?? getPrimaryLabelmapId(segmentation.segmentationId);
  labelmapData.labelmaps[fallbackLabelmapId] ??= createPrimaryLabelmapLayer(
    segmentation,
    labelmapData,
    fallbackLabelmapId
  );

  getSegmentOrder(segmentation).forEach((segmentIndex) => {
    if (!labelmapData.segmentBindings[segmentIndex]) {
      labelmapData.segmentBindings[segmentIndex] = {
        labelmapId: fallbackLabelmapId,
        labelValue: segmentIndex,
      };
    }
  });

  Object.values(labelmapData.labelmaps).forEach((layer) => {
    layer.labelToSegmentIndex = {};
  });

  Object.entries(labelmapData.segmentBindings).forEach(
    ([segmentIndex, binding]) => {
      const layer = labelmapData.labelmaps[binding.labelmapId];
      if (!layer) {
        return;
      }

      layer.labelToSegmentIndex ||= {};
      layer.labelToSegmentIndex[binding.labelValue] = Number(segmentIndex);
    }
  );

  return labelmapData as LabelmapSegmentationWithState;
}

export {
  SOURCE_REPRESENTATION_NAME,
  ensureLabelmapState,
  getPrimaryLabelmapId,
  getSegmentOrder,
};
export type { LabelmapSegmentationWithState };
