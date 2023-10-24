import {
  eventTarget,
  VolumeViewport,
  StackViewport,
  Types,
  Enums,
  utilities,
  getEnabledElement,
} from '@cornerstonejs/core';
import { ColorBar } from './ColorBar';
import type { ViewportColorBarProps, ColorBarVOIRange } from './types';

const { Events } = Enums;
const defaultImageRange = { lower: -1000, upper: 1000 };

class ViewportColorBar extends ColorBar {
  private _element: HTMLDivElement;
  private _volumeId: string;

  constructor(props: ViewportColorBarProps) {
    const { element, volumeId } = props;
    const imageRange = ViewportColorBar._getImageRange(element, volumeId);
    const voiRange = ViewportColorBar._getVOIRange(element, volumeId);

    super({ ...props, imageRange, voiRange });

    this._element = element;
    this._volumeId = volumeId;

    this._addCornerstoneEventListener();
  }

  public get element() {
    return this._element;
  }

  public get enabledElement() {
    return getEnabledElement(this._element);
  }

  protected getVOIMultipliers(): [number, number] {
    const { viewport } = this.enabledElement;
    return utilities.getVOIMultipliers(viewport, this._volumeId);
  }

  protected onVoiChange(voiRange: ColorBarVOIRange) {
    super.onVoiChange(voiRange);

    const { viewport } = this.enabledElement;

    if (viewport instanceof StackViewport) {
      viewport.setProperties({
        voiRange: voiRange,
      });
      viewport.render();
    } else if (viewport instanceof VolumeViewport) {
      const { _volumeId: volumeId } = this;
      const viewportsContainingVolumeUID = utilities.getViewportsWithVolumeId(
        volumeId,
        viewport.renderingEngineId
      );

      viewport.setProperties({ voiRange }, volumeId);
      viewportsContainingVolumeUID.forEach((vp) => vp.render());
    }
  }

  private static _getImageRange(element, volumeId?) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const actor = volumeId
      ? viewport.getActor(volumeId)
      : viewport.getDefaultActor();

    if (!actor) {
      return defaultImageRange;
    }

    const imageData = actor.actor.getMapper().getInputData();
    const imageRange = imageData.getPointData().getScalars().getRange();

    return imageRange[0] === 0 && imageRange[1] === 0
      ? defaultImageRange
      : { lower: imageRange[0], upper: imageRange[1] };
  }

  private static _getVOIRange(element, volumeId) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const actor = volumeId
      ? viewport.getActor(volumeId)
      : viewport.getDefaultActor();

    if (!actor) {
      return defaultImageRange;
    }

    const voiRange = actor.actor
      .getProperty()
      .getRGBTransferFunction(0)
      .getRange();

    return voiRange[0] === 0 && voiRange[1] === 0
      ? defaultImageRange
      : { lower: voiRange[0], upper: voiRange[1] };
  }

  private _stackNewImageCallback = () => {
    this.imageRange = ViewportColorBar._getImageRange(this._element);
  };

  private _imageVolumeModifiedCallback = (
    evt: Types.EventTypes.ImageVolumeModifiedEvent
  ) => {
    const { volumeId } = evt.detail.imageVolume;

    if (volumeId !== this._volumeId) {
      return;
    }

    const { _element: element } = this;
    this.imageRange = ViewportColorBar._getImageRange(element, volumeId);
  };

  private _viewportVOIModifiedCallback = (
    evt: Types.EventTypes.VoiModifiedEvent
  ) => {
    const { viewportId, volumeId, range: voiRange } = evt.detail;
    const { viewport } = this.enabledElement;

    if (viewportId !== viewport.id || volumeId !== this._volumeId) {
      return;
    }

    this.voiRange = voiRange;
  };

  private _addCornerstoneEventListener() {
    const { _element: element } = this;

    eventTarget.addEventListener(
      Events.IMAGE_VOLUME_MODIFIED,
      this._imageVolumeModifiedCallback
    );

    element.addEventListener(
      Events.STACK_NEW_IMAGE,
      this._stackNewImageCallback
    );

    element.addEventListener(
      Events.VOI_MODIFIED,
      this._viewportVOIModifiedCallback
    );
  }
}

export { ViewportColorBar as default, ViewportColorBar as ViewportColorBar };
