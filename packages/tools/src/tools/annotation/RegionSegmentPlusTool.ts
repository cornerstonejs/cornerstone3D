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
  private seeds: {
    positiveSeedIndices: Set<number>;
    negativeSeedIndices: Set<number>;
  } | null;

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

    // Hide checkmark when mouse moves

    // Set a new timer
    this.mouseTimer = window.setTimeout(() => {
      this.onMouseStable(evt, worldPoint, element);
    }, this.configuration.mouseStabilityDelay || 300);
  }

  async onMouseStable(
    evt: EventTypes.MouseMoveEventType,
    worldPoint: Types.Point3,
    element: HTMLDivElement
  ) {
    this.growCutData = csUtils.deepMerge(this.growCutData, {
      worldPoint,
      islandRemoval: {
        worldIslandPoints: [worldPoint],
      },
    });

    await super.preMouseDownCallback(evt);

    const refVolume = cache.getVolume(
      this.growCutData.segmentation.referencedVolumeId
    );
    const seeds = calculateGrowCutSeeds(refVolume, worldPoint, {});

    const { positiveSeedIndices, negativeSeedIndices } = seeds;

    // if the ratio of positive to negative is significant, this is not a good
    // seed and we should not run growcut
    let cursor;
    if (
      positiveSeedIndices.size / negativeSeedIndices.size > 20 ||
      negativeSeedIndices.size < 30
    ) {
      cursor = 'not-allowed';
    } else {
      cursor = 'copy';
    }

    // update the cursor
    const enabledElement = getEnabledElement(element);
    if (enabledElement) {
      element.style.cursor = cursor;
    }

    if (cursor !== 'not-allowed') {
      this.seeds = seeds;
    }
  }

  async preMouseDownCallback(
    evt: EventTypes.MouseDownActivateEventType
  ): Promise<boolean> {
    const eventData = evt.detail;
    const { currentPoints } = eventData;
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
    this.runGrowCut();

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
