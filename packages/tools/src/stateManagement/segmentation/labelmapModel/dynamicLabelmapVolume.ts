import { cache, ImageVolume, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { LabelmapLayer } from '../../../types/LabelmapTypes';
import { forEachLabelmapImageReference } from './labelmapImageIdMapping';

const {
  VoxelManager,
  deepClone,
  generateVolumePropsFromImageIds,
  sortImageIdsAndGetSpacing,
  splitImageIdsBy4DTags,
} = utilities;

interface DynamicLabelmap {
  imageIdGroups: string[][];
  referencedImageIdGroups: string[][];
  groupIndexByReferencedImageId: Map<string, number>;
  groupIndex: number;
  setGroupIndex: (groupIndex: number) => void;
  groupVoxelManagers: Types.IVoxelManager<number>[];
}

const dynamicLabelmaps = new WeakMap<Types.IImageVolume, DynamicLabelmap>();
const timePointByVoxelManager = new WeakMap<object, number>();
const volumeIdBySegmentationId = new Map<string, string>();

/**
 * Creates one labelmap volume for a labelmap whose referenced images are the
 * time points of a 4D series, for example a dynamic PET or a cardiac cine.
 *
 * The volume has one slice for each position, like one time point of the
 * image volume. Internally it holds the labelmap images of every time point,
 * and its voxel manager, `imageIds` and `referencedImageIds` give the images
 * of one time point. `syncDynamicLabelmapVolume` selects the time point that
 * a dynamic image volume shows. The labelmap images keep their own storage,
 * so an RLE labelmap stays RLE.
 *
 * The volume does not report `isDynamicVolume()`. A render and an edit use the
 * normal path of a volume, which updates only the modified slices.
 *
 * @returns the cached volume, or undefined when the referenced images are not
 *     a 4D series, or when a referenced image has no labelmap image
 */
function createDynamicLabelmapVolume(
  volumeId: string,
  layer: LabelmapLayer
): Types.IImageVolume | undefined {
  const imageIdByReferencedImageId = new Map<string, string>();

  forEachLabelmapImageReference(layer, (referencedImageId, imageId) => {
    imageIdByReferencedImageId.set(referencedImageId, imageId);
  });

  const { imageIdGroups: unsortedReferencedGroups } = splitImageIdsBy4DTags([
    ...imageIdByReferencedImageId.keys(),
  ]);

  if (unsortedReferencedGroups.length < 2) {
    return;
  }

  const groupSize = unsortedReferencedGroups[0].length;
  if (
    unsortedReferencedGroups.some(
      (group) =>
        group.length !== groupSize ||
        group.some((id) => !imageIdByReferencedImageId.has(id))
    )
  ) {
    utilities.logger.toolsLog
      .getLogger('dynamicLabelmapVolume')
      .warn(
        `Labelmap ${layer.labelmapId}: the 4D split does not match the labelmap images; using a static volume`
      );
    return;
  }

  const referencedImageIdByImageId = new Map<string, string>();
  imageIdByReferencedImageId.forEach((imageId, referencedImageId) =>
    referencedImageIdByImageId.set(imageId, referencedImageId)
  );

  const firstGroup = unsortedReferencedGroups[0].map((referencedImageId) =>
    imageIdByReferencedImageId.get(referencedImageId)
  );
  const volumeProps = generateVolumePropsFromImageIds(firstGroup, volumeId);
  const scanAxisNormal = volumeProps.direction.slice(6, 9) as Types.Point3;

  const imageIdGroups = unsortedReferencedGroups.map(
    (referencedImageIds) =>
      sortImageIdsAndGetSpacing(
        referencedImageIds.map((referencedImageId) =>
          imageIdByReferencedImageId.get(referencedImageId)
        ),
        scanAxisNormal
      ).sortedImageIds
  );
  const referencedImageIdGroups = imageIdGroups.map((imageIds) =>
    imageIds.map((imageId) => referencedImageIdByImageId.get(imageId))
  );

  const groupIndexByReferencedImageId = new Map<string, number>();
  referencedImageIdGroups.forEach((referencedImageIds, groupIndex) =>
    referencedImageIds.forEach((referencedImageId) =>
      groupIndexByReferencedImageId.set(referencedImageId, groupIndex)
    )
  );

  const voxelManager = VoxelManager.createScalarDynamicVolumeVoxelManager({
    imageIdGroups,
    dimensions: volumeProps.dimensions,
    numberOfComponents: 1,
    id: volumeId,
  });

  const volume = new ImageVolume({
    volumeId,
    dataType: volumeProps.dataType,
    metadata: deepClone(volumeProps.metadata),
    dimensions: volumeProps.dimensions,
    spacing: volumeProps.spacing,
    origin: volumeProps.origin,
    direction: volumeProps.direction,
    imageIds: imageIdGroups[0],
    referencedImageIds: referencedImageIdGroups[0],
    voxelManager,
  }) as Types.IImageVolume;

  const dynamicLabelmap: DynamicLabelmap = {
    imageIdGroups,
    referencedImageIdGroups,
    groupIndexByReferencedImageId,
    groupIndex: 0,
    setGroupIndex: (groupIndex: number) => {
      // @ts-expect-error the dynamic voxel manager adds this method
      voxelManager.setDimensionGroupNumber(groupIndex + 1);
      volume.imageIds = imageIdGroups[groupIndex];
      volume.referencedImageIds = referencedImageIdGroups[groupIndex];
      dynamicLabelmap.groupIndex = groupIndex;
    },
    groupVoxelManagers: [],
  };

  dynamicLabelmaps.set(volume, dynamicLabelmap);
  cache.putVolumeSync(volumeId, volume);

  // Start on the time point that a cached image volume already shows.
  for (const imageVolume of cache.getVolumes()) {
    if (syncDynamicLabelmapVolume(volume, imageVolume)) {
      break;
    }
  }

  return volume;
}

/**
 * Selects the time point of a dynamic labelmap volume that a dynamic image
 * volume shows.
 *
 * @returns true when the labelmap volume changed its time point
 */
function syncDynamicLabelmapVolume(
  labelmapVolume: Types.IImageVolume,
  imageVolume: Types.IImageVolume
): boolean {
  const currentImageIds = (
    imageVolume as Partial<Types.IDynamicImageVolume> & {
      getCurrentDimensionGroupImageIds?: () => string[];
    }
  ).getCurrentDimensionGroupImageIds?.();

  return Boolean(
    currentImageIds?.length &&
      syncDynamicLabelmapVolumeToImageId(labelmapVolume, currentImageIds[0])
  );
}

/**
 * Selects the time point of a dynamic labelmap volume that holds a referenced
 * image, for example the image on display in a stack viewport.
 *
 * @returns true when the labelmap volume changed its time point
 */
function syncDynamicLabelmapVolumeToImageId(
  labelmapVolume: Types.IImageVolume,
  referencedImageId: string
): boolean {
  const dynamicLabelmap = dynamicLabelmaps.get(labelmapVolume);
  const groupIndex =
    dynamicLabelmap?.groupIndexByReferencedImageId.get(referencedImageId);

  if (groupIndex === undefined || groupIndex === dynamicLabelmap.groupIndex) {
    return false;
  }

  dynamicLabelmap.setGroupIndex(groupIndex);

  return true;
}

/**
 * Gets the time point that a dynamic labelmap volume shows, and a voxel
 * manager that stays on that time point.
 *
 * An edit and its undo memo use this voxel manager, so that an undo after a
 * change of time point restores the time point of the edit.
 *
 * @returns undefined for a volume that is not a dynamic labelmap volume
 */
function getDynamicLabelmapTimePoint(volume?: Types.IImageVolume):
  | {
      dimensionGroupNumber: number;
      voxelManager: Types.IVoxelManager<number>;
    }
  | undefined {
  const dynamicLabelmap = volume && dynamicLabelmaps.get(volume);

  if (!dynamicLabelmap) {
    return;
  }

  const { groupIndex, groupVoxelManagers, imageIdGroups } = dynamicLabelmap;
  const dimensionGroupNumber = groupIndex + 1;

  groupVoxelManagers[groupIndex] ??= VoxelManager.createImageVolumeVoxelManager(
    {
      dimensions: volume.dimensions,
      imageIds: imageIdGroups[groupIndex],
      numberOfComponents: 1,
      id: `${volume.volumeId}-${dimensionGroupNumber}`,
    }
  ) as Types.IVoxelManager<number>;
  timePointByVoxelManager.set(
    groupVoxelManagers[groupIndex],
    dimensionGroupNumber
  );

  return { dimensionGroupNumber, voxelManager: groupVoxelManagers[groupIndex] };
}

/** The time point of a voxel manager from `getDynamicLabelmapTimePoint`. */
function getVoxelManagerTimePoint(voxelManager: unknown): number | undefined {
  return timePointByVoxelManager.get(voxelManager as object);
}

/** Records the dynamic labelmap volume of a segmentation. */
function setDynamicLabelmapVolumeId(
  segmentationId: string,
  volumeId: string
): void {
  volumeIdBySegmentationId.set(segmentationId, volumeId);
}

/**
 * The time point that the dynamic labelmap volume of a segmentation shows.
 * Creates no volume.
 */
function getDynamicLabelmapTimePointForSegmentation(
  segmentationId: string
): number | undefined {
  const volume = cache.getVolume(volumeIdBySegmentationId.get(segmentationId));
  const dynamicLabelmap = volume && dynamicLabelmaps.get(volume);

  return dynamicLabelmap && dynamicLabelmap.groupIndex + 1;
}

/** The labelmap images of every time point of a dynamic labelmap volume. */
function getDynamicLabelmapImageIds(
  volume?: Types.IImageVolume
): string[] | undefined {
  return volume && dynamicLabelmaps.get(volume)?.imageIdGroups.flat();
}

/** True for a labelmap volume that `createDynamicLabelmapVolume` made. */
function isDynamicLabelmapVolume(volume?: Types.IImageVolume): boolean {
  return Boolean(volume && dynamicLabelmaps.has(volume));
}

export {
  createDynamicLabelmapVolume,
  getDynamicLabelmapImageIds,
  getDynamicLabelmapTimePoint,
  getDynamicLabelmapTimePointForSegmentation,
  getVoxelManagerTimePoint,
  isDynamicLabelmapVolume,
  setDynamicLabelmapVolumeId,
  syncDynamicLabelmapVolume,
  syncDynamicLabelmapVolumeToImageId,
};
