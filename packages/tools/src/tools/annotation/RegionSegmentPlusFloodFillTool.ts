import {
  cache,
  Enums as CoreEnums,
  eventTarget,
  utilities as csUtils,
  getEnabledElement,
  getRenderingEngine,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { EventTypes, PublicToolProps, ToolProps } from '../../types';

import GrowCutBaseTool from '../base/GrowCutBaseTool';
import type {
  GrowCutToolData,
  RemoveIslandData,
} from '../base/GrowCutBaseTool';
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
 * One-click segmentation via 3D intensity flood fill with automatic initial
 * parameters (intensity band strategies, optional slice/planar bounds, island removal).
 */
type RegionSegmentPlusFloodFillConfig = {
  initialNeighborhoodRadius?: number;
  intensityRangeStrategy?:
    | RegionSegmentIntensityRangeStrategyConfig
    | RegionSegmentIntensityRangeStrategy;
  floodFillIslandRemoval?: {
    removeExternalIslands?: boolean;
    removeInternalIslands?: boolean;
    verboseLogging?: boolean;
  };
  planar?: boolean;
  maxDeltaK?: number;
  maxDeltaIJ?: number;
  /**
   * When true, a short stable hover updates the cursor and gates primary click
   * using intensity heuristics. When false (default), clicks run segmentation
   * without that hover gate.
   */
  hoverPrecheckEnabled?: boolean;
};

type RegionSegmentPlusFloodFillToolData = GrowCutToolData & {
  worldPoint: Types.Point3;
  canvasPoint?: { x: number; y: number };
};

const DISK_PREVIEW_SVG_ATTR = 'data-cornerstone-region-segment-plus-disk';

class RegionSegmentPlusFloodFillTool extends GrowCutBaseTool {
  static toolName = 'RegionSegmentPlusFloodFill';
  protected growCutData: RegionSegmentPlusFloodFillToolData | null;
  private mouseTimer: number | null = null;
  private allowedToProceed = false;
  private segmentationInProgress = false;
  private diskPreviewOverlay: {
    element: HTMLDivElement;
    svg: SVGSVGElement;
  } | null = null;
  private diskPreviewLastCanvas: Types.Point2 | null = null;

  private notifySegmentationError(message: string): void {
    const event = new CustomEvent(CoreEnums.Events.ERROR_EVENT, {
      detail: {
        type: 'Segmentation',
        message,
      },
      cancelable: true,
    });
    eventTarget.dispatchEvent(event);
  }

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        isPartialVolume: false,
        positiveSeedVariance: 0.4,
        negativeSeedVariance: 0.9,
        subVolumePaddingPercentage: 0.1,
        hoverPrecheckEnabled: false,
        intensityRangeStrategy: {
          strategy: 'meanStdMapped',
        } satisfies RegionSegmentIntensityRangeStrategyConfig,
        planar: false,
        maxDeltaK: 25,
        maxDeltaIJ: 512,
        floodFillIslandRemoval: {
          removeExternalIslands: true,
          removeInternalIslands: true,
          verboseLogging: false,
        },
        actions: {
          cancelInProgress: {
            method: 'cancelInProgress',
            bindings: [
              {
                key: 'Escape',
              },
            ],
          },
        },
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

  private usesCanvasDiskStrategy(): boolean {
    const strategy = this.getIntensityStrategyConfig().strategy;
    return strategy === 'canvasDiskTriClass' || strategy === 'canvasDiskRange';
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

  public cancelInProgress(): boolean {
    return this.cancelActiveOperation();
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

    if (this.segmentationInProgress) {
      element.style.cursor = 'wait';
      return;
    }

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

    let cursor: string;
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

    const enabledElement = getEnabledElement(element);

    if (element) {
      element.style.cursor = cursor;

      requestAnimationFrame(() => {
        if (element.style.cursor !== cursor) {
          element.style.cursor = cursor;
        }
      });
    }

    if (enabledElement && enabledElement.viewport) {
      enabledElement.viewport.render();
    }
  }

  private async _runGrowCutAfterMouseDown(
    evt: EventTypes.MouseDownActivateEventType,
    worldPoint: Types.Point3,
    element: HTMLDivElement | undefined,
    restoreCursor: () => void
  ): Promise<void> {
    this.segmentationInProgress = true;
    const enabledElement = element ? getEnabledElement(element) : undefined;
    if (enabledElement && element) {
      element.style.cursor = 'wait';
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
    (this.growCutData as RegionSegmentPlusFloodFillToolData).canvasPoint =
      canvasPoint;
    this.growCutData.islandRemoval = {
      worldIslandPoints: [worldPoint],
    };

    try {
      await this.runGrowCut();
    } finally {
      this.segmentationInProgress = false;
      restoreCursor();
    }
  }

  preMouseDownCallback(evt: EventTypes.MouseDownActivateEventType): boolean {
    if (this.configuration.hoverPrecheckEnabled && !this.allowedToProceed) {
      return false;
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
      const message =
        err instanceof Error ? err.message : 'One-click segmentation failed.';
      if (message.includes('no valid intensity range')) {
        this.notifySegmentationError(
          'One-click segmentation could not determine a valid intensity range at the clicked location. Try clicking inside the target region, adjusting VOI/contrast, or changing Max Delta K/IJ.'
        );
      } else {
        this.notifySegmentationError(message);
      }
      growCutLog.error('RegionSegmentPlusFloodFill: segmentation failed', {
        message,
      });
      restoreCursor();
    });

    return true;
  }

  protected getRemoveIslandData(
    growCutData: RegionSegmentPlusFloodFillToolData
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

    const ffConfig = this.configuration as RegionSegmentPlusFloodFillConfig;

    const refVolume = cache.getVolume(referencedVolumeId);
    const [volMin, volMax] = refVolume.voxelManager.getRange();
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine?.getViewport(viewportId);
    const displayVoi = viewport
      ? getDisplayVoiSnapshot(viewport, referencedVolumeId)
      : null;

    growCutLog.info('one-click flood fill run', {
      referencedVolumeId,
      segmentIndex,
      worldPosition: worldPoint,
      volumeScalarRange: { min: volMin, max: volMax },
      displayVoi,
      positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
      floodFillPlanar: ffConfig.planar === true,
    });

    if (!viewport) {
      throw new Error(
        'Viewport not found for flood fill segmentation. Ensure the viewport is still active.'
      );
    }
    const { labelmapVolumeId } = growCutData.segmentation;
    const labelmapVolume = cache.getVolume(labelmapVolumeId);
    if (!labelmapVolume) {
      throw new Error(
        `Flood fill: segmentation labelmap volume not in cache: ${labelmapVolumeId}`
      );
    }
    const toolData = growCutData as RegionSegmentPlusFloodFillToolData;
    const canvasPoint = toolData.canvasPoint;
    const irc = this.getIntensityStrategyConfig();
    const diskPx = getCanvasDiskRadiusCssPxFromConfig(irc) ?? 3;
    const islandCfg = ffConfig.floodFillIslandRemoval ?? {};
    const { planar: _ignoredPlanarFromGrowCut, ...growCutOptionsForFlood } =
      options ?? {};
    const floodFillPlanar = ffConfig.planar === true;
    const result = await runFloodFillSegmentation({
      referencedVolumeId,
      worldPosition: worldPoint,
      viewport,
      labelmapVolume,
      options: {
        ...growCutOptionsForFlood,
        segmentIndex,
        positiveStdDevMultiplier: this.configuration.positiveStdDevMultiplier,
        initialNeighborhoodRadius: ffConfig.initialNeighborhoodRadius,
        getIntensityRange: this.resolveIntensityRangeGetter(),
        element: viewport.element,
        canvasPoint,
        intensitySamplingDiskRadiusCanvasPx: diskPx,
        applyExternalIslandRemoval: islandCfg.removeExternalIslands !== false,
        applyInternalIslandRemoval: islandCfg.removeInternalIslands !== false,
        islandRemovalVerboseLogging: islandCfg.verboseLogging === true,
        planar: floodFillPlanar,
        maxDeltaK: ffConfig.maxDeltaK,
        maxDeltaIJ: ffConfig.maxDeltaIJ,
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
}

export default RegionSegmentPlusFloodFillTool;
