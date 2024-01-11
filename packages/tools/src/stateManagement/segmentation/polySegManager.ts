import ICRPolySeg from '@icr/polyseg-wasm';
import { Enums, Types, cache, geometryLoader } from '@cornerstonejs/core';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';
import { getSegmentation } from './segmentationState';
import addRepresentationData from './addRepresentationData';
import { getUniqueSegmentIndices } from '../../utilities/segmentation';
import { SurfaceSegmentationData } from '../../types/SurfaceTypes';

/**
 * Class to control polymorphic segmentations
 */
class PolySegManager {
  polySeg;
  initialized = false;

  // constructor() {}

  /**
   * Initialize the polySeg wasm module
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

  async getComputedSurfacesData(
    segmentation,
    segmentIndices = []
  ): Promise<SurfaceSegmentationData> {
    // need to check what is the underlying
    // representation and convert it to surface
    const representationData = segmentation.representationData;

    if (representationData.LABELMAP?.volumeId) {
      // convert volume labelmap to surface
      let rawSurfacesData;
      try {
        rawSurfacesData = await this.labelmapToSurfaceData(
          segmentation.segmentationId,
          segmentIndices
        );
      } catch (error) {
        console.warn('Error converting volume labelmap to surface');
        console.warn(error);
        return;
      }

      const geometryIds = [];
      const promises = rawSurfacesData.map((rawSurfaceData, index) => {
        const closedSurface = {
          id: `segmentation_${segmentation.segmentationId}_surface_${index}`,
          color: [
            Math.random() * 255,
            Math.random() * 255,
            Math.random() * 255,
          ],
          frameOfReferenceUID: 'test-frameOfReferenceUID',
          data: {
            points: rawSurfaceData.points,
            polys: rawSurfaceData.polys,
          },
        };

        geometryIds.push(closedSurface.id);

        const geometryId = closedSurface.id;
        return geometryLoader.createAndCacheGeometry(geometryId, {
          type: Enums.GeometryType.SURFACE,
          geometryData: closedSurface as Types.PublicSurfaceData,
        });
      });

      await Promise.all(promises);

      addRepresentationData({
        segmentationId: segmentation.segmentationId,
        type: SegmentationRepresentations.Surface,
        data: {
          geometryIds,
        },
      });

      return {
        geometryIds,
      };
    }
  }

  async labelmapToSurfaceData(
    segmentationId,
    segmentIndices
  ): Promise<Types.SurfaceData[]> {
    await this.initializeIfNecessary();

    // Todo: validate valid labelmap representation

    const segmentation = getSegmentation(segmentationId);
    const isVolume = isVolumeSegmentation(
      segmentation.representationData.LABELMAP
    );

    const indices = segmentIndices.length
      ? segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    const promises = indices.map((index) => {
      const surface = isVolume
        ? this._convertVolumeLabelmapToSurface(segmentation, index)
        : this._convertStackLabelmapToSurface(segmentation, index);

      return surface;
    });

    const surfaces = (await Promise.all(promises)) as Types.SurfaceData[];

    return surfaces;
  }

  async _convertVolumeLabelmapToSurface(
    segmentation,
    segmentIndex
  ): Promise<Types.SurfaceData> {
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
      [segmentIndex]
    ) as Types.SurfaceData;
  }

  async _convertStackLabelmapToSurface(
    segmentation,
    segmentIndices
  ): Promise<Types.SurfaceData> {
    throw new Error('Not implemented yet');
  }
}

const polySegManager = new PolySegManager();

export { polySegManager };
