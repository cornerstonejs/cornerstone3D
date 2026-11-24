import type { Types, PlanarViewport } from '@cornerstonejs/core';
import { eventTarget, Enums, getEnabledElement } from '@cornerstonejs/core';
import { Colorbar } from './Colorbar';
import type { ViewportColorbarProps, ColorbarVOIRange } from './types';
import { getVOIMultipliers } from '../../getVOIMultipliers';

const { Events } = Enums;
const defaultImageRange = { lower: -1000, upper: 1000 };

/** The queries of a planar or 3D viewport that a colorbar reads. */
type ColorbarViewport = Types.IViewport &
  Partial<
    Pick<PlanarViewport, 'getDisplaySetIdForVolumeId' | 'getScalarRange'>
  >;

/**
 * The display set id of the data that a colorbar names by `volumeId`: the
 * display set of a planar or 3D viewport that shows the volume of that id,
 * else the id itself, which then is a display set id.
 */
function getDisplaySetId(viewport: Types.IViewport, volumeId: string): string {
  return (
    (viewport as ColorbarViewport).getDisplaySetIdForVolumeId?.(volumeId) ??
    volumeId
  );
}

/**
 * A colorbar associated with a viewport that updates automatically when the
 * viewport VOI changes or when the stack/volume are updated..
 *
 * Its `volumeId` names the data of the colorbar on the viewport: a volume id,
 * or the id of the display set that shows the volume. The colorbar sets the
 * window of that display set, and follows the events that name its volume.
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

    const viewport: Types.IViewport = this.enabledElement.viewport;

    // Viewports have no setProperties; VOI is applied
    // through the display-set appearance. _volumeId names the bound data
    // when known (multi-volume/fusion); otherwise the single-argument overload
    // targets the viewport's default binding.
    const { _volumeId: volumeId } = this;

    if (volumeId) {
      viewport.setDisplaySetAppearance(getDisplaySetId(viewport, volumeId), {
        voiRange,
      });
    } else {
      viewport.setDisplaySetAppearance({ voiRange });
    }
    viewport.render();
  }

  /**
   * The image range of the colorbar: the scalar range of the data that
   * `volumeId` names (the source when it names none), as the viewport gives
   * it on every render path, or the default range while the viewport has
   * none.
   */
  private static _getImageRange(element, volumeId?) {
    const { viewport } = getEnabledElement(element);
    const imageRange = (viewport as ColorbarViewport).getScalarRange?.(
      volumeId ? getDisplaySetId(viewport, volumeId) : undefined
    );

    return !imageRange || (imageRange[0] === 0 && imageRange[1] === 0)
      ? defaultImageRange
      : { lower: imageRange[0], upper: imageRange[1] };
  }

  private static _getVOIRange(element, volumeId) {
    const enabledElement = getEnabledElement(element);
    const viewport = enabledElement.viewport as PlanarViewport;

    const actor = viewport.getImageActor(volumeId);
    if (!actor) {
      return defaultImageRange;
    }

    const voiRange = actor.getProperty().getRGBTransferFunction(0).getRange();

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

  /**
   * Whether the volume id of an event names the data of the colorbar: it is
   * the `volumeId` of the colorbar, or the volume of the display set that the
   * `volumeId` of the colorbar names.
   */
  private _namesOwnData(volumeId: string | undefined): boolean {
    if (volumeId === this._volumeId) {
      return true;
    }

    const viewport = this.enabledElement?.viewport;

    return Boolean(
      volumeId &&
        viewport &&
        getDisplaySetId(viewport, volumeId) === this._volumeId
    );
  }

  private _newImageCallback = () => {
    this.imageRange = ViewportColorbar._getImageRange(
      this._element,
      this._volumeId
    );
  };

  private _imageVolumeModifiedCallback = (
    evt: Types.EventTypes.ImageVolumeModifiedEvent
  ) => {
    const { volumeId } = evt.detail;

    if (!this._namesOwnData(volumeId)) {
      return;
    }

    const { _element: element } = this;
    this.imageRange = ViewportColorbar._getImageRange(element, volumeId);
  };

  /**
   * Whether an appearance event names the data of the colorbar: the display
   * set or the volume that its `volumeId` names, or the source display set
   * when the colorbar names none.
   */
  private _namesOwnDisplaySet(
    detail: Types.EventTypes.DisplaySetAppearanceChangedEventDetail
  ): boolean {
    if (!this._volumeId) {
      return detail.role === 'source';
    }

    return (
      detail.displaySetId === this._volumeId ||
      (detail.volumeId !== undefined && this._namesOwnData(detail.volumeId))
    );
  }

  private _viewportAppearanceChangedCallback = (
    evt: Types.EventTypes.DisplaySetAppearanceChangedEvent
  ) => {
    const { viewportId, changedKeys, effective } = evt.detail;
    const { viewport } = this.enabledElement;

    if (viewportId !== viewport.id || !this._namesOwnDisplaySet(evt.detail)) {
      return;
    }

    if (changedKeys.includes('colormap') && effective.colormap?.name) {
      this.activeColormapName = effective.colormap.name;
    }

    if (changedKeys.includes('voiRange') && effective.voiRange) {
      this.voiRange = effective.voiRange;
      this.showAndAutoHideTicks();
    }
  };

  private _addCornerstoneEventListener() {
    const { _element: element } = this;

    eventTarget.addEventListener(
      Events.IMAGE_VOLUME_MODIFIED,
      this._imageVolumeModifiedCallback
    );

    element.addEventListener(Events.NEW_IMAGE, this._newImageCallback);

    element.addEventListener(
      Events.DISPLAY_SET_APPEARANCE_CHANGED,
      this._viewportAppearanceChangedCallback as EventListener
    );
  }

  public destroy(): void {
    super.destroy();
    const { _element: element } = this;

    eventTarget.removeEventListener(
      Events.IMAGE_VOLUME_MODIFIED,
      this._imageVolumeModifiedCallback
    );

    element.removeEventListener(Events.NEW_IMAGE, this._newImageCallback);

    element.removeEventListener(
      Events.DISPLAY_SET_APPEARANCE_CHANGED,
      this._viewportAppearanceChangedCallback as EventListener
    );
  }
}

export { ViewportColorbar as default, ViewportColorbar };
