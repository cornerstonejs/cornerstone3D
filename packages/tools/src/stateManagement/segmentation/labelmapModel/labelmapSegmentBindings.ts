import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type {
  LabelmapLayer,
  SegmentLabelmapBindingState,
} from '../../../types/LabelmapTypes';
import { ensureLabelmapState } from './normalizeLabelmapSegmentationData';
import {
  getLabelmap,
  getLabelmaps,
  removeLabelmap,
} from './labelmapLayerStore';
import { syncLegacyLabelmapData } from './labelmapLegacyAdapter';

function getSegmentBinding(
  segmentation: Segmentation,
  segmentIndex: number
): SegmentLabelmapBindingState | undefined {
  return ensureLabelmapState(segmentation)?.segmentBindings?.[segmentIndex];
}

function setSegmentBinding(
  segmentation: Segmentation,
  segmentIndex: number,
  binding: SegmentLabelmapBindingState
): void {
  const labelmapState = ensureLabelmapState(segmentation);
  if (!labelmapState) {
    return;
  }

  const previousBinding = labelmapState.segmentBindings[segmentIndex];
  if (previousBinding) {
    const previousLayer = labelmapState.labelmaps[previousBinding.labelmapId];
    if (previousLayer?.labelToSegmentIndex) {
      delete previousLayer.labelToSegmentIndex[previousBinding.labelValue];
    }
  }

  labelmapState.segmentBindings[segmentIndex] = binding;
  const layer = labelmapState.labelmaps[binding.labelmapId];
  if (layer) {
    layer.labelToSegmentIndex ||= {};
    layer.labelToSegmentIndex[binding.labelValue] = segmentIndex;
  }
}

function getSegmentsOnLabelmap(
  segmentation: Segmentation,
  labelmapId: string
): number[] {
  const labelmapState = ensureLabelmapState(segmentation);
  if (!labelmapState) {
    return [];
  }

  return Object.entries(labelmapState.segmentBindings)
    .filter(([, binding]) => binding.labelmapId === labelmapId)
    .map(([segmentIndex]) => Number(segmentIndex))
    .sort((a, b) => a - b);
}

function getSegmentIndexForLabelValue(
  segmentation: Segmentation,
  labelmapId: string,
  labelValue: number
): number | undefined {
  const layer = getLabelmap(segmentation, labelmapId);
  if (!layer || labelValue == null) {
    return;
  }

  return layer.labelToSegmentIndex?.[labelValue] ?? labelValue;
}

function getLabelValueForSegment(
  segmentation: Segmentation,
  segmentIndex: number
): number {
  return (
    getSegmentBinding(segmentation, segmentIndex)?.labelValue ?? segmentIndex
  );
}

function getLabelmapForSegment(
  segmentation: Segmentation,
  segmentIndex: number
): LabelmapLayer | undefined {
  const binding = getSegmentBinding(segmentation, segmentIndex);
  if (!binding) {
    return;
  }

  return getLabelmap(segmentation, binding.labelmapId);
}

function resolveLabelmapForSegment(
  segmentation: Segmentation,
  segmentIndex: number
): LabelmapLayer | undefined {
  return (
    getLabelmapForSegment(segmentation, segmentIndex) ??
    getLabelmaps(segmentation)[0]
  );
}

function removeSegmentBinding(
  segmentation: Segmentation,
  segmentIndex: number
): void {
  const labelmapState = ensureLabelmapState(segmentation);
  const binding = labelmapState?.segmentBindings?.[segmentIndex];
  if (!labelmapState || !binding) {
    return;
  }

  const layer = labelmapState.labelmaps[binding.labelmapId];
  if (layer?.labelToSegmentIndex) {
    delete layer.labelToSegmentIndex[binding.labelValue];
  }

  delete labelmapState.segmentBindings[segmentIndex];

  if (getSegmentsOnLabelmap(segmentation, binding.labelmapId).length === 0) {
    removeLabelmap(segmentation, binding.labelmapId);
  }

  syncLegacyLabelmapData(segmentation);
}

export {
  getLabelmapForSegment,
  getLabelValueForSegment,
  getSegmentBinding,
  getSegmentIndexForLabelValue,
  getSegmentsOnLabelmap,
  removeSegmentBinding,
  resolveLabelmapForSegment,
  setSegmentBinding,
};
