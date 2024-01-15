import ICRPolySeg from '@icr/polyseg-wasm';
import {
  Enums,
  Types,
  cache,
  eventTarget,
  geometryLoader,
  volumeLoader,
  utilities,
  StackViewport,
  VolumeViewport,
} from '@cornerstonejs/core';
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
import {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import { Events, SegmentationRepresentations } from '../../enums';
import { SegmentationDataModifiedEventDetail } from '../../types/EventTypes';
import { debounce, pointInShapeCallback } from '../../utilities';
import { triggerSegmentationModified } from './triggerSegmentationEvents';
import {
  SegmentationRepresentationData,
  ToolGroupSpecificRepresentations,
} from '../../types/SegmentationStateTypes';
import { ContourSegmentationData } from '../../types/ContourTypes';
import { getAnnotation } from '../annotation/annotationState';
import { getBoundingBoxAroundShapeWorld } from '../../utilities/boundingBox';
import { validate as validateLabelmap } from '../../tools/displayTools/Labelmap/validateLabelmap';
import { isPointInsidePolyline3D } from '../../utilities/math/polyline';

/**
 * Class to control polymorphic segmentations
 */
class PolySegManager {
  polySeg;
  initialized = false;
  computedRepresentations = new Map<string, SegmentationRepresentations[]>();
  _debouncedSegmentationModified;

  // Map of conversion paths between source and target representations
  // You should read it as "source" -> "targets"
  conversionPaths = new Map<
    SegmentationRepresentations,
    Set<SegmentationRepresentations>
  >([
    [
      SegmentationRepresentations.Labelmap,
      new Set([SegmentationRepresentations.Surface]),
    ],
    [
      SegmentationRepresentations.Contour,
      new Set([SegmentationRepresentations.Labelmap]),
    ],
  ]);

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
  public async init() {
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

  /**
   * Unsubscribes from segmentation changes by removing the event listener for segmentation data modification.
   */
  private unsubscribeFromSegmentationChanges() {
    eventTarget.removeEventListener(
      Events.SEGMENTATION_DATA_MODIFIED,
      this._debouncedSegmentationModified
    );
  }

  /**
   * Subscribes to segmentation changes by adding an event listener for the SEGMENTATION_DATA_MODIFIED event.
   * If there is an existing listener, it will be unsubscribed before adding the new listener.
   */
  private subscribeToSegmentationChanges() {
    this.unsubscribeFromSegmentationChanges();

    eventTarget.addEventListener(
      Events.SEGMENTATION_DATA_MODIFIED,
      this._debouncedSegmentationModified
    );
  }

  /**
   * Determines whether the requested representation can be computed, based on
   * the existing representation types and available conversion paths.
   *
   * @param segmentationRepresentationUID - The UID of the desired segmentation representation.
   * @returns true if the requested representation can be computed, otherwise false.
   */
  public canComputeRequestedRepresentation(
    segmentationRepresentationUID: string
  ): boolean {
    const representationInfo = findSegmentationRepresentationByUID(
      segmentationRepresentationUID
    );

    if (!representationInfo?.segmentationRepresentation) {
      return false;
    }

    const { segmentationRepresentation } = representationInfo;
    const { type: representationType, polySeg } = segmentationRepresentation;

    if (!polySeg) {
      return false;
    }

    const { representationData } = getSegmentation(
      segmentationRepresentation.segmentationId
    );

    const existingRepresentationTypes =
      this.getExistingRepresentationTypes(representationData);

    return existingRepresentationTypes.some((existingRepresentationType) =>
      this.canConvertFromTo(existingRepresentationType, representationType)
    );
  }

  /**
   * Checks whether a conversion path exists between two given representation types.
   *
   * @param fromRepresentationType - The starting representation type.
   * @param toRepresentationType - The target representation type.
   * @returns true if the conversion is available, otherwise false.
   */
  public canConvertFromTo(fromRepresentationType, toRepresentationType) {
    const availablePaths = this.conversionPaths.get(fromRepresentationType);

    if (!availablePaths) {
      return false;
    }

    return availablePaths.has(toRepresentationType);
  }

  /**
   * Retrieves the existing representation types for the given representationData
   * by verifying the validity of each representation type.
   *
   * @param representationData - The representation data
   * @returns supportedTypes - An array of valid representation types
   */
  private getExistingRepresentationTypes(
    representationData: SegmentationRepresentationData
  ): string[] {
    const supportedTypes: string[] = [];

    Object.keys(representationData).forEach((representationType) => {
      const representationTypeData = representationData[representationType];

      let validateFn;
      switch (representationType) {
        case SegmentationRepresentations.Labelmap:
          validateFn = validateLabelmap;
          break;
        // Todo: add validation for other representation types
      }

      if (validateFn) {
        try {
          validateFn(representationTypeData);
          supportedTypes.push(representationType);
        } catch (error) {
          console.warn(
            `Validation failed for labelmap of type ${representationType}`
          );
        }
      } else {
        supportedTypes.push(representationType);
      }
    });

    return supportedTypes;
  }
  /**
   * Handles the event when segmentation data is modified.
   * @param event - The event object containing the segmentation data.
   * @returns void
   */
  private onSegmentationDataModified(event) {
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
        case SegmentationRepresentations.Labelmap:
          return this.updateLabelmapRepresentation(segmentationId);
      }
    });

    Promise.all(promises);
  }

  /**
   * Adds a computed representation to the polySegManager for a given segmentation.
   * The purpose of this is to keep track of which representations have been computed
   * for a given segmentation so that we can update them when the segmentation data
   * is modified.
   *
   * @param segmentationId - The ID of the segmentation.
   * @param representationType - The type of the computed representation to add.
   */
  private addComputedRepresentationInternally(
    segmentationId: string,
    segmentationRepresentationUID: string
  ) {
    if (!this.computedRepresentations.has(segmentationId)) {
      this.computedRepresentations.set(segmentationId, []);
    }

    const segmentationRepresentation = findSegmentationRepresentationByUID(
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      return;
    }

    const {
      segmentationRepresentation: { type: representationType },
    } = segmentationRepresentation;

    const representations = this.computedRepresentations.get(segmentationId);
    if (!representations.includes(representationType)) {
      representations.push(representationType);
    }
  }

  /**
   * Retrieves the computed  surface data for a given segmentation representation.
   * - If the underlying segmentation data is a labelmap, it converts the labelmap to a surface.
   * - Todo: Contour -> Surface (not yet implemented)
   *
   * @param viewport - The viewport associated with the segmentation.
   * @param segmentationRepresentationUID - The UID of the segmentation representation. In fact
   * the segmentationId is enough to identify the segmentation, BUT some of the properties
   * such as colors are stored in the segmentation representation.
   * @param segmentIndices - Optional array of segment indices to retrieve labelmap data for.
   * If not provided, it will retrieve labelmap data for all segments.
   *
   * @returns A promise that resolves to the surface segmentation data.
   */
  public async computeAndAddSurfaceRepresentation(
    viewport,
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
        rawSurfacesDataObj = await this.computeSurfacesFromLabelmapSegmentation(
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

      this.addComputedRepresentationInternally(
        segmentationId,
        segmentationRepresentationUID
      );

      this.subscribeToSegmentationChanges();

      return {
        geometryIds,
      };
    } else {
      throw new Error(
        'Not enough data to convert to surface, currently only support converting volume labelmap to surface if available'
      );
    }
  }

  /**
   * Retrieves the computed labelmap data for a given segmentation representation.
   * - If the underlying segmentation data is a contour, it converts the contour to a labelmap.
   * - Todo: Surface -> Contour (not yet implemented)
   *
   * @param viewport - The viewport associated with the segmentation.
   * @param segmentationRepresentationUID - The UID of the segmentation representation. In fact
   * the segmentationId is enough to identify the segmentation, BUT some of the properties
   * such as colors are stored in the segmentation representation.
   * @param segmentIndices - Optional array of segment indices to retrieve labelmap data for.
   * If not provided, it will retrieve labelmap data for all segments.
   *
   * @returns A promise that resolves to the labelmap segmentation data.
   */
  public async computeAndAddLabelmapRepresentation(
    viewport,
    segmentationRepresentationUID,
    segmentIndices = []
  ): Promise<LabelmapSegmentationData> {
    // need to check what is the underlying
    // representation and convert it to surface
    const { segmentationRepresentation } = findSegmentationRepresentationByUID(
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      throw new Error(
        `No segmentation representation found for UID ${segmentationRepresentationUID}`
      );
    }

    const { segmentationId } = segmentationRepresentation;
    const segmentation = getSegmentation(segmentationId);
    const { representationData } = segmentation;

    if (representationData.CONTOUR as ContourSegmentationData) {
      // convert volume labelmap to surface
      let rawLabelmapData;
      try {
        rawLabelmapData = await this.computeLabelmapFromContourSegmentation(
          viewport,
          segmentationId
        );
      } catch (error) {
        console.warn('Error converting  contour to labelmap');
        console.warn(error);
        return;
      }

      const { volumeId } = rawLabelmapData;

      if (!volumeId) {
        throw new Error(
          'Currently only supporting volume labelmap to convert from contour to labelmap'
        );
      }

      addRepresentationData({
        segmentationId,
        type: SegmentationRepresentations.Labelmap,
        data: {
          volumeId,
        },
      });

      this.addComputedRepresentationInternally(
        segmentationId,
        SegmentationRepresentations.Surface
      );

      this.subscribeToSegmentationChanges();

      triggerSegmentationModified(segmentationId);

      return {
        volumeId,
      };
    } else {
      throw new Error(
        'Not enough data to convert to surface, currently only support converting volume labelmap to surface if available'
      );
    }
  }

  /**
   * Converts labelmap data to surface data for the specified segmentation.
   * @param segmentationId - The ID of the segmentation.
   * @param segmentIndices - An optional array of segment indices to convert.
   * If not provided, all unique segment indices will be converted.
   * @returns A promise that resolves to an array of objects containing the segment index and the corresponding surface data.
   */
  async computeSurfacesFromLabelmapSegmentation(
    segmentationId,
    segmentIndices = []
  ): Promise<{ segmentIndex: number; data: Types.SurfaceData }[]> {
    await this.initializeIfNecessary();

    // Todo: validate valid labelmap representation
    const segmentation = getSegmentation(segmentationId);

    if (!segmentation?.representationData?.LABELMAP) {
      throw new Error('No labelmap data found for segmentation');
    }

    const isVolume = isVolumeSegmentation(
      segmentation.representationData.LABELMAP
    );

    const indices = segmentIndices.length
      ? segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    const labelmapRepresentationData = segmentation.representationData.LABELMAP;

    const promises = indices.map(async (index) => {
      const surface = isVolume
        ? await this._convertVolumeLabelmapToSurface(
            labelmapRepresentationData as LabelmapSegmentationDataVolume,
            index
          )
        : await this._convertStackLabelmapToSurface(
            labelmapRepresentationData as LabelmapSegmentationData,
            index
          );

      return { segmentIndex: index, data: surface };
    });

    const surfaces = await Promise.all(promises);

    return surfaces;
  }

  /**
   * Computes a labelmap segmentation data volume from contour segmentation.
   *
   * @param viewport - The viewport.
   * @param segmentationId - The ID of the segmentation.
   * @param segmentationIndices - Optional array of segmentation indices.
   * @returns A promise that resolves to a LabelmapSegmentationDataVolume object containing the volume ID.
   */
  async computeLabelmapFromContourSegmentation(
    viewport,
    segmentationId,
    segmentationIndices = []
  ): Promise<LabelmapSegmentationDataVolume | LabelmapSegmentationDataStack> {
    await this.initializeIfNecessary();

    // Todo: validate valid labelmap representation
    const segmentation = getSegmentation(segmentationId);
    const segmentIndices = segmentationIndices.length
      ? segmentationIndices
      : getUniqueSegmentIndices(segmentationId);

    let result;
    if (viewport instanceof VolumeViewport) {
      result = this._convertContourToVolumeLabelmap(
        viewport,
        segmentation.representationData.CONTOUR,
        segmentIndices
      );
    } else if (viewport instanceof StackViewport) {
      result = this._convertContourToStackLabelmap(
        viewport,
        segmentation.representationData.CONTOUR,
        segmentIndices
      );
    } else {
      throw new Error('Unsupported viewport type');
    }

    return result;
  }

  async _convertVolumeLabelmapToSurface(
    labelmapRepresentationData: LabelmapSegmentationDataVolume,
    segmentIndex: number
  ): Promise<Types.SurfaceData> {
    const volumeId = labelmapRepresentationData.volumeId;

    const volume = cache.getVolume(volumeId);

    const scalarData = volume.getScalarData();
    const { dimensions, spacing, origin, direction } = volume;

    const results = this.polySeg.instance.convertLabelmapToSurface(
      scalarData,
      dimensions,
      spacing,
      direction,
      origin,
      [segmentIndex]
    ) as Types.SurfaceData;

    return results;
  }

  async _convertStackLabelmapToSurface(
    segmentation: LabelmapSegmentationData,
    segmentIndice: number
  ): Promise<Types.SurfaceData> {
    throw new Error('Not implemented yet');
  }

  /**
   * Convert contour representation to labelmap representation.
   * @param viewport - The viewport where the point resides. We need the viewport
   * to assume some default values for the labelmap.
   * @param segmentation - The segmentation data being converted.
   * @returns A Promise that resolves to a LabelmapSegmentationDataVolume containing the volumeId of the new labelmap.
   */
  async _convertContourToVolumeLabelmap(
    viewport: Types.IVolumeViewport,
    contourRepresentationData: ContourSegmentationData,
    segmentIndices: number[]
  ) {
    const annotationMap = contourRepresentationData.annotationUIDsMap;

    const defaultActor = viewport.getDefaultActor();
    const { uid: volumeId } = defaultActor;
    const segmentationVolume =
      await volumeLoader.createAndCacheDerivedSegmentationVolume(volumeId);

    const segmentationVoxelManager =
      utilities.VoxelManager.createVolumeVoxelManager(
        segmentationVolume.dimensions,
        segmentationVolume.getScalarData()
      );

    for (const index of segmentIndices) {
      const annotationUIDsInSegment = annotationMap.get(index);

      // Combine bounding boxes for all annotations in the segment
      const combinedBoundingBox = [
        [Infinity, -Infinity],
        [Infinity, -Infinity],
        [Infinity, -Infinity],
      ];

      const annotations = Array.from(annotationUIDsInSegment).map((uid) => {
        const annotation = getAnnotation(uid);
        const bounds = getBoundingBoxAroundShapeWorld(
          annotation.data.contour.polyline
        );

        // Update combined bounding box
        for (let dim = 0; dim < 3; dim++) {
          combinedBoundingBox[dim][0] = Math.min(
            combinedBoundingBox[dim][0],
            bounds[dim][0]
          );
          combinedBoundingBox[dim][1] = Math.max(
            combinedBoundingBox[dim][1],
            bounds[dim][1]
          );
        }

        return annotation;
      });

      const [iMin, jMin, kMin] = utilities.transformWorldToIndex(
        segmentationVolume.imageData,
        [
          combinedBoundingBox[0][0],
          combinedBoundingBox[1][0],
          combinedBoundingBox[2][0],
        ]
      );

      const [iMax, jMax, kMax] = utilities.transformWorldToIndex(
        segmentationVolume.imageData,
        [
          combinedBoundingBox[0][1],
          combinedBoundingBox[1][1],
          combinedBoundingBox[2][1],
        ]
      );

      // Run the pointInShapeCallback for the combined bounding box
      pointInShapeCallback(
        segmentationVolume.imageData,
        (pointLPS) => {
          // Check if the point is inside any of the polylines for this segment
          return annotations.some((annotation) =>
            isPointInsidePolyline3D(
              pointLPS as Types.Point3,
              annotation.data.contour.polyline
            )
          );
        },
        ({ pointIJK }) => {
          segmentationVoxelManager.setAtIJKPoint(
            pointIJK as Types.Point3,
            index
          );
        },
        [
          [iMin, iMax],
          [jMin, jMax],
          [kMin, kMax],
        ]
      );
    }

    return {
      volumeId: segmentationVolume.volumeId,
    };
  }

  /**
   * Convert contour representation to stack labelmap representation.
   * @param viewport - The viewport where the point resides. We need the viewport
   * to assume some default values for the labelmap.
   * @param segmentation - The segmentation data being converted.
   * @returns A Promise that resolves to a LabelmapSegmentationDataStack containing the imageIdReferenceMap of the new labelmap.
   */
  async _convertContourToStackLabelmap(
    viewport: Types.IStackViewport,
    contourRepresentationData: ContourSegmentationData,
    segmentIndices: number[]
  ) {
    throw new Error('Not implemented yet');
  }

  async updateSurfaceRepresentation(segmentationId) {
    // Todo: this should be general and not only for labelmap
    // need to check what is the underlying available
    const surfacesObj = await this.computeSurfacesFromLabelmapSegmentation(
      segmentationId
    );
    const segmentation = getSegmentation(segmentationId);
    const indices = getUniqueSegmentIndices(segmentationId);

    if (!indices.length) {
      // means all segments were removed so we need to empty out
      // the geometry data
      const geometryIds = segmentation.representationData.SURFACE.geometryIds;
      geometryIds.forEach((geometryId) => {
        const geometry = cache.getGeometry(geometryId);
        const surface = geometry.data as Types.ISurface;
        surface.setPoints([]);
        surface.setPolys([]);
      });

      triggerSegmentationModified(segmentationId);

      return;
    }

    const promises = surfacesObj.map((surfaceObj) => {
      const { segmentIndex, data } = surfaceObj;

      const geometryId = `segmentation_${segmentationId}_surface_${segmentIndex}`;

      const geometry = cache.getGeometry(geometryId);
      const surface = geometry.data as Types.ISurface;

      if (geometry) {
        if (indices.includes(segmentIndex)) {
          // if the geometry already exists and the segmentIndex is
          // still present, update the geometry data
          surface.setPoints(data.points);
          surface.setPolys(data.polys);
          return;
        } else {
          surface.setPoints([]);
          surface.setPolys([]);
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
