import {
  getEnabledElement,
  utilities as csUtils,
  cache,
  getRenderingEngine,
  type Types,
  volumeLoader,
  imageLoader,
  ImageVolume,
} from '@cornerstonejs/core';
import { BaseTool } from '../base';
import { SegmentationRepresentations } from '../../enums';
import type { EventTypes, PublicToolProps, ToolProps } from '../../types';
import {
  segmentIndex as segmentIndexController,
  state as segmentationState,
  activeSegmentation,
} from '../../stateManagement/segmentation';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import { DEFAULT_POSITIVE_STD_DEV_MULTIPLIER } from '../../utilities/segmentation/growCut/constants';

import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import { getSVGStyleForSegment } from '../../utilities/segmentation/getSVGStyleForSegment';
import IslandRemoval from '../../utilities/segmentation/islandRemoval';
import { getOrCreateSegmentationVolume } from '../../utilities/segmentation';
import { getCurrentLabelmapImageIdForViewport } from '../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import type { GrowCutOneClickOptions } from '../../utilities/segmentation/growCut/runOneClickGrowCut';

const { transformWorldToIndex, transformIndexToWorld } = csUtils;

type GrowCutToolData = {
  metadata: Types.ViewReference & {
    viewUp?: Types.Point3;
  };
  segmentation: {
    segmentationId: string;
    segmentIndex: number;
    labelmapVolumeId: string;
    referencedVolumeId: string;
  };
  islandRemoval?: {
    worldIslandPoints: Types.Point3[];
  };
  viewportId: string;
  renderingEngineId: string;
  options?: Partial<GrowCutOneClickOptions>;
};

/**
 * Island removal data which currently includes only coordinates from islands
 * that should not be removed by `IslandRemoval` class. Coordinates my be provided
 * in world space, index space or theirs indices in the data array.
 */
type RemoveIslandData = {
  // Coordinates in world space from islands that should not be removed
  worldIslandPoints?: Types.Point3[];
  // Coordinates in index space from islands that should not be removed
  ijkIslandPoints?: Types.Point3[];
  // Coordinate indices from islands that should not be removed
  islandPointIndexes?: number[];
};

class GrowCutBaseTool extends BaseTool {
  static toolName;
  protected growCutData: GrowCutToolData | null;
  private static lastGrowCutCommand = null;

  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    const baseToolProps = csUtils.deepMerge(
      {
        configuration: {
          positiveStdDevMultiplier: DEFAULT_POSITIVE_STD_DEV_MULTIPLIER,
          shrinkExpandIncrement: 0.1,
          islandRemoval: {
            /**
             * Enable/disable island removal
             */
            enabled: false,
          },
        },
      },
      defaultToolProps
    );

    super(toolProps, baseToolProps);
  }

  async preMouseDownCallback(
    evt: EventTypes.MouseDownActivateEventType
  ): Promise<boolean> {
    const eventData = evt.detail;
    const { element, currentPoints } = eventData;
    const { world: worldPoint } = currentPoints;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    const { viewUp } = viewport.getCamera();
    const {
      segmentationId,
      segmentIndex,
      labelmapVolumeId,
      referencedVolumeId,
    } = await this.getLabelmapSegmentationData(viewport);

    if (!this._isOrthogonalView(viewport, referencedVolumeId)) {
      throw new Error('Oblique view is not supported yet');
    }

    this.growCutData = {
      metadata: {
        ...viewport.getViewReference({ points: [worldPoint] }),
        viewUp,
      },
      segmentation: {
        segmentationId,
        segmentIndex,
        labelmapVolumeId,
        referencedVolumeId,
      },
      viewportId: viewport.id,
      renderingEngineId: renderingEngine.id,
    };

    evt.preventDefault();

    return true;
  }

  public shrink() {
    this._runLastCommand({
      shrinkExpandAmount: -this.configuration.shrinkExpandIncrement,
    });
  }

  public expand() {
    this._runLastCommand({
      shrinkExpandAmount: this.configuration.shrinkExpandIncrement,
    });
  }

  public refresh() {
    this._runLastCommand();
  }

  protected async getGrowCutLabelmap(
    _growCutData: GrowCutToolData
  ): Promise<Types.IImageVolume> {
    throw new Error('Not implemented');
  }

  protected async runGrowCut() {
    const { growCutData, configuration: config } = this;
    const {
      segmentation: { segmentationId, segmentIndex, labelmapVolumeId },
    } = growCutData;

    const labelmap = cache.getVolume(labelmapVolumeId);
    let shrinkExpandAccumulator = 0;

    const growCutCommand = async ({ shrinkExpandAmount = 0 } = {}) => {
      shrinkExpandAccumulator += shrinkExpandAmount;

      const newPositiveStdDevMultiplier = Math.max(
        0.1,
        config.positiveStdDevMultiplier + shrinkExpandAccumulator
      );

      const updatedGrowCutData = {
        ...growCutData,
        options: {
          ...(growCutData.options || {}),
          positiveSeedValue: segmentIndex,
          negativeSeedValue: 255,
          positiveStdDevMultiplier: newPositiveStdDevMultiplier,
        },
      };

      const growcutLabelmap = await this.getGrowCutLabelmap(updatedGrowCutData);

      const { isPartialVolume } = config;

      const fn = isPartialVolume
        ? this.applyPartialGrowCutLabelmap
        : this.applyGrowCutLabelmap;

      fn(segmentationId, segmentIndex, labelmap, growcutLabelmap);

      this._removeIslands(updatedGrowCutData);
    };

    await growCutCommand();

    GrowCutBaseTool.lastGrowCutCommand = growCutCommand;

    this.growCutData = null;
  }

  protected applyPartialGrowCutLabelmap(
    segmentationId: string,
    segmentIndex: number,
    targetLabelmap: Types.IImageVolume,
    sourceLabelmap: Types.IImageVolume
  ) {
    const srcLabelmapData =
      sourceLabelmap.voxelManager.getCompleteScalarDataArray();
    const tgtVoxelManager = targetLabelmap.voxelManager;

    const [srcColumns, srcRows, srcNumSlices] = sourceLabelmap.dimensions;
    const [tgtColumns, tgtRows] = targetLabelmap.dimensions;
    const srcPixelsPerSlice = srcColumns * srcRows;
    const tgtPixelsPerSlice = tgtColumns * tgtRows;

    // Since we know labelmap volumes have the same orientation as the referenced
    // volumes we can calculate the position of the first voxel of each row,
    // calculate its offset and copy all subsequent voxels without having to
    // calculated the position of each voxel on by one.
    for (let srcSlice = 0; srcSlice < srcNumSlices; srcSlice++) {
      for (let srcRow = 0; srcRow < srcRows; srcRow++) {
        // Converts coordinates in two steps;
        //   - from sub-volume index space to world
        //   - from world space to volume index space
        //
        // TODO: create a matrix that coverts the coordinates from sub-volume
        // index space to volume index space without getting into world space
        const srcRowIJK: Types.Point3 = [0, srcRow, srcSlice];
        const rowVoxelWorld = transformIndexToWorld(
          sourceLabelmap.imageData,
          srcRowIJK
        );
        const tgtRowIJK = transformWorldToIndex(
          targetLabelmap.imageData,
          rowVoxelWorld
        );
        const [tgtColumn, tgtRow, tgtSlice] = tgtRowIJK;
        const srcOffset = srcRow * srcColumns + srcSlice * srcPixelsPerSlice;
        const tgtOffset =
          tgtColumn + tgtRow * tgtColumns + tgtSlice * tgtPixelsPerSlice;

        for (let column = 0; column < srcColumns; column++) {
          const labelmapValue =
            srcLabelmapData[srcOffset + column] === segmentIndex
              ? segmentIndex
              : 0;

          tgtVoxelManager.setAtIndex(tgtOffset + column, labelmapValue);
        }
      }
    }

    triggerSegmentationDataModified(segmentationId);
  }

  protected applyGrowCutLabelmap(
    segmentationId: string,
    segmentIndex: number,
    targetLabelmap: Types.IImageVolume,
    sourceLabelmap: Types.IImageVolume
  ) {
    const tgtVoxelManager = targetLabelmap.voxelManager;
    const srcVoxelManager = sourceLabelmap.voxelManager;

    srcVoxelManager.forEach(({ value, index }) => {
      // if (value === segmentIndex) {
      tgtVoxelManager.setAtIndex(index, value);
      // }
    });

    triggerSegmentationDataModified(segmentationId);
  }

  private _runLastCommand({ shrinkExpandAmount = 0 } = {}) {
    const cmd = GrowCutBaseTool.lastGrowCutCommand;

    if (cmd) {
      cmd({ shrinkExpandAmount });
    }
  }

  protected async getLabelmapSegmentationData(viewport: Types.IViewport) {
    const activeSeg = activeSegmentation.getActiveSegmentation(viewport.id);

    if (!activeSeg) {
      throw new Error('No active segmentation found');
    }

    const { segmentationId } = activeSeg;

    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(segmentationId);
    const { representationData } =
      segmentationState.getSegmentation(segmentationId);
    const labelmapData =
      representationData[SegmentationRepresentations.Labelmap];
    let { volumeId: labelmapVolumeId, referencedVolumeId } =
      labelmapData as LabelmapSegmentationDataVolume;

    if (!labelmapVolumeId) {
      const referencedImageIds = (
        viewport as Types.IStackViewport
      ).getImageIds();

      if (!csUtils.isValidVolume(referencedImageIds)) {
        const currentImageId = (
          viewport as Types.IStackViewport
        ).getCurrentImageId();
        const currentImage = cache.getImage(currentImageId);

        const fakeImage =
          imageLoader.createAndCacheDerivedImage(currentImageId);

        const fakeVolume = this._createFakeVolume([
          currentImage.imageId,
          fakeImage.imageId,
        ]);
        referencedVolumeId = fakeVolume.volumeId;

        const currentLabelmapImageId = getCurrentLabelmapImageIdForViewport(
          viewport.id,
          segmentationId
        );

        const fakeDerivedImage = imageLoader.createAndCacheDerivedImage(
          currentLabelmapImageId
        );

        const fakeLabelmapVolume = this._createFakeVolume([
          currentLabelmapImageId,
          fakeDerivedImage.imageId,
        ]);

        labelmapVolumeId = fakeLabelmapVolume.volumeId;
      } else {
        const segVolume = getOrCreateSegmentationVolume(segmentationId);
        labelmapVolumeId = segVolume.volumeId;
      }
    }

    if (!referencedVolumeId) {
      const { imageIds: segImageIds } =
        labelmapData as LabelmapSegmentationDataStack;
      const referencedImageIds = segImageIds.map(
        (imageId) => cache.getImage(imageId).referencedImageId
      );
      const volumeId = cache.generateVolumeId(referencedImageIds);
      const imageVolume = cache.getVolume(volumeId);

      referencedVolumeId = imageVolume
        ? imageVolume.volumeId
        : (
            await volumeLoader.createAndCacheVolumeFromImagesSync(
              volumeId,
              referencedImageIds
            )
          ).volumeId;
    }

    return {
      segmentationId,
      segmentIndex,
      labelmapVolumeId,
      referencedVolumeId,
    };
  }

  // Todo: move this to a utilities file
  // this just fakes a volume from a non reconstructable stack viewport
  private _createFakeVolume(imageIds: string[]) {
    const volumeId = cache.generateVolumeId(imageIds);

    const cachedVolume = cache.getVolume(volumeId);

    if (cachedVolume) {
      return cachedVolume;
    }

    // Todo: implement rle based voxel manager here for ultrasound later

    const volumeProps = csUtils.generateVolumePropsFromImageIds(
      imageIds,
      volumeId
    );

    const spacing = volumeProps.spacing;
    if (spacing[2] === 0) {
      spacing[2] = 1;
    }

    const derivedVolume = new ImageVolume({
      volumeId,
      dataType: volumeProps.dataType,
      metadata: structuredClone(volumeProps.metadata),
      dimensions: volumeProps.dimensions,
      spacing: volumeProps.spacing,
      origin: volumeProps.origin,
      direction: volumeProps.direction,
      referencedVolumeId: volumeProps.referencedVolumeId,
      imageIds: volumeProps.imageIds,
      referencedImageIds: volumeProps.referencedImageIds,
    });

    cache.putVolumeSync(volumeId, derivedVolume);

    return derivedVolume;
  }

  protected _isOrthogonalView(
    viewport: Types.IViewport,
    referencedVolumeId: string
  ) {
    const volume = cache.getVolume(referencedVolumeId);
    const volumeImageData = volume.imageData;
    const camera = viewport.getCamera();
    const { ijkVecColDir, ijkVecSliceDir } = csUtils.getVolumeDirectionVectors(
      volumeImageData,
      camera
    );

    return [ijkVecColDir, ijkVecSliceDir].every(
      (vec) =>
        csUtils.isEqual(Math.abs(vec[0]), 1) ||
        csUtils.isEqual(Math.abs(vec[1]), 1) ||
        csUtils.isEqual(Math.abs(vec[2]), 1)
    );
  }

  protected getRemoveIslandData(
    _growCutData: GrowCutToolData
  ): RemoveIslandData {
    // Child class with island removal enabled needs to override this method
    return;
  }

  private _removeIslands(growCutData: GrowCutToolData) {
    const { islandRemoval: config } = this.configuration;

    if (!config.enabled) {
      return;
    }

    const {
      segmentation: { segmentIndex, labelmapVolumeId },
      renderingEngineId,
      viewportId,
    } = growCutData;

    const labelmap = cache.getVolume(labelmapVolumeId);
    const removeIslandData = this.getRemoveIslandData(growCutData);

    if (!removeIslandData) {
      return;
    }

    const [width, height] = labelmap.dimensions;
    const numPixelsPerSlice = width * height;
    const { worldIslandPoints = [], islandPointIndexes = [] } =
      removeIslandData;
    let ijkIslandPoints = [...(removeIslandData?.ijkIslandPoints ?? [])];
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportId);
    const { voxelManager } = labelmap;
    const islandRemoval = new IslandRemoval();

    ijkIslandPoints = ijkIslandPoints.concat(
      worldIslandPoints.map((worldPoint) =>
        transformWorldToIndex(labelmap.imageData, worldPoint)
      )
    );

    ijkIslandPoints = ijkIslandPoints.concat(
      islandPointIndexes.map((pointIndex) => {
        const x = pointIndex % width;
        const y = Math.floor(pointIndex / width) % height;
        const z = Math.floor(pointIndex / numPixelsPerSlice);

        return [x, y, z];
      })
    );

    islandRemoval.initialize(viewport, voxelManager, {
      points: ijkIslandPoints,
      previewSegmentIndex: segmentIndex,
      segmentIndex,
    });

    islandRemoval.floodFillSegmentIsland();
    islandRemoval.removeExternalIslands();
    islandRemoval.removeInternalIslands();
  }

  protected getSegmentStyle({ segmentationId, viewportId, segmentIndex }) {
    return getSVGStyleForSegment({
      segmentationId,
      segmentIndex,
      viewportId,
    });
  }
}

GrowCutBaseTool.toolName = 'GrowCutBaseTool';

export default GrowCutBaseTool;
export type { GrowCutToolData, RemoveIslandData };
