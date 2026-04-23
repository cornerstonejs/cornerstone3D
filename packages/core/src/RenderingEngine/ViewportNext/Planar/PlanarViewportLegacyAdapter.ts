import cache from '../../../cache/cache';
import RENDERING_DEFAULTS from '../../../constants/rendering';
import { Events } from '../../../enums';
import type { IVolumeInput } from '../../../types';
import type DisplayArea from '../../../types/displayArea';
import type BlendModes from '../../../enums/BlendModes';
import triggerEvent from '../../../utilities/triggerEvent';
import type { PlanarLegacyViewportProperties } from './planarLegacyCompatibility';
import PlanarLegacyCompatibilityController from './PlanarLegacyCompatibilityController';
import PlanarViewport from './PlanarViewport';

class PlanarViewportLegacyAdapter extends PlanarViewport {
  private readonly legacyCompatibility =
    new PlanarLegacyCompatibilityController(
      this.createLegacyCompatibilityHost()
    );

  private cloneTuple<T extends ArrayLike<number> | undefined>(
    tuple: T
  ): T extends undefined ? undefined : [number, number, number] {
    if (!tuple) {
      return undefined as T extends undefined
        ? undefined
        : [number, number, number];
    }

    return Array.from(tuple) as T extends undefined
      ? undefined
      : [number, number, number];
  }

  override getCamera(): ReturnType<PlanarViewport['getCamera']> {
    const camera = super.getCamera();
    const orientation =
      camera.orientation && typeof camera.orientation === 'object'
        ? {
            ...camera.orientation,
            viewUp: this.cloneTuple(camera.orientation.viewUp),
            viewPlaneNormal: this.cloneTuple(
              camera.orientation.viewPlaneNormal
            ),
          }
        : camera.orientation;

    return {
      ...camera,
      focalPoint: this.cloneTuple(camera.focalPoint),
      position: this.cloneTuple(camera.position),
      viewUp: this.cloneTuple(camera.viewUp),
      viewPlaneNormal: this.cloneTuple(camera.viewPlaneNormal),
      orientation,
    };
  }

  get volumeIds(): Set<string> {
    const ids = new Set<string>();

    for (const actorEntry of this.getActors()) {
      const candidates = [actorEntry.referencedId, actorEntry.uid];

      for (const candidate of candidates) {
        if (typeof candidate === 'string' && cache.getVolume(candidate)) {
          ids.add(candidate);
        }
      }
    }

    return ids;
  }

  getAllVolumeIds(): string[] {
    return Array.from(this.volumeIds);
  }

  getDisplayArea(): DisplayArea | undefined {
    return this.defaultOptions?.displayArea;
  }

  setDisplayArea(displayArea: DisplayArea, suppressEvents = false): void {
    if (!displayArea) {
      return;
    }

    this.defaultOptions.displayArea = displayArea;

    const { imageArea, imageCanvasPoint, scale, storeAsInitialCamera } =
      displayArea;

    if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) {
      this.setZoom(scale);
    } else if (imageArea) {
      const [areaX = 1, areaY = 1] = imageArea;
      const effectiveArea = Math.max(areaX, areaY, 1e-3);

      this.setZoom(this.getZoom() / effectiveArea);
    }

    if (imageCanvasPoint) {
      const { imagePoint, canvasPoint = imagePoint || [0.5, 0.5] } =
        imageCanvasPoint;
      const [canvasX, canvasY] = canvasPoint;
      const [imageX, imageY] = imagePoint || canvasPoint;
      const canvasWidth = this.canvas.width || this.element.clientWidth || 1;
      const canvasHeight = this.canvas.height || this.element.clientHeight || 1;
      const currentPan = this.getPan();
      const nextPan: [number, number] = [
        currentPan[0] + canvasWidth * (canvasX - imageX),
        currentPan[1] + canvasHeight * (canvasY - imageY),
      ];

      this.setPan(nextPan);
    }

    if (!suppressEvents) {
      triggerEvent(this.element, Events.DISPLAY_AREA_MODIFIED, {
        viewportId: this.id,
        displayArea,
        storeAsInitialCamera,
      });
    }
  }

  removeData(dataId: string): void {
    super.removeData(dataId);
    this.legacyCompatibility.removeData(dataId);
  }

  async setStack(imageIds: string[], currentImageIdIndex = 0): Promise<string> {
    return this.legacyCompatibility.setStack(imageIds, currentImageIdIndex);
  }

  async setVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    return this.legacyCompatibility.setVolumes(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  async addVolumes(
    volumeInputArray: IVolumeInput[],
    immediate = false,
    suppressEvents = false
  ): Promise<void> {
    return this.legacyCompatibility.addVolumes(
      volumeInputArray,
      immediate,
      suppressEvents
    );
  }

  setProperties(
    properties: PlanarLegacyViewportProperties = {},
    volumeIdOrSuppressEvents?: string | boolean,
    suppressEvents = false
  ): void {
    this.legacyCompatibility.setProperties(
      properties,
      volumeIdOrSuppressEvents,
      suppressEvents
    );
  }

  getProperties(volumeId?: string): PlanarLegacyViewportProperties {
    return this.legacyCompatibility.getProperties(volumeId);
  }

  resetProperties(volumeId?: string): void {
    this.legacyCompatibility.resetProperties(volumeId);
  }

  setDefaultProperties(
    properties: PlanarLegacyViewportProperties = {},
    imageId?: string
  ): void {
    this.legacyCompatibility.setDefaultProperties(properties, imageId);
  }

  clearDefaultProperties(imageId?: string): void {
    this.legacyCompatibility.clearDefaultProperties(imageId);
  }

  resetToDefaultProperties(): void {
    this.legacyCompatibility.resetToDefaultProperties();
  }

  getBlendMode(filterActorUIDs?: string[]): BlendModes | undefined {
    return this.legacyCompatibility.getBlendMode(filterActorUIDs);
  }

  setBlendMode(
    blendMode: BlendModes,
    filterActorUIDs?: string[],
    immediate = false
  ): void {
    this.legacyCompatibility.setBlendMode(
      blendMode,
      filterActorUIDs,
      immediate
    );
  }

  getSlabThickness(): number {
    let slabThickness = RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;

    for (const actor of this.getActors()) {
      if (actor.slabThickness > slabThickness) {
        slabThickness = actor.slabThickness;
      }
    }

    return slabThickness;
  }

  getNumberOfSlices(): number {
    return this.legacyCompatibility.getNumberOfSlices();
  }

  protected override onDestroy(): void {
    this.legacyCompatibility.destroy();
    super.onDestroy();
  }
}

export default PlanarViewportLegacyAdapter;
