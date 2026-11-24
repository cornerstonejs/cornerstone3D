import { BaseTool } from './base';
import { getEnabledElement, cache, utilities } from '@cornerstonejs/core';
import type { PlanarViewport, Types } from '@cornerstonejs/core';
import type { EventTypes } from '../types';

// Todo: should move to configuration
const DEFAULT_MULTIPLIER = 4;
const DEFAULT_IMAGE_DYNAMIC_RANGE = 1024;
const PT = 'PT';

/**
 * WindowLevel tool manipulates the windowLevel applied to a viewport. It
 * provides a way to set the windowCenter and windowWidth of a viewport
 * by dragging mouse over the image.
 *
 */
class WindowLevelTool extends BaseTool {
  static toolName;
  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  touchDragCallback(evt: EventTypes.InteractionEventType) {
    this.mouseDragCallback(evt);
  }

  mouseDragCallback(evt: EventTypes.InteractionEventType) {
    const { element, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    let modality, newRange;
    let isPreScaled = false;

    const properties = getViewportVOIProperties(viewport);

    if (!properties?.voiRange) {
      throw new Error('Viewport is not a valid type');
    }

    const { lower, upper } = properties.voiRange;

    // Resolve modality + pre-scaled state through the single family-aware
    // descriptor instead of re-deriving them inline. A viewport has no
    // `.modality` or `.preScale` of its own; the descriptor reads each family
    // from its own source of truth so a prescaled PT viewport still takes the
    // gentle fixed-width PT path (5/clientHeight) instead of the aggressive
    // dynamic-range multiplier.
    const volumeId = getVolumeIdOnDisplay(viewport);
    const descriptor = utilities.getScalingDescriptor(viewport, volumeId);
    modality = descriptor?.modality;
    isPreScaled = !!descriptor?.isPreScaled;

    // If modality is PT an the viewport is pre-scaled (SUV),
    // treat it special to not include the canvas delta in
    // the x direction. For other modalities, use the canvas delta in both
    // directions, and if the viewport is a volumeViewport, the multiplier
    // is calculate using the volume min and max.
    if (modality === PT && isPreScaled) {
      newRange = this.getPTScaledNewRange({
        deltaPointsCanvas: deltaPoints.canvas,
        lower,
        upper,
        clientHeight: element.clientHeight,
        isPreScaled,
        viewport,
        volumeId,
      });
    } else {
      newRange = this.getNewRange({
        viewport,
        deltaPointsCanvas: deltaPoints.canvas,
        volumeId,
        lower,
        upper,
        voiLutFunction: properties.voiLUTFunction,
      });
    }

    // If the range is not valid. Do nothing
    if (newRange.lower >= newRange.upper) {
      return;
    }

    setViewportVOIProperties(viewport, {
      voiRange: newRange,
    });

    viewport.render();
  }

  getPTScaledNewRange({
    deltaPointsCanvas,
    lower,
    upper,
    clientHeight,
    viewport,
    volumeId,
    isPreScaled,
  }) {
    let multiplier = DEFAULT_MULTIPLIER;

    if (isPreScaled) {
      multiplier = 5 / clientHeight;
    } else {
      multiplier =
        this._getMultiplierFromDynamicRange(viewport, volumeId) ||
        DEFAULT_MULTIPLIER;
    }

    const deltaY = deltaPointsCanvas[1];
    const wcDelta = deltaY * multiplier;

    upper -= wcDelta;
    upper = isPreScaled ? Math.max(upper, 0.1) : upper;

    return { lower, upper };
  }

  getNewRange({
    viewport,
    deltaPointsCanvas,
    volumeId,
    lower,
    upper,
    voiLutFunction,
  }) {
    const multiplier =
      this._getMultiplierFromDynamicRange(viewport, volumeId) ||
      DEFAULT_MULTIPLIER;

    const wwDelta = deltaPointsCanvas[0] * multiplier;
    const wcDelta = deltaPointsCanvas[1] * multiplier;

    let { windowWidth, windowCenter } = utilities.windowLevel.toWindowLevel(
      lower,
      upper
    );

    windowWidth += wwDelta;
    windowCenter += wcDelta;

    windowWidth = Math.max(windowWidth, 1);

    // Convert back to range
    return utilities.windowLevel.toLowHighRange(
      windowWidth,
      windowCenter,
      voiLutFunction
    );
  }

  _getMultiplierFromDynamicRange(viewport, volumeId) {
    let imageDynamicRange;

    if (volumeId) {
      const imageVolume = cache.getVolume(volumeId);

      const { voxelManager } = viewport.getImageData();

      const middleSlicePixelData = voxelManager.getMiddleSliceData();
      const calculatedDynamicRange: [number, number] =
        middleSlicePixelData.reduce(
          (acc, pixel) => {
            return [Math.min(acc[0], pixel), Math.max(acc[1], pixel)];
          },
          [Infinity, -Infinity]
        );

      const BitsStored = imageVolume?.metadata?.BitsStored;
      const metadataDynamicRange = BitsStored ? 2 ** BitsStored : Infinity;
      const calculatedRange =
        calculatedDynamicRange[1] - calculatedDynamicRange[0];
      // Burned in Pixels often use pixel values above the BitsStored.
      // This results in a multiplier which is way higher than what you would
      // want in practice. Thus we take the min between the metadata dynamic
      // range upper value and actual middle slice dynamic range.
      imageDynamicRange = !Number.isFinite(calculatedRange)
        ? metadataDynamicRange
        : Math.min(calculatedRange, metadataDynamicRange);
    } else {
      imageDynamicRange = this._getImageDynamicRangeFromViewport(viewport);
    }

    const ratio = imageDynamicRange / DEFAULT_IMAGE_DYNAMIC_RANGE;

    return !Number.isFinite(ratio)
      ? DEFAULT_IMAGE_DYNAMIC_RANGE
      : ratio > 1
        ? Math.round(ratio)
        : ratio;
  }

  _getImageDynamicRangeFromViewport(viewport) {
    const { imageData, voxelManager } = viewport.getImageData();

    // this should address the case where the voxelManager is used
    // for the new volume viewport model
    if (voxelManager?.getRange) {
      const range = voxelManager.getRange();
      return range[1] - range[0];
    }

    const dimensions = imageData.getDimensions();

    if (imageData.getRange) {
      const imageDataRange = imageData.getRange();
      return imageDataRange[1] - imageDataRange[0];
    }
    let scalarData;
    // if getScalarData is a method on imageData
    if (imageData.getScalarData) {
      scalarData = imageData.getScalarData();
    } else {
      scalarData = imageData.getPointData().getScalars().getData();
    }

    if (dimensions[2] !== 1) {
      return this._getImageDynamicRangeFromMiddleSlice(scalarData, dimensions);
    }

    let range;
    if (scalarData.getRange) {
      range = scalarData.getRange();
    } else {
      const { min, max } = this._getMinMax(scalarData, scalarData.length);
      range = [min, max];
    }

    return range[1] - range[0];
  }

  _getImageDynamicRangeFromMiddleSlice = (scalarData, dimensions) => {
    const middleSliceIndex = Math.floor(dimensions[2] / 2);

    const frameLength = dimensions[0] * dimensions[1];
    let bytesPerVoxel;
    let TypedArrayConstructor;

    if (scalarData instanceof Float32Array) {
      bytesPerVoxel = 4;
      TypedArrayConstructor = Float32Array;
    } else if (scalarData instanceof Uint8Array) {
      bytesPerVoxel = 1;
      TypedArrayConstructor = Uint8Array;
    } else if (scalarData instanceof Uint16Array) {
      bytesPerVoxel = 2;
      TypedArrayConstructor = Uint16Array;
    } else if (scalarData instanceof Int16Array) {
      bytesPerVoxel = 2;
      TypedArrayConstructor = Int16Array;
    }

    const buffer = scalarData.buffer;
    const byteOffset = middleSliceIndex * frameLength * bytesPerVoxel;
    const frame = new TypedArrayConstructor(buffer, byteOffset, frameLength);

    const { max, min } = this._getMinMax(frame, frameLength);

    return max - min;
  };

  private _getMinMax(frame: Uint8Array | Float32Array, frameLength: number) {
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < frameLength; i++) {
      const voxel = frame[i];

      if (voxel < min) {
        min = voxel;
      }

      if (voxel > max) {
        max = voxel;
      }
    }
    return { max, min };
  }
}

WindowLevelTool.toolName = 'WindowLevel';
export default WindowLevelTool;

/**
 * The volume on display of a planar viewport in volume mode, which the drag
 * takes its multiplier from (the range of the middle slice of the volume),
 * as the 5.x tool read `getVolumeId()` of a legacy volume viewport.
 * Undefined in stack mode and for the other families: their multiplier
 * comes from the range of their image data, as on 5.x.
 */
function getVolumeIdOnDisplay(viewport: Types.IViewport): string | undefined {
  if (
    !utilities.viewportSupportsDisplaySetAppearance(viewport) ||
    utilities.getViewportContentMode(viewport) !== 'volume'
  ) {
    return;
  }

  return (viewport as PlanarViewport).getVolumeId();
}

type ViewportVOIProperties = {
  voiRange?: Types.VOIRange;
  voiLUTFunction?: unknown;
};

type ViewportWithAppearance = {
  getSourceDisplaySetId?: () => string | undefined;
  getEffectiveDisplaySetAppearance?: (
    displaySetId: string
  ) => ViewportVOIProperties | undefined;
  setDisplaySetAppearance?: (
    displaySetId: string,
    props: Partial<ViewportVOIProperties>
  ) => void;
};

/**
 * The window that the tool starts from: the one on display, the default
 * window of the image included.
 */
function getViewportVOIProperties(viewport): ViewportVOIProperties | undefined {
  const target = getAppearanceTarget(viewport);

  if (!target) {
    return;
  }

  return {
    ...(target.viewport.getEffectiveDisplaySetAppearance?.(
      target.displaySetId
    ) ?? {}),
  };
}

function setViewportVOIProperties(
  viewport,
  props: ViewportVOIProperties
): void {
  const target = getAppearanceTarget(viewport);

  if (!target) {
    return;
  }

  target.viewport.setDisplaySetAppearance?.(target.displaySetId, props);
}

function getAppearanceTarget(viewport):
  | {
      viewport: ViewportWithAppearance;
      displaySetId: string;
    }
  | undefined {
  const appearanceViewport = viewport as ViewportWithAppearance;
  const displaySetId = appearanceViewport.getSourceDisplaySetId?.();

  if (
    !displaySetId ||
    typeof appearanceViewport.getEffectiveDisplaySetAppearance !== 'function' ||
    typeof appearanceViewport.setDisplaySetAppearance !== 'function'
  ) {
    return;
  }

  return {
    viewport: appearanceViewport,
    displaySetId,
  };
}
