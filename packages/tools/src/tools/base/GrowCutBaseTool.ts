import {
  getEnabledElement,
  utilities as csUtils,
  cache,
  getRenderingEngine,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { BaseTool } from '../base';
import { SegmentationRepresentations } from '../../enums';
import type {
  ContourStyle,
  EventTypes,
  PublicToolProps,
  ToolProps,
} from '../../types';
import {
  segmentIndex as segmentIndexController,
  state as segmentationState,
  activeSegmentation,
} from '../../stateManagement/segmentation';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';

import type { LabelmapSegmentationDataVolume } from '../../types/LabelmapTypes';
import { getSVGStyleForSegment } from '../../utilities/segmentation/getSVGStyleForSegment';
import IslandRemoval from '../../utilities/segmentation/islandRemoval';

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

  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    const baseToolProps = csUtils.deepMerge(
      {
        configuration: {
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
    } = this.getLabelmapSegmentationData(viewport);

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

  protected async getGrowCutLabelmap(): Promise<Types.IImageVolume> {
    throw new Error('Not implemented');
  }

  protected async runGrowCut() {
    const {
      segmentation: { segmentationId, segmentIndex, labelmapVolumeId },
    } = this.growCutData;
    const labelmap = cache.getVolume(labelmapVolumeId);
    const growcutLabelmap = await this.getGrowCutLabelmap();

    this.applyGrowCutLabelmap(
      segmentationId,
      segmentIndex,
      labelmap,
      growcutLabelmap
    );

    // this._removeIslands(this.growCutData);
  }

  protected applyGrowCutLabelmap(
    segmentationId: string,
    segmentIndex: number,
    targetLabelmap: Types.IImageVolume,
    sourceLabelmap: Types.IImageVolume
  ) {
    const srcLabelmapData =
      sourceLabelmap.voxelManager.getCompleteScalarDataArray();
    const targetLabelmapData =
      targetLabelmap.voxelManager.getCompleteScalarDataArray() as Types.PixelDataTypedArray;

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
        // index space to volume index space without getting into world space.
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
          targetLabelmapData[tgtOffset + column] =
            srcLabelmapData[srcOffset + column] === segmentIndex
              ? segmentIndex
              : 0;
        }
      }
    }

    targetLabelmap.voxelManager.setCompleteScalarDataArray(targetLabelmapData);

    triggerSegmentationDataModified(segmentationId);
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

  protected getLabelmapSegmentationData(viewport: Types.IViewport) {
    const { segmentationId } = activeSegmentation.getActiveSegmentation(
      viewport.id
    );
    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(segmentationId);
    const { representationData } =
      segmentationState.getSegmentation(segmentationId);
    const labelmapData =
      representationData[SegmentationRepresentations.Labelmap];

    const { volumeId: labelmapVolumeId, referencedVolumeId } =
      labelmapData as LabelmapSegmentationDataVolume;

    return {
      segmentationId,
      segmentIndex,
      labelmapVolumeId,
      referencedVolumeId,
    };
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
}

GrowCutBaseTool.toolName = 'GrowCutBaseTool';

export default GrowCutBaseTool;
export type { GrowCutToolData, RemoveIslandData };
