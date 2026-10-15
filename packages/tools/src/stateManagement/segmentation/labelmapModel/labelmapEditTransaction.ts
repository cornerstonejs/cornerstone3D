import { BaseVolumeViewport, cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type {
  LabelmapLayer,
  SegmentLabelmapBindingState,
} from '../../../types/LabelmapTypes';
import { getLabelmap, getOrCreateLabelmapVolume } from './labelmapLayerStore';
import {
  getLabelmapImageIdsForReferencedImageId,
  getReferencedImageIdForImageIndex,
} from './labelmapImageIdMapping';
import {
  getSegmentBinding,
  getSegmentIndexForLabelValue,
  getSegmentsOnLabelmap,
} from './labelmapSegmentBindings';
import { moveSegmentToPrivateLabelmap as defaultMoveSegmentToPrivateLabelmap } from './privateLabelmap';
import type { LabelmapRestoreStep } from '../../../utilities/segmentation/createLabelmapMemo';

/** A batch of cross-layer erases performed by one strategy fill call, with
 *  everything needed to reverse/replay it on undo/redo. */
type CrossLayerEraseRecord = {
  voxelManager: Types.IVoxelManager<number>;
  labelValue: number;
  indices: number[];
};

type MoveSegmentToPrivateLabelmap = (
  segmentation: Segmentation,
  segmentIndex: number,
  options?: { moveStepCallback?: (step: LabelmapRestoreStep) => void }
) => LabelmapLayer | undefined;

type BeginLabelmapEditTransactionOptions = {
  segmentIndex: number;
  overwriteSegmentIndices?: number[];
  /** Locked segments. The edit skips their voxels, so they never cause a
   *  move of the edited segment to a private layer. */
  segmentsLocked?: number[];
  segmentationVoxelManager?: Types.IVoxelManager<number>;
  segmentationImageData?: vtkImageData;
  isInObject?: (point: Types.Point3) => boolean;
  isInObjectBoundsIJK?: Types.BoundsIJK;
  moveSegmentToPrivateLabelmap?: MoveSegmentToPrivateLabelmap;
};

type LabelmapEditTransaction = {
  segmentIndex: number;
  labelmapId?: string;
  labelValue: number;
  sourceLayer?: LabelmapLayer;
  activeLayer?: LabelmapLayer;
  overwriteSegmentIndices: number[];
  protectedSegmentIndices: number[];
  crossLayerEraseBindings: SegmentLabelmapBindingState[];
  movedSegment: boolean;
  /** Undo/redo step for a segment move performed by this transaction
   *  (layer registration + bulk voxel move + binding change), for recording
   *  on the stroke's memo. */
  moveStep?: LabelmapRestoreStep;
  /** The locked segments on layers other than the edited layer. The edit
   *  skips a voxel that one of these layers holds. */
  lockedVoxelsOnOtherLayers?: LockedLabelmapVoxels[];
};

/** The voxels of the locked segments on one layer. */
type LockedLabelmapVoxels = {
  voxelManager: Types.IVoxelManager<number>;
  labelValues: Set<number>;
};

type ResolveLabelmapLayerEditTargetOptions = {
  viewport?: Types.IViewport;
  imageId?: string;
  sourceLayer?: LabelmapLayer;
  preferVolume?: boolean;
};

type LabelmapLayerEditTarget = {
  imageId?: string;
  imageData?: vtkImageData;
  voxelManager?: Types.IVoxelManager<number>;
  volume?: Types.IImageVolume;
  image?: Types.IImage;
};

type EraseLabelmapEditTransactionOptions = {
  viewport: Types.IViewport;
  referenceImageData: vtkImageData;
  isInObject: (point: Types.Point3) => boolean;
  isInObjectBoundsIJK?: Types.BoundsIJK;
  imageId?: string;
  /** When provided, receives the erased voxels of each touched layer so the
   *  caller can record them for undo/redo. */
  crossLayerEraseCallback?: (record: CrossLayerEraseRecord) => void;
};

function getProtectedSegmentIndicesForLayer(
  segmentation: Segmentation,
  labelmapId: string,
  segmentIndex: number,
  overwriteSegmentIndices: number[] = []
): number[] {
  return getSegmentsOnLabelmap(segmentation, labelmapId).filter(
    (candidateSegmentIndex) =>
      candidateSegmentIndex !== segmentIndex &&
      !overwriteSegmentIndices.includes(candidateSegmentIndex)
  );
}

function hasProtectedSegmentOverwrite(
  segmentation: Segmentation,
  labelmapId: string,
  protectedSegmentIndices: number[],
  voxelManager?: Types.IVoxelManager<number>,
  options: Pick<
    BeginLabelmapEditTransactionOptions,
    'segmentationImageData' | 'isInObject' | 'isInObjectBoundsIJK'
  > = {}
): boolean {
  if (!voxelManager || !protectedSegmentIndices.length) {
    return false;
  }

  const protectedSet = new Set(protectedSegmentIndices);
  let hasConflict = false;

  voxelManager.forEach(
    ({ value }) => {
      if (!value || hasConflict) {
        return;
      }

      const candidateSegmentIndex = getSegmentIndexForLabelValue(
        segmentation,
        labelmapId,
        Number(value)
      );

      if (candidateSegmentIndex && protectedSet.has(candidateSegmentIndex)) {
        hasConflict = true;
      }
    },
    {
      imageData: options.segmentationImageData,
      isInObject: options.isInObject,
      boundsIJK: options.isInObjectBoundsIJK,
    }
  );

  return hasConflict;
}

function collectCrossLayerEraseBindings(
  segmentation: Segmentation,
  labelmapId: string | undefined,
  overwriteSegmentIndices: number[] = []
): SegmentLabelmapBindingState[] {
  if (!labelmapId || !overwriteSegmentIndices.length) {
    return [];
  }

  return overwriteSegmentIndices
    .map((overwriteSegmentIndex) =>
      getSegmentBinding(segmentation, overwriteSegmentIndex)
    )
    .filter(
      (binding): binding is SegmentLabelmapBindingState =>
        !!binding && binding.labelmapId !== labelmapId
    );
}

function beginLabelmapEditTransaction(
  segmentation: Segmentation,
  options: BeginLabelmapEditTransactionOptions
): LabelmapEditTransaction {
  const { segmentIndex } = options;
  const overwriteSegmentIndices = options.overwriteSegmentIndices ?? [];

  if (!segmentIndex) {
    return {
      segmentIndex,
      labelValue: 0,
      overwriteSegmentIndices,
      protectedSegmentIndices: [],
      crossLayerEraseBindings: [],
      movedSegment: false,
    };
  }

  const binding = getSegmentBinding(segmentation, segmentIndex);
  const sourceLayer = binding
    ? getLabelmap(segmentation, binding.labelmapId)
    : undefined;

  if (!binding || !sourceLayer) {
    return {
      segmentIndex,
      labelValue: segmentIndex,
      overwriteSegmentIndices,
      protectedSegmentIndices: [],
      crossLayerEraseBindings: [],
      movedSegment: false,
    };
  }

  let activeLayer = sourceLayer;
  let labelmapId = binding.labelmapId;
  let labelValue = binding.labelValue;
  let movedSegment = false;

  const protectedSegmentIndices = getProtectedSegmentIndicesForLayer(
    segmentation,
    labelmapId,
    segmentIndex,
    overwriteSegmentIndices
  );

  // A locked segment means "do not paint here": setValue skips its voxels,
  // so it is not an overlap and does not move the segment to a private layer.
  const segmentsLocked = options.segmentsLocked ?? [];
  const shouldMoveSegment = hasProtectedSegmentOverwrite(
    segmentation,
    labelmapId,
    protectedSegmentIndices.filter(
      (protectedSegmentIndex) => !segmentsLocked.includes(protectedSegmentIndex)
    ),
    options.segmentationVoxelManager,
    {
      segmentationImageData: options.segmentationImageData,
      isInObject: options.isInObject,
      isInObjectBoundsIJK: options.isInObjectBoundsIJK,
    }
  );

  let moveStep: LabelmapRestoreStep | undefined;

  if (shouldMoveSegment) {
    const moveSegmentToPrivateLabelmap =
      options.moveSegmentToPrivateLabelmap ??
      defaultMoveSegmentToPrivateLabelmap;
    const privateLayer = moveSegmentToPrivateLabelmap(
      segmentation,
      segmentIndex,
      { moveStepCallback: (step) => (moveStep = step) }
    );
    const privateBinding = getSegmentBinding(segmentation, segmentIndex);

    if (privateLayer && privateBinding) {
      activeLayer = privateLayer;
      labelmapId = privateBinding.labelmapId;
      labelValue = privateBinding.labelValue;
      movedSegment = privateLayer.labelmapId !== sourceLayer.labelmapId;
    } else if (privateLayer) {
      activeLayer = privateLayer;
      labelmapId = privateLayer.labelmapId;
      labelValue = 1;
      movedSegment = privateLayer.labelmapId !== sourceLayer.labelmapId;
    }
  }

  return {
    segmentIndex,
    labelmapId,
    labelValue,
    sourceLayer,
    activeLayer,
    overwriteSegmentIndices,
    protectedSegmentIndices,
    crossLayerEraseBindings: collectCrossLayerEraseBindings(
      segmentation,
      labelmapId,
      overwriteSegmentIndices
    ),
    movedSegment,
    moveStep,
  };
}

/**
 * Finds the locked segments that are on a layer other than `labelmapId`. An
 * edit of `labelmapId` reads the voxels of these layers, so that it does not
 * paint over a locked segment after a move to a private layer.
 */
function getLockedVoxelsOnOtherLayers(
  segmentation: Segmentation,
  labelmapId: string | undefined,
  segmentsLocked: number[] = [],
  targetOptions: ResolveLabelmapLayerEditTargetOptions = {}
): LockedLabelmapVoxels[] {
  const labelValuesByLayer = new Map<string, Set<number>>();

  for (const lockedSegmentIndex of segmentsLocked) {
    const binding = getSegmentBinding(segmentation, lockedSegmentIndex);
    if (!binding || binding.labelmapId === labelmapId) {
      continue;
    }

    if (!labelValuesByLayer.has(binding.labelmapId)) {
      labelValuesByLayer.set(binding.labelmapId, new Set());
    }
    labelValuesByLayer.get(binding.labelmapId).add(binding.labelValue);
  }

  // A stack layer can list the referenced images in another order than the
  // edited layer, so its image is found by the referenced image, not by index.
  const { sourceLayer: editedLayer, imageId: editedImageId } = targetOptions;
  const editedImageIndex = editedLayer?.imageIds?.indexOf(editedImageId) ?? -1;
  const referencedImageId =
    editedLayer?.referencedImageIds && editedImageIndex >= 0
      ? getReferencedImageIdForImageIndex(editedLayer, editedImageIndex)
      : undefined;
  const isVolumeEdit =
    targetOptions.preferVolume ||
    targetOptions.viewport instanceof BaseVolumeViewport;

  const lockedVoxels: LockedLabelmapVoxels[] = [];
  labelValuesByLayer.forEach((labelValues, lockedLabelmapId) => {
    const layer = getLabelmap(segmentation, lockedLabelmapId);
    if (!layer) {
      return;
    }

    let layerTargetOptions = targetOptions;
    if (
      !isVolumeEdit &&
      !layer.volumeId &&
      referencedImageId &&
      layer.referencedImageIds
    ) {
      const [lockedImageId] = getLabelmapImageIdsForReferencedImageId(
        layer,
        referencedImageId
      );
      if (!lockedImageId) {
        // The layer has no image for this slice, so nothing is locked here.
        return;
      }
      layerTargetOptions = {
        ...targetOptions,
        imageId: lockedImageId,
        sourceLayer: layer,
      };
    }

    const { voxelManager } = resolveLabelmapLayerEditTarget(
      layer,
      layerTargetOptions
    );
    if (voxelManager) {
      lockedVoxels.push({ voxelManager, labelValues });
    }
  });

  return lockedVoxels;
}

function getViewportImageIds(viewport?: Types.IViewport): string[] {
  const stackViewport = viewport as Types.IStackViewport;

  return typeof stackViewport?.getImageIds === 'function'
    ? stackViewport.getImageIds()
    : [];
}

function getCurrentViewportImageId(viewport?: Types.IViewport): string {
  const stackViewport = viewport as Types.IStackViewport;

  return typeof stackViewport?.getCurrentImageId === 'function'
    ? stackViewport.getCurrentImageId()
    : undefined;
}

function getLayerImageIndex(
  layer: LabelmapLayer,
  options: ResolveLabelmapLayerEditTargetOptions
): number {
  const currentImageId =
    options.imageId ?? getCurrentViewportImageId(options.viewport);

  if (!currentImageId) {
    return -1;
  }

  const sourceImageIndex =
    options.sourceLayer?.imageIds?.indexOf(currentImageId) ?? -1;
  if (sourceImageIndex >= 0) {
    return sourceImageIndex;
  }

  const layerImageIndex = layer.imageIds?.indexOf(currentImageId) ?? -1;
  if (layerImageIndex >= 0) {
    return layerImageIndex;
  }

  return getViewportImageIds(options.viewport).indexOf(currentImageId);
}

function getLabelmapLayerImageId(
  layer: LabelmapLayer,
  options: ResolveLabelmapLayerEditTargetOptions = {}
): string | undefined {
  const targetIndex = getLayerImageIndex(layer, options);

  return targetIndex >= 0 ? layer.imageIds?.[targetIndex] : layer.imageIds?.[0];
}

function resolveLabelmapLayerEditTarget(
  layer: LabelmapLayer,
  options: ResolveLabelmapLayerEditTargetOptions = {}
): LabelmapLayerEditTarget {
  const imageId = getLabelmapLayerImageId(layer, options);

  if (
    options.preferVolume ||
    layer.volumeId ||
    options.viewport instanceof BaseVolumeViewport
  ) {
    const volume = getOrCreateLabelmapVolume(layer);

    return {
      imageId,
      imageData: volume?.imageData as vtkImageData,
      voxelManager: volume?.voxelManager as Types.IVoxelManager<number>,
      volume,
    };
  }

  const image = imageId ? cache.getImage(imageId) : undefined;

  return {
    imageId,
    voxelManager: image?.voxelManager as Types.IVoxelManager<number>,
    image,
  };
}

function eraseVolumeLayer(
  layer: LabelmapLayer,
  binding: SegmentLabelmapBindingState,
  options: EraseLabelmapEditTransactionOptions,
  modifiedSlices: Set<number>
): void {
  const volume = getOrCreateLabelmapVolume(layer);

  if (!volume) {
    return;
  }

  const erasedIndices: number[] = [];
  volume.voxelManager.forEach(
    ({ value, index, pointIJK }) => {
      if (value !== binding.labelValue) {
        return;
      }

      const worldPoint = volume.imageData.indexToWorld(
        pointIJK as Types.Point3
      ) as Types.Point3;
      if (!options.isInObject(worldPoint)) {
        return;
      }

      volume.voxelManager.setAtIndex(index, 0);
      erasedIndices.push(index);
    },
    {
      imageData: volume.imageData,
      boundsIJK: options.isInObjectBoundsIJK,
    }
  );

  if (erasedIndices.length) {
    options.crossLayerEraseCallback?.({
      voxelManager: volume.voxelManager as Types.IVoxelManager<number>,
      labelValue: binding.labelValue,
      indices: erasedIndices,
    });
  }

  volume.voxelManager
    ?.getArrayOfModifiedSlices?.()
    ?.forEach((sliceIndex) => modifiedSlices.add(sliceIndex));
}

function eraseStackLayer(
  layer: LabelmapLayer,
  binding: SegmentLabelmapBindingState,
  options: EraseLabelmapEditTransactionOptions,
  modifiedSlices: Set<number>
): void {
  const stackViewport = options.viewport as Types.IStackViewport;
  const currentImageId =
    getCurrentViewportImageId(options.viewport) ?? options.imageId;
  const { image, voxelManager } = resolveLabelmapLayerEditTarget(layer, {
    viewport: options.viewport,
    imageId: currentImageId,
  });

  if (!image || !voxelManager) {
    return;
  }

  const erasedIndices: number[] = [];
  voxelManager.forEach(
    ({ value, index, pointIJK }) => {
      if (value !== binding.labelValue) {
        return;
      }

      const worldPoint = options.referenceImageData.indexToWorld(
        pointIJK as Types.Point3
      ) as Types.Point3;
      if (!options.isInObject(worldPoint)) {
        return;
      }

      voxelManager.setAtIndex(index, 0);
      erasedIndices.push(index);
    },
    {
      imageData: options.referenceImageData,
      boundsIJK: options.isInObjectBoundsIJK,
    }
  );

  if (erasedIndices.length) {
    options.crossLayerEraseCallback?.({
      voxelManager,
      labelValue: binding.labelValue,
      indices: erasedIndices,
    });
  }

  const currentSlice = stackViewport.getCurrentImageIdIndex?.();
  if (typeof currentSlice === 'number') {
    modifiedSlices.add(currentSlice);
  }
}

function eraseLabelmapEditTransactionOverwrites(
  segmentation: Segmentation,
  transaction: LabelmapEditTransaction | undefined,
  options: EraseLabelmapEditTransactionOptions
): number[] {
  if (!transaction?.crossLayerEraseBindings?.length) {
    return [];
  }

  const modifiedSlices = new Set<number>();

  transaction.crossLayerEraseBindings.forEach((binding) => {
    const layer = getLabelmap(segmentation, binding.labelmapId);

    if (!layer) {
      return;
    }

    if (options.viewport instanceof BaseVolumeViewport || layer.volumeId) {
      eraseVolumeLayer(layer, binding, options, modifiedSlices);
      return;
    }

    eraseStackLayer(layer, binding, options, modifiedSlices);
  });

  return Array.from(modifiedSlices);
}

export {
  beginLabelmapEditTransaction,
  collectCrossLayerEraseBindings,
  eraseLabelmapEditTransactionOverwrites,
  getLabelmapLayerImageId,
  getLockedVoxelsOnOtherLayers,
  getProtectedSegmentIndicesForLayer,
  hasProtectedSegmentOverwrite,
  resolveLabelmapLayerEditTarget,
};
export type {
  BeginLabelmapEditTransactionOptions,
  CrossLayerEraseRecord,
  EraseLabelmapEditTransactionOptions,
  LabelmapEditTransaction,
  LabelmapLayerEditTarget,
  LockedLabelmapVoxels,
  ResolveLabelmapLayerEditTargetOptions,
};
