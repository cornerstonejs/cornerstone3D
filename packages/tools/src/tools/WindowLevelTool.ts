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

    if (viewport instanceof VolumeViewport) {
      const targetId = this.getTargetId(viewport as Types.IVolumeViewport);
      volumeId = targetId.split('volumeId:')[1];
      viewportsContainingVolumeUID = utilities.getViewportsWithVolumeId(
        volumeId,
        renderingEngine.id
      );
      const properties = viewport.getProperties();
      ({ lower, upper } = properties.voiRange);
      const volume = cache.getVolume(volumeId);
      modality = volume.metadata.Modality;
      isPreScaled = volume.scaling && Object.keys(volume.scaling).length > 0;
    } else if (viewport instanceof StackViewport) {
      const properties = viewport.getProperties();
      modality = viewport.modality;
      ({ lower, upper } = properties.voiRange);
      const { preScale } = viewport.getImageData();
      isPreScaled = preScale.scaled;
    } else {
      throw new Error('Viewport is not a valid type');
    }

    // If modality is PT, treat it special to not include the canvas delta in
    // the x direction. For other modalities, use the canvas delta in both
    // directions, and if the viewport is a volumeViewport, the multiplier
    // is calculate using the volume min and max.
    if (modality === PT && isPreScaled) {
      newRange = this.getPTNewRange({
        deltaPointsCanvas: deltaPoints.canvas,
        lower,
        upper,
        clientHeight: element.clientHeight,
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

    if (viewport instanceof StackViewport) {
      viewport.setProperties({
        voiRange: newRange,
      });

      viewport.render();
      return;
    }

    if (viewport instanceof VolumeViewport) {
      viewport.setProperties({
        voiRange: newRange,
      });

      viewportsContainingVolumeUID.forEach((vp) => {
        vp.render();
      });
      return;
    }
  }

  getPTNewRange({ deltaPointsCanvas, lower, upper, clientHeight }) {
    const deltaY = deltaPointsCanvas[1];
    const multiplier = 5 / clientHeight;
    const wcDelta = deltaY * multiplier;

    upper -= wcDelta;
    upper = Math.max(upper, 0.1);

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
      const { dimensions, scalarData } = imageVolume;
      imageDynamicRange = this._getImageDynamicRangeFromMiddleSlice(
        scalarData,
        dimensions
      );
    } else {
      imageDynamicRange = this._getImageDynamicRangeFromViewport(viewport);
    }

    const ratio = imageDynamicRange / DEFAULT_IMAGE_DYNAMIC_RANGE;

    let multiplier = DEFAULT_MULTIPLIER;

    if (ratio > 1) {
      multiplier = Math.round(ratio);
    }

    return multiplier;
  }

  _getImageDynamicRangeFromViewport(viewport) {
    const { imageData } = viewport.getImageData();
    const dimensions = imageData.getDimensions();

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
