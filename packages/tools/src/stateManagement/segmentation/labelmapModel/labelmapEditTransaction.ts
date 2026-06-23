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
  getSegmentBinding,
  getSegmentIndexForLabelValue,
  getSegmentsOnLabelmap,
} from './labelmapSegmentBindings';
import { moveSegmentToPrivateLabelmap as defaultMoveSegmentToPrivateLabelmap } from './privateLabelmap';

type MoveSegmentToPrivateLabelmap = (
  segmentation: Segmentation,
  segmentIndex: number
) => LabelmapLayer | undefined;

type BeginLabelmapEditTransactionOptions = {
  segmentIndex: number;
  overwriteSegmentIndices?: number[];
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

  const shouldMoveSegment = hasProtectedSegmentOverwrite(
    segmentation,
    labelmapId,
    protectedSegmentIndices,
    options.segmentationVoxelManager,
    {
      segmentationImageData: options.segmentationImageData,
      isInObject: options.isInObject,
      isInObjectBoundsIJK: options.isInObjectBoundsIJK,
    }
  );

  if (shouldMoveSegment) {
    const moveSegmentToPrivateLabelmap =
      options.moveSegmentToPrivateLabelmap ??
      defaultMoveSegmentToPrivateLabelmap;
    const privateLayer = moveSegmentToPrivateLabelmap(
      segmentation,
      segmentIndex
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
  };
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
    },
    {
      imageData: volume.imageData,
      boundsIJK: options.isInObjectBoundsIJK,
    }
  );

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
    },
    {
      imageData: options.referenceImageData,
      boundsIJK: options.isInObjectBoundsIJK,
    }
  );

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
  getProtectedSegmentIndicesForLayer,
  hasProtectedSegmentOverwrite,
  resolveLabelmapLayerEditTarget,
};
export type {
  BeginLabelmapEditTransactionOptions,
  EraseLabelmapEditTransactionOptions,
  LabelmapEditTransaction,
  LabelmapLayerEditTarget,
  ResolveLabelmapLayerEditTargetOptions,
};
