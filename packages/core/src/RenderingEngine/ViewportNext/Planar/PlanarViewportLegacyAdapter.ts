import type { IVolumeInput } from '../../../types';
import type BlendModes from '../../../enums/BlendModes';
import type { PlanarLegacyViewportProperties } from './planarLegacyCompatibility';
import PlanarLegacyCompatibilityController from './PlanarLegacyCompatibilityController';
import PlanarViewport from './PlanarViewport';

class PlanarViewportLegacyAdapter extends PlanarViewport {
  private readonly legacyCompatibility =
    new PlanarLegacyCompatibilityController(
      this.createLegacyCompatibilityHost()
    );

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

  protected override onDestroy(): void {
    this.legacyCompatibility.destroy();
    super.onDestroy();
  }
}

export default PlanarViewportLegacyAdapter;
