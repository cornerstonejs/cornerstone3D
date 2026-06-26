import {
  cache,
  utilities as csUtils,
  getEnabledElement,
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
import { ToolModes } from '../../enums';

type RegionSegmentPlusGrowCutToolData = GrowCutToolData & {
  worldPoint: Types.Point3;
};

/**
 * Legacy one-click segmentation using GPU grow cut and hover seed heuristics.
 *
 * @deprecated Use {@link RegionSegmentPlusFloodFillTool} for new integrations.
 */
class RegionSegmentPlusGrowCutTool extends GrowCutBaseTool {
  static toolName = 'RegionSegmentPlusGrowCut';
  protected growCutData: RegionSegmentPlusGrowCutToolData | null;
  private mouseTimer: number | null = null;
  private allowedToProceed = false;
  private segmentationInProgress = false;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        isPartialVolume: false,
        positiveSeedVariance: 0.4,
        negativeSeedVariance: 0.9,
        subVolumePaddingPercentage: 0.1,
        islandRemoval: {
          /**
           * Enable/disable island removal
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

    if (this.segmentationInProgress) {
      element.style.cursor = 'wait';
      return;
    }

    element.style.cursor = 'default';

    if (this.mouseTimer !== null) {
      window.clearTimeout(this.mouseTimer);
      this.mouseTimer = null;
    }

    this.mouseTimer = window.setTimeout(() => {
      this.onMouseStable(evt, worldPoint, element);
    }, this.configuration.mouseStabilityDelay || 500);
  }

  onMouseStable(
    evt: EventTypes.MouseMoveEventType,
    worldPoint: Types.Point3,
    element: HTMLDivElement
  ) {
    if (this.segmentationInProgress) {
      element.style.cursor = 'wait';
      return;
    }

    const setupOk = super.preMouseDownCallback(
      evt as EventTypes.MouseDownActivateEventType
    );
    if (!setupOk || !this.growCutData) {
      this.allowedToProceed = false;
      element.style.cursor = 'not-allowed';
      return;
    }

    const refVolume = cache.getVolume(
      this.growCutData.segmentation.referencedVolumeId
    );
    const seeds = calculateGrowCutSeeds(refVolume, worldPoint, {}) || {
      positiveSeedIndices: new Set(),
      negativeSeedIndices: new Set(),
    };

    const { positiveSeedIndices, negativeSeedIndices } = seeds;

    let cursor;
    if (
      positiveSeedIndices.size / negativeSeedIndices.size > 20 ||
      negativeSeedIndices.size < 30
    ) {
      cursor = 'not-allowed';
      this.allowedToProceed = false;
    } else {
      cursor = 'copy';
      this.allowedToProceed = true;
    }

    const enabledElement = getEnabledElement(element);

    if (element) {
      element.style.cursor = cursor;

      requestAnimationFrame(() => {
        if (element.style.cursor !== cursor) {
          element.style.cursor = cursor;
        }
      });
    }

    if (this.allowedToProceed) {
      this.seeds = seeds;
    }

    if (enabledElement && enabledElement.viewport) {
      enabledElement.viewport.render();
    }
  }

  private async _runGrowCutAfterMouseDown(
    evt: EventTypes.MouseDownActivateEventType,
    worldPoint: Types.Point3,
    element: HTMLDivElement | undefined
  ): Promise<void> {
    this.segmentationInProgress = true;
    if (element) {
      element.style.cursor = 'wait';
    }

    try {
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
    } finally {
      this.segmentationInProgress = false;
      if (element) {
        element.style.cursor = 'default';
      }
    }
  }

  preMouseDownCallback(evt: EventTypes.MouseDownActivateEventType): boolean {
    if (!this.allowedToProceed || this.segmentationInProgress) {
      return false;
    }

    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const { world: worldPoint } = currentPoints;

    const setupOk = super.preMouseDownCallback(evt);
    if (!setupOk) {
      return false;
    }

    void this._runGrowCutAfterMouseDown(evt, worldPoint, element);

    return true;
  }

  protected getRemoveIslandData(
    growCutData: RegionSegmentPlusGrowCutToolData
  ): RemoveIslandData {
    const { worldPoint } = growCutData;

    return {
      worldIslandPoints: [worldPoint],
    };
  }

  protected async getGrowCutLabelmap(growCutData): Promise<Types.IImageVolume> {
    const {
      segmentation: { referencedVolumeId },
      worldPoint,
      options,
    } = growCutData;

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

export default RegionSegmentPlusGrowCutTool;
