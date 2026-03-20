import type BlendModes from '../../../enums/BlendModes';
import type { IVolumeInput, Point2 } from '../../../types';
import type { PlanarLegacyViewportProperties } from './planarLegacyCompatibility';
import PlanarLegacyCompatibilityController, {
  type PlanarLegacyCompatibilityHost,
} from './PlanarLegacyCompatibilityController';
import type PlanarViewportV2 from './PlanarViewportV2';

class PlanarLegacyCompatibleViewport {
  private readonly legacyCompatibility: PlanarLegacyCompatibilityController;

  constructor(
    readonly viewport: PlanarViewportV2,
    host: PlanarLegacyCompatibilityHost
  ) {
    this.legacyCompatibility = new PlanarLegacyCompatibilityController(host);
  }

  get id(): string {
    return this.viewport.id;
  }

  get type() {
    return this.viewport.type;
  }

  get element(): HTMLDivElement {
    return this.viewport.element;
  }

  get renderingEngineId(): string {
    return this.viewport.renderingEngineId;
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

  getNumberOfSlices(): number {
    return this.legacyCompatibility.getNumberOfSlices();
  }

  getZoom(): number {
    return this.viewport.getZoom();
  }

  setZoom(zoom: number, canvasPoint?: Point2): void {
    this.viewport.setZoom(zoom, canvasPoint);
  }

  getPan(): Point2 {
    return this.viewport.getPan();
  }

  setPan(pan: Point2): void {
    this.viewport.setPan(pan);
  }

  removeDataId(dataId: string): void {
    this.legacyCompatibility.removeDataId(dataId);
  }

  destroy(): void {
    this.legacyCompatibility.destroy();
  }
}

export default PlanarLegacyCompatibleViewport;
