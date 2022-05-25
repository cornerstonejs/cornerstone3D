import { BaseTool } from './base';
import {
  getEnabledElement,
  Enums,
  triggerEvent,
  VolumeViewport,
  StackViewport,
  utilities,
  cache,
  Types,
} from '@cornerstonejs/core';

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
export default class WindowLevelTool extends BaseTool {
  static toolName = 'WindowLevel';
  touchDragCallback: () => void;
  mouseDragCallback: () => void;

  constructor(
    toolProps = {},
    defaultToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
    }
  ) {
    super(toolProps, defaultToolProps);

    this.touchDragCallback = this._dragCallback.bind(this);
    this.mouseDragCallback = this._dragCallback.bind(this);
  }

  _dragCallback(evt) {
    const { element, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewportId, viewport } = enabledElement;

    let volumeId,
      volumeActor,
      lower,
      upper,
      rgbTransferFunction,
      modality,
      newRange,
      viewportsContainingVolumeUID;
    let useDynamicRange = false;
    let isPreScaled = false;

    if (viewport instanceof VolumeViewport) {
      const targetId = this.getTargetId(viewport as Types.IVolumeViewport);
      volumeId = targetId.split('volumeId:')[1];
      const actor = viewport.getActor(volumeId);
      volumeActor = actor.actor as unknown as Types.VolumeActor;
      rgbTransferFunction = volumeActor.getProperty().getRGBTransferFunction(0);
      viewportsContainingVolumeUID =
        utilities.getVolumeViewportsContainingVolumeId(
          volumeId,
          renderingEngine.id
        );
      [lower, upper] = rgbTransferFunction.getRange();
      const volume = cache.getVolume(volumeId);
      modality = volume.metadata.Modality;
      useDynamicRange = true;
      isPreScaled = volume.scaling && Object.keys(volume.scaling).length > 0;
    } else if (viewport instanceof StackViewport) {
      const properties = viewport.getProperties();
      modality = viewport.modality;
      ({ lower, upper } = properties.voiRange);
      isPreScaled = viewport.isImagePreScaled(viewport.getCurrentImageId());
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
        deltaPointsCanvas: deltaPoints.canvas,
        useDynamicRange,
        volumeId,
        lower,
        upper,
      });
    }

    const eventDetail: Types.EventTypes.VoiModifiedEventDetail = {
      volumeId,
      viewportId,
      range: newRange,
    };

    if (viewport instanceof StackViewport) {
      viewport.setProperties({
        voiRange: newRange,
      });

      viewport.render();
      return;
    }

    // Only trigger event for volume since the stack event is triggered inside
    // the stackViewport, Todo: we need the setProperties API on the volume viewport
    triggerEvent(element, Enums.Events.VOI_MODIFIED, eventDetail);
    rgbTransferFunction.setRange(newRange.lower, newRange.upper);

    viewportsContainingVolumeUID.forEach((vp) => {
      vp.render();
    });
  }

  getPTNewRange({ deltaPointsCanvas, lower, upper, clientHeight }) {
    const deltaY = deltaPointsCanvas[1];
    const multiplier = 5 / clientHeight;
    const wcDelta = deltaY * multiplier;

    upper -= wcDelta;
    upper = Math.max(upper, 0.1);

    return { lower, upper };
  }

  getNewRange({ deltaPointsCanvas, useDynamicRange, volumeId, lower, upper }) {
    // Todo: enabling a viewport twice in a row sets the imageDynamicRange to be zero for some reason
    // 1 was too little
    const multiplier = useDynamicRange
      ? this._getMultiplyerFromDynamicRange(volumeId)
      : DEFAULT_MULTIPLIER;

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

  _getMultiplyerFromDynamicRange(volumeId) {
    if (!volumeId) {
      throw new Error('No volumeId provided for the volume Viewport');
    }

    let multiplier = DEFAULT_MULTIPLIER;
    const imageDynamicRange = this._getImageDynamicRange(volumeId);

    const ratio = imageDynamicRange / DEFAULT_IMAGE_DYNAMIC_RANGE;

    if (ratio > 1) {
      multiplier = Math.round(ratio);
    }

    return multiplier;
  }

  _getImageDynamicRange = (volumeId: string) => {
    const imageVolume = cache.getVolume(volumeId);
    const { dimensions, scalarData } = imageVolume;
    const middleSliceIndex = Math.floor(dimensions[2] / 2);

    // Todo: volume shouldn't only be streaming image volume, it can be imageVolume
    // if (!(imageVolume instanceof StreamingImageVolume)) {
    //   return
    // }

    // const streamingVolume = <StreamingImageVolume>imageVolume

    // if (!streamingVolume.loadStatus.cachedFrames[middleSliceIndex]) {
    //   return DEFAULT_IMAGE_DYNAMIC_RANGE
    // }

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

    return max - min;
  };
}
