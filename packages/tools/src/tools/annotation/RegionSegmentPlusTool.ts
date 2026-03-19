import {
  cache,
  utilities as csUtils,
  getEnabledElement,
  getRenderingEngine,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { EventTypes, PublicToolProps, ToolProps } from '../../types';

import { growCut } from '../../utilities/segmentation';
import GrowCutBaseTool from '../base/GrowCutBaseTool';
import type {
  GrowCutToolData,
  RemoveIslandData,
} from '../base/GrowCutBaseTool';
import { calculateGrowCutSeeds } from '../../utilities/segmentation/growCut/runOneClickGrowCut';
import {
  runFloodFillSegmentation,
  getPositiveIntensityRange,
} from '../../utilities/segmentation/growCut/runFloodFillSegmentation';
import { ToolModes } from '../../enums';

type RegionSegmentPlusToolData = GrowCutToolData & {
  worldPoint: Types.Point3;
};

class RegionSegmentPlusTool extends GrowCutBaseTool {
  static toolName = 'RegionSegmentPlus';
  protected growCutData: RegionSegmentPlusToolData | null;
  private mouseTimer: number | null = null;
  private allowedToProceed = false;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        isPartialVolume: false,
        positiveSeedVariance: 0.4,
        negativeSeedVariance: 0.9,
        subVolumePaddingPercentage: 0.1,
        /**
         * Segmentation mode: 'growcut' for distinct regions, 'floodfill_full' for
         * contiguous regions with speckling (flood fill + remove external islands + fill internal islands).
         */
        segmentationMode: 'floodfill_full' as const,
        islandRemoval: {
          /**
           * Enable/disable island removal (only applies when segmentationMode is 'growcut')
           */
          enabled: false,
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  mouseMoveCallback(evt: EventTypes.MouseMoveEventType) {
    if (this.mode !== ToolModes.Active) {
      return;
    }
    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const { world: worldPoint } = currentPoints;

    element.style.cursor = 'default';

    // Reset timer on mouse move
    if (this.mouseTimer !== null) {
      window.clearTimeout(this.mouseTimer);
      this.mouseTimer = null;
    }

    this.mouseTimer = window.setTimeout(() => {
      this.onMouseStable(evt, worldPoint, element);
    }, this.configuration.mouseStabilityDelay || 500);
  }

  async onMouseStable(
    evt: EventTypes.MouseMoveEventType,
    worldPoint: Types.Point3,
    element: HTMLDivElement
  ) {
    await super.preMouseDownCallback(
      evt as EventTypes.MouseDownActivateEventType
    );

    const refVolume = cache.getVolume(
      this.growCutData.segmentation.referencedVolumeId
    );
    const segmentationMode =
      this.configuration.segmentationMode ?? 'floodfill_full';

    let cursor: string;
    if (segmentationMode === 'floodfill_full') {
      const rangeResult = getPositiveIntensityRange(refVolume, worldPoint, {
        positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
      });
      if (!rangeResult) {
        cursor = 'not-allowed';
        this.allowedToProceed = false;
      } else {
        cursor = 'copy';
        this.allowedToProceed = true;
      }
    } else {
      const seeds = calculateGrowCutSeeds(refVolume, worldPoint, {}) || {
        positiveSeedIndices: new Set(),
        negativeSeedIndices: new Set(),
      };
      const { positiveSeedIndices, negativeSeedIndices } = seeds;
      if (
        positiveSeedIndices.size / Math.max(negativeSeedIndices.size, 1) > 20 ||
        negativeSeedIndices.size < 30
      ) {
        cursor = 'not-allowed';
        this.allowedToProceed = false;
      } else {
        cursor = 'copy';
        this.allowedToProceed = true;
      }
      if (this.allowedToProceed) {
        this.seeds = seeds;
      }
    }

    // Get the enabled element first
    const enabledElement = getEnabledElement(element);

    if (element) {
      element.style.cursor = cursor;

      requestAnimationFrame(() => {
        if (element.style.cursor !== cursor) {
          element.style.cursor = cursor;
        }
      });
    }

    // Ensure the viewport renders after cursor is updated
    if (enabledElement && enabledElement.viewport) {
      enabledElement.viewport.render();
    }
  }

  async preMouseDownCallback(
    evt: EventTypes.MouseDownActivateEventType
  ): Promise<boolean> {
    // change cursor to loading
    if (!this.allowedToProceed) {
      return false;
    }

    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const enabledElement = getEnabledElement(element);
    if (enabledElement) {
      element.style.cursor = 'wait';

      requestAnimationFrame(() => {
        if (element.style.cursor !== 'wait') {
          element.style.cursor = 'wait';
        }
      });
    }

    const { world: worldPoint } = currentPoints;

    await super.preMouseDownCallback(evt);

    this.growCutData = csUtils.deepMerge(this.growCutData, {
      worldPoint,
      islandRemoval: {
        worldIslandPoints: [worldPoint],
      },
    });

    this.growCutData.worldPoint = worldPoint;
    this.growCutData.islandRemoval = {
      worldIslandPoints: [worldPoint],
    };
    await this.runGrowCut();

    if (element) {
      element.style.cursor = 'default';
    }

    return true;
  }

  protected getRemoveIslandData(
    growCutData: RegionSegmentPlusToolData
  ): RemoveIslandData {
    const { worldPoint } = growCutData;

    return {
      worldIslandPoints: [worldPoint],
    };
  }

  protected async getGrowCutLabelmap(growCutData): Promise<Types.IImageVolume> {
    const {
      segmentation: { referencedVolumeId, segmentIndex },
      worldPoint,
      options,
      viewportId,
      renderingEngineId,
    } = growCutData;

    const segmentationMode =
      this.configuration.segmentationMode ?? 'floodfill_full';

    if (segmentationMode === 'floodfill_full') {
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine?.getViewport(viewportId);
      if (!viewport) {
        throw new Error(
          'Viewport not found for flood fill segmentation. Ensure the viewport is still active.'
        );
      }
      const result = await runFloodFillSegmentation({
        referencedVolumeId,
        worldPosition: worldPoint,
        viewport,
        options: {
          segmentIndex,
          positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
          ...options,
        },
      });
      if (!result) {
        throw new Error('Flood fill segmentation failed.');
      }
      return result;
    }

    const { subVolumePaddingPercentage } = this.configuration;
    const mergedOptions = {
      ...options,
      subVolumePaddingPercentage,
      seeds: this.seeds,
    };

    return growCut.runOneClickGrowCut({
      referencedVolumeId,
      worldPosition: worldPoint,
      options: mergedOptions,
    });
  }
}

export default RegionSegmentPlusTool;
