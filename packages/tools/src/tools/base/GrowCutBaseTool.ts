import {
  getEnabledElement,
  utilities as csUtils,
  cache,
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
  viewportId: string;
  renderingEngineId: string;
};

class GrowCutBaseTool extends BaseTool {
  static toolName;

  protected growCutData: GrowCutToolData | null;

  constructor(toolProps: PublicToolProps, defaultToolProps: ToolProps) {
    super(toolProps, defaultToolProps);
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
export type { GrowCutToolData };
