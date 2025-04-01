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

type RegionSegmentPlusToolData = GrowCutToolData & {
  worldPoint: Types.Point3;
};

class RegionSegmentPlusTool extends GrowCutBaseTool {
  static toolName = 'RegionSegmentPlus';
  protected growCutData: RegionSegmentPlusToolData | null;
  private mouseTimer: number | null = null;

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
    const seeds = calculateGrowCutSeeds(refVolume, worldPoint, {});

    const { positiveSeedIndices, negativeSeedIndices } = seeds;

    // if the ratio of positive to negative is significant, this is not a good
    // seed and we should not run grow cut
    let cursor;
    if (
      positiveSeedIndices.size / negativeSeedIndices.size > 20 ||
      negativeSeedIndices.size < 30
    ) {
      cursor = 'not-allowed';
    } else {
      cursor = 'copy';
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

    if (cursor !== 'not-allowed') {
      this.seeds = seeds;
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

export default RegionSegmentPlusTool;
