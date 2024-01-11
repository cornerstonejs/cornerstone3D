import ICRPolySeg from '@icr/polyseg-wasm';
import { Enums, Types, cache, geometryLoader } from '@cornerstonejs/core';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';
import { getSegmentation } from './segmentationState';
import addRepresentationData from './addRepresentationData';

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

  async getComputedSurfaceData(segmentation) {
    // need to check what is the underlying
    // representation and convert it to surface
    const representationData = segmentation.representationData;

    if (representationData.LABELMAP?.volumeId) {
      // convert volume labelmap to surface
      let rawSurfaceData;
      try {
        rawSurfaceData = await this.convertLabelmapToSurface(
          segmentation.segmentationId,
          []
        );
      } catch (error) {
        console.warn('Error converting volume labelmap to surface');
        console.warn(error);
      }

      const surfaceSegmentationData = await this._surfacePostOp(
        segmentation,
        rawSurfaceData
      );

      return surfaceSegmentationData;
    }
  }

  async _surfacePostOp(segmentation, surfaceData) {
    const closedSurface = {
      // Todo: make configurable
      id: 'closedSurface',
      color: [200, 232, 20],
      frameOfReferenceUID: 'test-frameOfReferenceUID',
      data: {
        points: surfaceData.points,
        polys: surfaceData.polys,
      },
    };

    const geometryId = closedSurface.id;
    await geometryLoader.createAndCacheGeometry(geometryId, {
      type: Enums.GeometryType.SURFACE,
      geometryData: closedSurface as Types.PublicSurfaceData,
    });

    // Add the segmentations to state
    addRepresentationData({
      segmentationId: segmentation.segmentationId,
      type: SegmentationRepresentations.Surface,
      data: {
        geometryId,
      },
    });

    return {
      geometryId,
    };
  }

  async convertLabelmapToSurface(segmentationId, segmentIndices) {
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
