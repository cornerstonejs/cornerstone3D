import { BaseTool } from './base';
import {
  getEnabledElement,
  VolumeViewport,
  StackViewport,
  utilities,
  cache,
  Types,
} from '@cornerstonejs/core';
import { EventTypes } from '../types';

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
    const { renderingEngine, viewport } = enabledElement;

    let volumeId,
      lower,
      upper,
      modality,
      newRange,
      viewportsContainingVolumeUID;
    let isPreScaled = false;

    const properties = viewport.getProperties();
    if (viewport instanceof VolumeViewport) {
      const targetId = this.getTargetId(viewport as Types.IVolumeViewport);
      volumeId = targetId.split(/volumeId:|\?/)[1];
      viewportsContainingVolumeUID = utilities.getViewportsWithVolumeId(
        volumeId,
        renderingEngine.id
      );
      ({ lower, upper } = properties.voiRange);
      const volume = cache.getVolume(volumeId);
      if (!volume) {
        throw new Error('Volume not found ' + volumeId);
      }
      modality = volume.metadata.Modality;
      isPreScaled = volume.scaling && Object.keys(volume.scaling).length > 0;
    } else if (properties.voiRange) {
      modality = (viewport as any).modality;
      ({ lower, upper } = properties.voiRange);
      const { preScale = { scaled: false } } = viewport.getImageData?.() || {};
      isPreScaled =
        preScale.scaled && preScale.scalingParameters?.suvbw !== undefined;
    } else {
      throw new Error('Viewport is not a valid type');
    }

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
      });
    }

    // If the range is not valid. Do nothing
    if (newRange.lower >= newRange.upper) {
      return;
    }

    viewport.setProperties({
      voiRange: newRange,
    });

    viewport.render();

    if (viewport instanceof VolumeViewport) {
      viewportsContainingVolumeUID.forEach((vp) => {
        if (viewport !== vp) {
          vp.render();
        }
      });
      return;
    }
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

  getNewRange({ viewport, deltaPointsCanvas, volumeId, lower, upper }) {
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
    return utilities.windowLevel.toLowHighRange(windowWidth, windowCenter);
  }

  _getMultiplierFromDynamicRange(viewport, volumeId) {
    let imageDynamicRange;

    if (volumeId) {
      const imageVolume = cache.getVolume(volumeId);
      const { dimensions } = imageVolume;
      const scalarData = imageVolume.getScalarData();
      const calculatedDynamicRange = this._getImageDynamicRangeFromMiddleSlice(
        scalarData,
        dimensions
      );
      const BitsStored = imageVolume?.metadata?.BitsStored;
      const metadataDynamicRange = BitsStored ? 2 ** BitsStored : Infinity;
      // Burned in Pixels often use pixel values above the BitsStored.
      // This results in a multiplier which is way higher than what you would
      // want in practice. Thus we take the min between the metadata dynamic
      // range and actual middel slice dynamic range.
      imageDynamicRange = Math.min(
        calculatedDynamicRange,
        metadataDynamicRange
      );
    } else {
      imageDynamicRange = this._getImageDynamicRangeFromViewport(viewport);
    }

    const ratio = imageDynamicRange / DEFAULT_IMAGE_DYNAMIC_RANGE;

    return ratio > 1 ? Math.round(ratio) : ratio;
  }

  _getImageDynamicRangeFromViewport(viewport) {
    const { imageData } = viewport.getImageData();
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
      scalarData = imageData.getPointData().getScalars();
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
