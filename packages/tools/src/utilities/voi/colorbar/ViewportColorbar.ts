import {
  eventTarget,
  VolumeViewport,
  StackViewport,
  Types,
  Enums,
  utilities,
  getEnabledElement,
} from '@cornerstonejs/core';
import { Colorbar } from './Colorbar';
import type { ViewportColorbarProps, ColorbarVOIRange } from './types';
import { getVOIMultipliers } from '../../getVOIMultipliers';

const { Events } = Enums;
const defaultImageRange = { lower: -1000, upper: 1000 };
/**
 * A colorbar associated with a viewport that updates automatically when the
 * viewport VOI changes or when the stack/volume are updated..
 */
class ViewportColorbar extends Colorbar {
  private _element: HTMLDivElement;
  private _volumeId: string;

  private _hideTicksTime: number;
  private _hideTicksTimeoutId: number;

  constructor(props: ViewportColorbarProps) {
    const { element, volumeId } = props;
    const imageRange = ViewportColorbar._getImageRange(element, volumeId);
    const voiRange = ViewportColorbar._getVOIRange(element, volumeId);

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
    return getVOIMultipliers(viewport, this._volumeId);
  }

  protected onVoiChange(voiRange: ColorbarVOIRange) {
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

    const volumeActor = volumeId
      ? viewport.getActor(volumeId)
      : viewport.getDefaultActor();

    if (!volumeActor || !utilities.isImageActor(volumeActor)) {
      return defaultImageRange;
    }

    const voiRange = (volumeActor.actor as Types.ImageActor)
      .getProperty()
      .getRGBTransferFunction(0)
      .getRange();

    return voiRange[0] === 0 && voiRange[1] === 0
      ? defaultImageRange
      : { lower: voiRange[0], upper: voiRange[1] };
  }

  private autoHideTicks = () => {
    // Avoiding calling setTimeout multiple times when manipulating the VOI
    // via WindowLevel tool for better performance
    if (this._hideTicksTimeoutId) {
      return;
    }

    const timeLeft = this._hideTicksTime - Date.now();

    if (timeLeft <= 0) {
      this.hideTicks();
    } else {
      this._hideTicksTimeoutId = window.setTimeout(() => {
        // Recursive call until there is no more time left
        this._hideTicksTimeoutId = 0;
        this.autoHideTicks();
      }, timeLeft);
    }
  };

  private showAndAutoHideTicks(interval = 1000) {
    this._hideTicksTime = Date.now() + interval;
    this.showTicks();
    this.autoHideTicks();
  }

  private _stackNewImageCallback = () => {
    this.imageRange = ViewportColorbar._getImageRange(this._element);
  };

  private _imageVolumeModifiedCallback = (
    evt: Types.EventTypes.ImageVolumeModifiedEvent
  ) => {
    const { volumeId } = evt.detail.imageVolume;

    if (volumeId !== this._volumeId) {
      return;
    }

    const { _element: element } = this;
    this.imageRange = ViewportColorbar._getImageRange(element, volumeId);
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
    this.showAndAutoHideTicks();
  };

  private _viewportColormapModifiedCallback = (
    evt: Types.EventTypes.ColormapModifiedEvent
  ) => {
    const { viewportId, colormap, volumeId  } = evt.detail;
    const { viewport } = this.enabledElement;

    if (viewportId !== viewport.id || volumeId !== this._volumeId) {
      return;
    }

    this.activeColormapName = colormap.name;
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
      this._viewportVOIModifiedCallback as EventListener
    );

    element.addEventListener(
      Events.COLORMAP_MODIFIED,
      this._viewportColormapModifiedCallback as EventListener
    );
  }
}

export { ViewportColorbar as default, ViewportColorbar };
