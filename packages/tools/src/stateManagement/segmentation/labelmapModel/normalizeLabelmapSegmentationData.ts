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
  primaryLabelmapId: string;
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
  const layer: LabelmapLayer = {
    labelmapId,
    storageKind: getPrimaryLabelmapType(labelmapData),
    labelToSegmentIndex: {},
  };

  if (labelmapData.volumeId != null) {
    layer.volumeId = labelmapData.volumeId;
  }

  if (labelmapData.referencedVolumeId != null) {
    layer.referencedVolumeId = labelmapData.referencedVolumeId;
  }

  if (labelmapData.referencedImageIds != null) {
    layer.referencedImageIds = labelmapData.referencedImageIds;
  }

  if (labelmapData.imageIds != null) {
    layer.imageIds = labelmapData.imageIds;
  }

  return layer;
}

function resolvePrimaryLabelmapId(
  segmentation: Segmentation,
  labelmapData: LabelmapSegmentationData
): string {
  const storedLabelmapId = labelmapData.primaryLabelmapId;

  if (storedLabelmapId && labelmapData.labelmaps?.[storedLabelmapId]) {
    return storedLabelmapId;
  }

  const fallbackLabelmapId =
    Object.keys(labelmapData.labelmaps ?? {})[0] ??
    getPrimaryLabelmapId(segmentation.segmentationId);

  labelmapData.primaryLabelmapId = fallbackLabelmapId;

  return fallbackLabelmapId;
}

/**
 * Normalizes sparse or legacy labelmap representation data into the current
 * internal state shape. This mutates the segmentation so later render paths and
 * state helpers can use stable labelmap and segment binding maps without
 * rebuilding the default layer identity on every call.
 */
function ensureLabelmapState(
  segmentation: Segmentation
): LabelmapSegmentationWithState | undefined {
  const labelmapData = segmentation.representationData.Labelmap;

  if (!labelmapData) {
    return;
  }

  labelmapData.labelmaps ||= {};

  const primaryLabelmapId = resolvePrimaryLabelmapId(
    segmentation,
    labelmapData
  );

  labelmapData.labelmaps[primaryLabelmapId] ||= createPrimaryLabelmapLayer(
    segmentation,
    labelmapData,
    primaryLabelmapId
  );

  labelmapData.segmentBindings ||= {};
  labelmapData.sourceRepresentationName ||= SOURCE_REPRESENTATION_NAME;

  getSegmentOrder(segmentation).forEach((segmentIndex) => {
    labelmapData.segmentBindings[segmentIndex] ||= {
      labelmapId: primaryLabelmapId,
      labelValue: segmentIndex,
    };
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
