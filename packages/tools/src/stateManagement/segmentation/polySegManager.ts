import ICRPolySeg from '@icr/polyseg-wasm';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';
import { getSegmentation } from './segmentationState';
import { cache } from '@cornerstonejs/core';

/**
 * Class to control polymorphic segmentations
 */
class PolySegManager {
  polySeg;
  initialized = false;

  // constructor() {}

  /**
   * Initialize the polyseg wasm module
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      return;
    }

    const polySeg = await new ICRPolySeg();
    await polySeg.initialize();

    this.polySeg = polySeg;
    this.initialized = true;
  }

  async initializeIfNecessary() {
    if (!this.initialized) {
      await this.init();
    }
  }

  async convertLabelmapToSurface({
    segmentationId,
    segmentIndices,
  }: {
    segmentationId: string;
    segmentIndices: number[];
  }) {
    await this.initializeIfNecessary();

    // Todo: validate valid labelmap representation

    const segmentation = getSegmentation(segmentationId);
    const isVolume = isVolumeSegmentation(
      segmentation.representationData.LABELMAP
    );

    const surface = isVolume
      ? await this._convertVolumeLabelmapToSurface(segmentation, segmentIndices)
      : await this._convertStackLabelmapToSurface(segmentation, segmentIndices);

    return surface;
  }

  async _convertVolumeLabelmapToSurface(segmentation, segmentIndices) {
    const volumeId = segmentation.representationData.LABELMAP.volumeId;

    const volume = cache.getVolume(volumeId);

    const scalarData = volume.getScalarData();
    const { dimensions, spacing, origin, direction } = volume;

    return this.polySeg.instance.convertLabelmapToSurface(
      scalarData,
      dimensions,
      spacing,
      direction,
      origin,
      segmentIndices
    );
  }

  async _convertStackLabelmapToSurface(segmentation, segmentIndices) {
    throw new Error('Not implemented yet');
  }
}

const polySegManager = new PolySegManager();

export { polySegManager };
