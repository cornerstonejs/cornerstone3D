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
import { getViewportVoiMappingForVolume } from '../../utilities/segmentation/growCut/getViewportVoiMappingForVolume';
import type { FloodFillIntensityRangeOptions } from '../../utilities/segmentation/growCut/floodFillIntensityRangeTypes';
import {
  normalizeIntensityRangeStrategyConfig,
  resolveIntensityRangeGetterFromConfig,
  getCanvasDiskRadiusCssPxFromConfig,
  type RegionSegmentIntensityRangeStrategy,
  type RegionSegmentIntensityRangeStrategyConfig,
} from '../../utilities/segmentation/growCut/intensityRange/intensityRangeStrategyGetters';
import { ToolModes } from '../../enums';

const { growCutLog } = csUtils.logger;

/**
 * Region Segment Plus — intensity band for flood fill / grow-cut seeding.
 *
 * **Configuration:** `intensityRangeStrategy` is either a full object
 * `{ strategy, getIntensityRange?, canvasDiskRadiusPx? }` or a string shorthand such as
 * `'meanStdMapped'` or `'canvasDiskTriClassSmall'`. Replace the whole value when changing mode.
 * When set on the object form, `getIntensityRange` overrides the built-in implementation for `strategy`.
 */
/** Optional RegionSegmentPlus flood-fill tuning (set via tool configuration). */
type RegionSegmentPlusFloodFillConfig = {
  initialNeighborhoodRadius?: number;
  /**
   * Intensity band: object form, or string shorthand (see module types).
   */
  intensityRangeStrategy?:
    | RegionSegmentIntensityRangeStrategyConfig
    | RegionSegmentIntensityRangeStrategy;
};

type RegionSegmentPlusToolData = GrowCutToolData & {
  worldPoint: Types.Point3;
  canvasPoint?: { x: number; y: number };
};

const DISK_PREVIEW_SVG_ATTR = 'data-cornerstone-region-segment-plus-disk';

class RegionSegmentPlusTool extends GrowCutBaseTool {
  static toolName = 'RegionSegmentPlus';
  protected growCutData: RegionSegmentPlusToolData | null;
  private mouseTimer: number | null = null;
  private allowedToProceed = false;
  /** SVG overlay host for canvas-disk sampling strategies (small/large). */
  private diskPreviewOverlay: {
    element: HTMLDivElement;
    svg: SVGSVGElement;
  } | null = null;
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
         * When true, a short stable hover updates the cursor and gates primary click
         * using intensity / seed heuristics. When false (default), clicks run
         * segmentation without that hover gate (range or seeds are resolved at click).
         */
        hoverPrecheckEnabled: false,
        islandRemoval: {
          /**
           * Enable/disable island removal (only applies when segmentationMode is 'growcut')
           */
          enabled: false,
        },
        intensityRangeStrategy: {
          strategy: 'meanStdMapped',
        } satisfies RegionSegmentIntensityRangeStrategyConfig,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    if (!this.configuration.hoverPrecheckEnabled) {
      this.allowedToProceed = true;
    }
  }

  private getIntensityStrategyConfig(): RegionSegmentIntensityRangeStrategyConfig {
    return normalizeIntensityRangeStrategyConfig(
      this.configuration as RegionSegmentPlusFloodFillConfig
    );
  }

  private resolveIntensityRangeGetter():
    | GetFloodFillIntensityRange
    | undefined {
    return resolveIntensityRangeGetterFromConfig(
      this.getIntensityStrategyConfig()
    );
  }

  /** True when the built-in canvas-disk strategy is selected (overlay ring). */
  private usesCanvasDiskStrategy(): boolean {
    return this.getIntensityStrategyConfig().strategy === 'canvasDiskTriClass';
  }

  private removeDiskSamplingPreview(): void {
    this.diskPreviewLastCanvas = null;
    if (this.diskPreviewOverlay) {
      this.diskPreviewOverlay.svg.remove();
      this.diskPreviewOverlay = null;
    }
  }

  private updateDiskSamplingPreview(
    element: HTMLDivElement,
    canvas: Types.Point2,
    radiusPx: number
  ): void {
    if (
      this.diskPreviewOverlay &&
      this.diskPreviewOverlay.element !== element
    ) {
      this.diskPreviewOverlay.svg.remove();
      this.diskPreviewOverlay = null;
    }
    const pos = window.getComputedStyle(element).position;
    if (pos === 'static') {
      element.style.position = 'relative';
    }
    let svg = element.querySelector<SVGSVGElement>(
      `[${DISK_PREVIEW_SVG_ATTR}]`
    );
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute(DISK_PREVIEW_SVG_ATTR, 'true');
      Object.assign(svg.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '20',
      });
      const circle = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'circle'
      );
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', 'rgba(0, 220, 130, 0.92)');
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(circle);
      element.appendChild(svg);
      this.diskPreviewOverlay = { element, svg };
    } else if (!this.diskPreviewOverlay) {
      this.diskPreviewOverlay = { element, svg };
    }
    const circle = svg.querySelector('circle');
    if (circle) {
      circle.setAttribute('cx', String(canvas[0]));
      circle.setAttribute('cy', String(canvas[1]));
      circle.setAttribute('r', String(Math.max(0, radiusPx)));
    }
    this.diskPreviewLastCanvas = canvas;
  }

  onSetToolPassive(): void {
    this.removeDiskSamplingPreview();
  }

  private buildIntensityRangeContext(
    viewport: Types.IViewport,
    element: HTMLDivElement,
    referencedVolumeId: string,
    canvas: Types.Point2 | undefined
  ): FloodFillIntensityRangeOptions {
    const ffConfig = this.configuration as RegionSegmentPlusFloodFillConfig;
    const voiMapping = getViewportVoiMappingForVolume(
      viewport,
      referencedVolumeId
    );
    const irc = normalizeIntensityRangeStrategyConfig(ffConfig);
    const disk = getCanvasDiskRadiusCssPxFromConfig(irc) ?? 3;
    const canvasPoint = canvas ? { x: canvas[0], y: canvas[1] } : undefined;
    return {
      positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
      initialNeighborhoodRadius: ffConfig.initialNeighborhoodRadius,
      viewport,
      element,
      referencedVolumeId,
      canvasPoint,
      canvasDiskRadiusPx: disk,
      voiMapping: voiMapping ?? undefined,
    };
  }

  mouseMoveCallback(evt: EventTypes.MouseMoveEventType) {
    if (this.mode !== ToolModes.Active) {
      this.removeDiskSamplingPreview();
      return;
    }

    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const { world: worldPoint } = currentPoints;

    if (this.usesCanvasDiskStrategy()) {
      const irc = this.getIntensityStrategyConfig();
      const r = getCanvasDiskRadiusCssPxFromConfig(irc) ?? 3;
      this.updateDiskSamplingPreview(element, currentPoints.canvas, r);
    } else {
      this.removeDiskSamplingPreview();
    }

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
      const enabledEl = getEnabledElement(element);
      const viewport = enabledEl?.viewport;
      if (!viewport) {
        return;
      }
      const rangeOpts = this.buildIntensityRangeContext(
        viewport,
        element,
        this.growCutData.segmentation.referencedVolumeId,
        evt.detail.currentPoints.canvas
      );
      const rangeFn =
        this.resolveIntensityRangeGetter() ?? getPositiveIntensityRange;
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
      const ffConfig = this.configuration as RegionSegmentPlusFloodFillConfig;
      const enabledEl = getEnabledElement(element);
      const viewport = enabledEl?.viewport;
      const rangeOpts = viewport
        ? this.buildIntensityRangeContext(
            viewport,
            element,
            this.growCutData.segmentation.referencedVolumeId,
            evt.detail.currentPoints.canvas
          )
        : undefined;
      const seeds = calculateGrowCutSeeds(refVolume, worldPoint, {
        getIntensityRange: this.resolveIntensityRangeGetter(),
        intensityRangeOptions: rangeOpts,
        initialNeighborhoodRadius: ffConfig.initialNeighborhoodRadius,
        positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
      }) || {
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

    const canvas = evt.detail.currentPoints.canvas;
    const canvasPoint = { x: canvas[0], y: canvas[1] };

    this.growCutData = csUtils.deepMerge(this.growCutData, {
      worldPoint,
      canvasPoint,
      islandRemoval: {
        worldIslandPoints: [worldPoint],
      },
    });

    this.growCutData.worldPoint = worldPoint;
    (this.growCutData as RegionSegmentPlusToolData).canvasPoint = canvasPoint;
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

    /**
     * Run base setup synchronously so `growCutData` is populated and
     * `evt.preventDefault()` runs during MOUSE_DOWN (same as GrowCutBaseTool).
     * Deferring only `runGrowCut()` broke consumption of the event and raced mouse-up state.
     */
    const setupOk = super.preMouseDownCallback(evt);
    if (!setupOk) {
      return false;
    }

    void this._runGrowCutAfterMouseDown(
      evt,
      worldPoint,
      element,
      restoreCursor
    ).catch((err) => {
      growCutLog.error('RegionSegmentPlus: segmentation failed', err);
      console.error('RegionSegmentPlus: segmentation failed', err);
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
      const toolData = growCutData as RegionSegmentPlusToolData;
      const canvasPoint = toolData.canvasPoint;
      const irc = this.getIntensityStrategyConfig();
      const diskPx = getCanvasDiskRadiusCssPxFromConfig(irc) ?? 3;
      const result = await runFloodFillSegmentation({
        referencedVolumeId,
        worldPosition: worldPoint,
        viewport,
        options: {
          ...options,
          segmentIndex,
          positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
          initialNeighborhoodRadius: ffConfig.initialNeighborhoodRadius,
          getIntensityRange: this.resolveIntensityRangeGetter(),
          element: viewport.element,
          canvasPoint,
          intensitySamplingDiskRadiusCanvasPx: diskPx,
        },
      });
      if (!result) {
        throw new Error(
          'Flood fill segmentation failed: no valid intensity range. ' +
            'Enable debug logging for the growCut logger, or hover precheck, to see the reason ' +
            '(click outside volume, strategy prerequisites, or seed outside computed band).'
        );
      }
      return result;
    }

    const { subVolumePaddingPercentage } = this.configuration;
    const ffConfig = this.configuration as RegionSegmentPlusFloodFillConfig;
    const toolData = growCutData as RegionSegmentPlusToolData;
    const cp = toolData.canvasPoint;
    const canvas: Types.Point2 | undefined = cp ? [cp.x, cp.y] : undefined;
    const intensityRangeOptions = viewport
      ? this.buildIntensityRangeContext(
          viewport,
          viewport.element,
          referencedVolumeId,
          canvas
        )
      : undefined;

    const mergedOptions = {
      ...options,
      subVolumePaddingPercentage,
      seeds: this.seeds,
      getIntensityRange: this.resolveIntensityRangeGetter(),
      intensityRangeOptions,
      initialNeighborhoodRadius: ffConfig.initialNeighborhoodRadius,
      positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
    };

    return growCut.runOneClickGrowCut({
      referencedVolumeId,
      worldPosition: worldPoint,
      options: mergedOptions,
    });
  }
}

export default RegionSegmentPlusTool;
