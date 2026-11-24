import type { Types, PlanarViewport } from '@cornerstonejs/core';
import {
  ActorRenderMode,
  eventTarget,
  Enums,
  getEnabledElement,
  cache,
} from '@cornerstonejs/core';
import { Colorbar } from './Colorbar';
import type { ViewportColorbarProps, ColorbarVOIRange } from './types';
import { getVOIMultipliers } from '../../getVOIMultipliers';

const { Events } = Enums;
const defaultImageRange = { lower: -1000, upper: 1000 };

/**
 * Whether an image actor of a viewport draws a slice of a volume sampled on
 * the CPU (`vtkSampledSlice`). The input data of its mapper holds only the
 * visible slice, so the range of its scalars is not the range of the volume;
 * the volume range comes from the voxel manager that the input data carries.
 */
function isSampledSliceActor(viewport, actor): boolean {
  const actorEntries = viewport.getActors?.() ?? [];

  return actorEntries.some(
    (actorEntry) =>
      actorEntry.actor === actor &&
      actorEntry.actorMapper?.renderMode === ActorRenderMode.VTK_SAMPLED_SLICE
  );
}

/**
 * The display set id of the data that a colorbar names by `volumeId`: the
 * display set of a planar viewport that shows the volume of that id, else the
 * id itself, which then is a display set id.
 */
function getDisplaySetId(viewport: Types.IViewport, volumeId: string): string {
  return (
    (viewport as PlanarViewport).findDataIdByVolumeId?.(volumeId) ?? volumeId
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

  private static _getImageRange(element, volumeId?) {
    const enabledElement = getEnabledElement(element);
    const viewport = enabledElement.viewport as PlanarViewport;

    const actor = viewport.getImageActor(volumeId);

    if (!actor) {
      return defaultImageRange;
    }

    const imageData = actor.getMapper().getInputData();

    const scalarData = isSampledSliceActor(viewport, actor)
      ? undefined
      : imageData.getPointData().getScalars();

    let imageRange;
    if (!scalarData) {
      // Streaming volumes (legacy and native PLANAR) keep pixels in a
      // voxelManager rather than on the vtk point data. Prefer the voxelManager
      // attached to the mapper input data - it is present for both viewport
      // families and does not require a volumeId. A direct PLANAR viewport
      // exposes no getAllVolumeIds, so callers cannot always supply one; only
      // fall back to a cached volume lookup when the input voxelManager is
      // unavailable, and default the range instead of throwing.
      const inputVoxelManager = imageData.get('voxelManager')?.voxelManager;
      const volume = volumeId ? cache.getVolume(volumeId) : undefined;
      const voxelManager = inputVoxelManager ?? volume?.voxelManager;

      if (!voxelManager?.getRange) {
        return defaultImageRange;
      }

      const [minValue, maxValue] = voxelManager.getRange();
      imageRange = [minValue, maxValue];
    } else {
      imageRange = scalarData.getRange();
    }

    return imageRange[0] === 0 && imageRange[1] === 0
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

  private _viewportVOIModifiedCallback = (
    evt: Types.EventTypes.VoiModifiedEvent
  ) => {
    const { viewportId, volumeId, range: voiRange, colormap } = evt.detail;
    const { viewport } = this.enabledElement;
    if (viewportId !== viewport.id || !this._namesOwnData(volumeId)) {
      return;
    }

    this.voiRange = voiRange;

    if (colormap) {
      this.activeColormapName = colormap.name;
    }
    this.showAndAutoHideTicks();
  };

  private _viewportColormapModifiedCallback = (
    evt: Types.EventTypes.ColormapModifiedEvent
  ) => {
    const { viewportId, colormap, volumeId } = evt.detail;
    const { viewport } = this.enabledElement;

    if (viewportId !== viewport.id || !this._namesOwnData(volumeId)) {
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

    element.addEventListener(Events.NEW_IMAGE, this._newImageCallback);

    element.addEventListener(
      Events.VOI_MODIFIED,
      this._viewportVOIModifiedCallback as EventListener
    );

    element.addEventListener(
      Events.COLORMAP_MODIFIED,
      this._viewportColormapModifiedCallback as EventListener
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
      Events.VOI_MODIFIED,
      this._viewportVOIModifiedCallback as EventListener
    );

    element.removeEventListener(
      Events.COLORMAP_MODIFIED,
      this._viewportColormapModifiedCallback as EventListener
    );
  }
}

export { ViewportColorbar as default, ViewportColorbar };
