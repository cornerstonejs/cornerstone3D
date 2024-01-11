import ICRPolySeg from '@icr/polyseg-wasm';

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

  async convertLabelmapToSurface({ scalarData, metadata, segmentIndices }) {
    await this.initializeIfNecessary();

    const { dimensions, spacing, direction, origin } = metadata;

    const surface = this.polySeg.instance.convertLabelmapToSurface(
      scalarData,
      dimensions,
      spacing,
      direction,
      origin,
      segmentIndices
    );

    return surface;
  }
}

const polySegManager = new PolySegManager();

export { polySegManager };
