import { getRenderingEngine, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { EventTypes, PublicToolProps, ToolProps } from '../../types';

import { growCut } from '../../utilities/segmentation';
import GrowCutBaseTool from '../base/GrowCutBaseTool';
import type {
  GrowCutToolData,
  RemoveIslandData,
} from '../base/GrowCutBaseTool';

type RegionSegmentPlusToolData = GrowCutToolData & {
  worldPoint: Types.Point3;
};

class RegionSegmentPlusTool extends GrowCutBaseTool {
  static toolName = 'RegionSegmentPlus';
  protected growCutData: RegionSegmentPlusToolData | null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        positiveSeedVariance: 0.1,
        negativeSeedVariance: 0.9,
        subVolumePaddingPercentage: 0.1,
        islandRemoval: {
          /**
           * Enable/disable island removal
           */
          enabled: true,
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
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
      segmentation: { referencedVolumeId, labelmapVolumeId },
      renderingEngineId,
      viewportId,
      worldPoint,
      options,
    } = growCutData;

    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportId);

    const { subVolumePaddingPercentage } = this.configuration;
    const mergedOptions = {
      ...options,
      subVolumePaddingPercentage,
    };

    return growCut.runOneClickGrowCut({
      referencedVolumeId,
      labelmapVolumeId,
      worldPosition: worldPoint,
      options: mergedOptions,
    });
  }
}

export default RegionSegmentPlusTool;
