import { getRenderingEngine } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { EventTypes, PublicToolProps, ToolProps } from '../../types';

import { growCut } from '../../utilities/segmentation';
import type { GrowCutOneClickOptions as RegionSegmentPlusOptions } from '../../utilities/segmentation/growCut';
import GrowCutBaseTool from '../base/GrowCutBaseTool';
import type {
  GrowCutToolData,
  RemoveIslandData,
} from '../base/GrowCutBaseTool';

type RegionSegmentPlusToolData = GrowCutToolData & {
  worldPoint: Types.Point3;
};

class RegionSegmentPlusTool extends GrowCutBaseTool {
  static toolName;
  protected growCutData: RegionSegmentPlusToolData | null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        positiveSeedVariance: 0.4,
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

    super.preMouseDownCallback(evt);
    this.growCutData.worldPoint = worldPoint;
    this.growCutData.islandRemoval = {
      worldIslandPoints: [worldPoint],
    };
    this.runGrowCut();

    return true;
  }

  protected getRemoveIslandData(): RemoveIslandData {
    const { worldPoint } = this.growCutData;

    return {
      worldIslandPoints: [worldPoint],
    };
  }

  protected async getGrowCutLabelmap(): Promise<Types.IImageVolume> {
    const {
      segmentation: { segmentIndex, referencedVolumeId },
      renderingEngineId,
      viewportId,
      worldPoint,
    } = this.growCutData;

    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(viewportId);

    const {
      positiveSeedVariance,
      negativeSeedVariance,
      subVolumePaddingPercentage,
    } = this.configuration;

    const options: RegionSegmentPlusOptions = {
      positiveSeedValue: segmentIndex,
      negativeSeedValue: 255,
      positiveSeedVariance: positiveSeedVariance,
      negativeSeedVariance: negativeSeedVariance,
      subVolumePaddingPercentage: subVolumePaddingPercentage,
    };

    return await growCut.runOneClickGrowCut(
      referencedVolumeId,
      worldPoint,
      viewport,
      options
    );
  }
}

RegionSegmentPlusTool.toolName = 'RegionSegmentPlus';

export default RegionSegmentPlusTool;
