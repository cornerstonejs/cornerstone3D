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
  getDisplayVoiSnapshot,
} from '../../utilities/segmentation/growCut/runFloodFillSegmentation';
import type { GetFloodFillIntensityRange } from '../../utilities/segmentation/growCut/runFloodFillSegmentation';
import { ToolModes } from '../../enums';

const { growCutLog } = csUtils.logger;

/** Optional RegionSegmentPlus flood-fill tuning (set via tool configuration). */
type RegionSegmentPlusFloodFillConfig = {
  initialNeighborhoodRadius?: number;
  getIntensityRange?: GetFloodFillIntensityRange;
};

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
        /**
         * When true (default), a short stable hover updates the cursor and gates
         * primary click using intensity / seed heuristics. When false, clicks are
         * allowed without that hover gate (range or seeds are resolved at click).
         */
        hoverPrecheckEnabled: true,
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
    if (!this.configuration.hoverPrecheckEnabled) {
      this.allowedToProceed = true;
    }
  }

  onSetToolConfiguration = (): void => {
    if (!this.configuration.hoverPrecheckEnabled) {
      this.allowedToProceed = true;
      this.seeds = null;
    } else {
      this.allowedToProceed = false;
      this.seeds = null;
    }
  };

  mouseMoveCallback(evt: EventTypes.MouseMoveEventType) {
    if (this.mode !== ToolModes.Active) {
      return;
    }
    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const { world: worldPoint } = currentPoints;

    if (!this.configuration.hoverPrecheckEnabled) {
      this.allowedToProceed = true;
      element.style.cursor = 'copy';
      return;
    }

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

  onMouseStable(
    evt: EventTypes.MouseMoveEventType,
    worldPoint: Types.Point3,
    element: HTMLDivElement
  ) {
    if (!this.configuration.hoverPrecheckEnabled) {
      this.allowedToProceed = true;
      element.style.cursor = 'copy';
      const enabledElement = getEnabledElement(element);
      if (enabledElement?.viewport) {
        enabledElement.viewport.render();
      }
      return;
    }

    const setupOk = super.preMouseDownCallback(
      evt as EventTypes.MouseDownActivateEventType
    );
    if (!setupOk || !this.growCutData) {
      return;
    }

    const refVolume = cache.getVolume(
      this.growCutData.segmentation.referencedVolumeId
    );
    const segmentationMode =
      this.configuration.segmentationMode ?? 'floodfill_full';

    let cursor: string;
    if (segmentationMode === 'floodfill_full') {
      const ffConfig = this.configuration as RegionSegmentPlusFloodFillConfig;
      const rangeOpts = {
        positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
        initialNeighborhoodRadius: ffConfig.initialNeighborhoodRadius,
      };
      const rangeFn = ffConfig.getIntensityRange ?? getPositiveIntensityRange;
      const rangeResult = rangeFn(refVolume, worldPoint, rangeOpts);
      if (!rangeResult) {
        cursor = 'not-allowed';
        this.allowedToProceed = false;
        growCutLog.info(
          'hover gate: blocked (flood fill — no valid intensity band)',
          {
            worldPoint,
          }
        );
      } else {
        cursor = 'copy';
        this.allowedToProceed = true;
        growCutLog.info('hover gate: OK (flood fill)', {
          toleranceMin: rangeResult.min,
          toleranceMax: rangeResult.max,
          neighborhood: rangeResult.diagnostics,
        });
      }
    } else {
      const seeds = calculateGrowCutSeeds(refVolume, worldPoint, {}) || {
        positiveSeedIndices: new Set(),
        negativeSeedIndices: new Set(),
      };
      const { positiveSeedIndices, negativeSeedIndices } = seeds;
      const ratio =
        positiveSeedIndices.size / Math.max(negativeSeedIndices.size, 1);
      if (ratio > 20 || negativeSeedIndices.size < 30) {
        cursor = 'not-allowed';
        this.allowedToProceed = false;
        growCutLog.info(
          'hover gate: blocked (GPU grow cut — seed heuristics)',
          {
            positiveSeedCount: positiveSeedIndices.size,
            negativeSeedCount: negativeSeedIndices.size,
            positiveToNegativeRatio: ratio,
            reason:
              ratio > 20
                ? 'ratio too high (>20:1) — likely uniform tissue, poor contrast'
                : 'negative seeds < 30 — not enough background samples',
          }
        );
      } else {
        cursor = 'copy';
        this.allowedToProceed = true;
        growCutLog.info('hover gate: OK (GPU grow cut)', {
          positiveSeedCount: positiveSeedIndices.size,
          negativeSeedCount: negativeSeedIndices.size,
          positiveToNegativeRatio: ratio,
        });
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

  /** Deferred click path: rAF, base setup, runGrowCut (see preMouseDownCallback). */
  private async _runGrowCutAfterMouseDown(
    evt: EventTypes.MouseDownActivateEventType,
    worldPoint: Types.Point3,
    element: HTMLDivElement | undefined,
    restoreCursor: () => void
  ): Promise<void> {
    const enabledElement = element ? getEnabledElement(element) : undefined;
    if (enabledElement && element) {
      element.style.cursor = 'wait';
      // Let the browser paint `wait` before long synchronous flood fill / GPU work.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    }

    const setupOk = super.preMouseDownCallback(evt);
    if (!setupOk) {
      restoreCursor();
      return;
    }

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

    try {
      await this.runGrowCut();
    } finally {
      restoreCursor();
    }
  }

  preMouseDownCallback(evt: EventTypes.MouseDownActivateEventType): boolean {
    if (this.configuration.hoverPrecheckEnabled && !this.allowedToProceed) {
      return false;
    }

    if (!this.configuration.hoverPrecheckEnabled) {
      this.seeds = null;
    }

    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const { world: worldPoint } = currentPoints;

    const restoreCursor = () => {
      if (!element) {
        return;
      }
      element.style.cursor = this.configuration.hoverPrecheckEnabled
        ? 'default'
        : 'copy';
    };

    void this._runGrowCutAfterMouseDown(
      evt,
      worldPoint,
      element,
      restoreCursor
    ).catch(() => {
      restoreCursor();
    });

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

    const refVolume = cache.getVolume(referencedVolumeId);
    const [volMin, volMax] = refVolume.voxelManager.getRange();
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine?.getViewport(viewportId);
    const displayVoi = viewport
      ? getDisplayVoiSnapshot(viewport, referencedVolumeId)
      : null;

    growCutLog.info('one-click run', {
      segmentationMode,
      algorithm:
        segmentationMode === 'floodfill_full'
          ? 'flood_fill_plus_island_removal'
          : 'gpu_grow_cut',
      referencedVolumeId,
      segmentIndex,
      worldPosition: worldPoint,
      volumeScalarRange: { min: volMin, max: volMax },
      displayVoi,
      positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
    });

    if (segmentationMode === 'floodfill_full') {
      if (!viewport) {
        throw new Error(
          'Viewport not found for flood fill segmentation. Ensure the viewport is still active.'
        );
      }
      const ffConfig = this.configuration as RegionSegmentPlusFloodFillConfig;
      const result = await runFloodFillSegmentation({
        referencedVolumeId,
        worldPosition: worldPoint,
        viewport,
        options: {
          segmentIndex,
          positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
          initialNeighborhoodRadius: ffConfig.initialNeighborhoodRadius,
          getIntensityRange: ffConfig.getIntensityRange,
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
