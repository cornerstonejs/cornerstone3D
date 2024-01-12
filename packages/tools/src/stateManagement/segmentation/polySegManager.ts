import ICRPolySeg from '@icr/polyseg-wasm';
import {
  Enums,
  Types,
  cache,
  eventTarget,
  geometryLoader,
} from '@cornerstonejs/core';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';
import {
  findSegmentationRepresentationByUID,
  getSegmentation,
  getSegmentationRepresentations,
  getToolGroupIdsWithSegmentation,
} from './segmentationState';
import addRepresentationData from './addRepresentationData';
import { getUniqueSegmentIndices } from '../../utilities/segmentation';
import { SurfaceSegmentationData } from '../../types/SurfaceTypes';
import { getColorForSegmentIndex } from './config/segmentationColor';
import { LabelmapSegmentationDataVolume } from '../../types/LabelmapTypes';
import { Events } from '../../enums';
import { SegmentationDataModifiedEventDetail } from '../../types/EventTypes';
import { debounce } from '../../utilities';
import { triggerSegmentationModified } from './triggerSegmentationEvents';
import { ToolGroupSpecificRepresentations } from '../../types/SegmentationStateTypes';

/**
 * Class to control polymorphic segmentations
 */
class PolySegManager {
  polySeg;
  initialized = false;
  computedRepresentations = new Map<string, SegmentationRepresentations[]>();
  _debouncedSegmentationModified;

  constructor() {
    this._debouncedSegmentationModified = debounce(
      (event) => this.onSegmentationDataModified(event),
      300
    );
  }

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

  unsubscribeFromSegmentationChanges() {
    eventTarget.removeEventListener(
      Events.SEGMENTATION_DATA_MODIFIED,
      this._debouncedSegmentationModified
    );
  }

  subscribeToSegmentationChanges() {
    this.unsubscribeFromSegmentationChanges();

    eventTarget.addEventListener(
      Events.SEGMENTATION_DATA_MODIFIED,
      this._debouncedSegmentationModified
    );
  }

  onSegmentationDataModified(event) {
    const { segmentationId } =
      event.detail as SegmentationDataModifiedEventDetail;

    const computedRepresentations =
      this.computedRepresentations.get(segmentationId);

    if (!computedRepresentations.length) {
      return;
    }

    const promises = computedRepresentations.map((representationType) => {
      switch (representationType) {
        case SegmentationRepresentations.Surface:
          return this.updateSurfaceRepresentation(segmentationId);
      }
    });

    Promise.all(promises);
  }

  async getComputedSurfacesData(
    segmentationRepresentationUID,
    segmentIndices = []
  ): Promise<SurfaceSegmentationData> {
    // need to check what is the underlying
    // representation and convert it to surface
    const { segmentationRepresentation, toolGroupId } =
      findSegmentationRepresentationByUID(segmentationRepresentationUID);

    if (!segmentationRepresentation) {
      throw new Error(
        `No segmentation representation found for UID ${segmentationRepresentationUID}`
      );
    }

    const { segmentationId } = segmentationRepresentation;
    const segmentation = getSegmentation(segmentationId);
    const representationData = segmentation.representationData;

    if (
      (representationData.LABELMAP as LabelmapSegmentationDataVolume)?.volumeId
    ) {
      // convert volume labelmap to surface
      let rawSurfacesDataObj;
      try {
        rawSurfacesDataObj = await this.labelmapToSurfaceData(
          segmentation.segmentationId,
          segmentIndices
        );
      } catch (error) {
        console.warn('Error converting volume labelmap to surface');
        console.warn(error);
        return;
      }

      const geometryIds = [];
      const promises = Object.keys(rawSurfacesDataObj).map((index) => {
        const rawSurfaceData = rawSurfacesDataObj[index];
        const segmentIndex = rawSurfaceData.segmentIndex;

        const color = getColorForSegmentIndex(
          toolGroupId,
          segmentationRepresentationUID,
          segmentIndex
        ).slice(0, 3);

        const closedSurface = {
          id: `segmentation_${segmentation.segmentationId}_surface_${segmentIndex}`,
          color,
          frameOfReferenceUID: 'test-frameOfReferenceUID',
          data: {
            points: rawSurfaceData.data.points,
            polys: rawSurfaceData.data.polys,
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

      this.addComputedRepresentation(
        segmentationId,
        SegmentationRepresentations.Surface
      );

      this.subscribeToSegmentationChanges();

      return {
        geometryIds,
      };
    }
  }

  addComputedRepresentation(
    segmentationId: string,
    representationType: SegmentationRepresentations
  ) {
    if (!this.computedRepresentations.has(segmentationId)) {
      this.computedRepresentations.set(segmentationId, []);
    }

    const representations = this.computedRepresentations.get(segmentationId);
    if (!representations.includes(representationType)) {
      representations.push(representationType);
    }
  }

  async labelmapToSurfaceData(
    segmentationId,
    segmentIndices = []
  ): Promise<{ segmentIndex: number; data: Types.SurfaceData }[]> {
    await this.initializeIfNecessary();

    // Todo: validate valid labelmap representation
    const segmentation = getSegmentation(segmentationId);
    const isVolume = isVolumeSegmentation(
      segmentation.representationData.LABELMAP
    );

    const indices = segmentIndices.length
      ? segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    const promises = indices.map(async (index) => {
      const surface = isVolume
        ? await this._convertVolumeLabelmapToSurface(segmentation, index)
        : await this._convertStackLabelmapToSurface(segmentation, index);

      return { segmentIndex: index, data: surface };
    });

    const surfaces = await Promise.all(promises);

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

  async updateSurfaceRepresentation(segmentationId) {
    const surfacesObj = await this.labelmapToSurfaceData(segmentationId);
    const segmentation = getSegmentation(segmentationId);

    const indices = getUniqueSegmentIndices(segmentationId);

    if (!indices.length) {
      // means all segments were removed so we need to empty out
      // the geometry data
      const geometryIds = segmentation.representationData.SURFACE.geometryIds;
      geometryIds.forEach((geometryId) => {
        const geometry = cache.getGeometry(geometryId);
        geometry.data.points = [];
        geometry.data.polys = [];
      });

      triggerSegmentationModified(segmentationId);

      return;
    }

    const promises = surfacesObj.map((surfaceObj) => {
      const { segmentIndex, data } = surfaceObj;

      const geometryId = `segmentation_${segmentationId}_surface_${segmentIndex}`;

      const geometry = cache.getGeometry(geometryId);

      if (geometry) {
        if (indices.includes(segmentIndex)) {
          // if the geometry already exists and the segmentIndex is
          // still present, update the geometry data
          geometry.data.points = data.points;
          geometry.data.polys = data.polys;
          return;
        } else {
          geometry.data.points = [];
          geometry.data.polys = [];
          return;
        }
      }

      // otherwise it means it is a new surface / segment
      const toolGroupIds = getToolGroupIdsWithSegmentation(segmentationId);

      return toolGroupIds.map((toolGroupId) => {
        const segmentationRepresentations = getSegmentationRepresentations(
          toolGroupId
        ) as ToolGroupSpecificRepresentations;

        return segmentationRepresentations.map((segmentationRepresentation) => {
          if (
            segmentationRepresentation.type !==
            SegmentationRepresentations.Surface
          ) {
            return;
          }

          const color = getColorForSegmentIndex(
            toolGroupId,
            segmentationRepresentation.segmentationRepresentationUID,
            Number(segmentIndex)
          ).slice(0, 3);

          const closedSurface = {
            id: geometryId,
            color,
            frameOfReferenceUID: 'test-frameOfReferenceUID',
            data: {
              points: data.points,
              polys: data.polys,
            },
          };

          const promise = geometryLoader.createAndCacheGeometry(geometryId, {
            type: Enums.GeometryType.SURFACE,
            geometryData: closedSurface as Types.PublicSurfaceData,
          });

          // update the representation data also to include this new
          // geometryId
          segmentation.representationData.SURFACE.geometryIds.push(geometryId);
          return promise;
        });
      });
    });

    Promise.all(promises);

    triggerSegmentationModified(segmentationId);
  }
}

const polySegManager = new PolySegManager();

export { polySegManager };
