import ICRPolySeg from '@icr/polyseg-wasm';
import vtkCutter from '@kitware/vtk.js/Filters/Core/Cutter';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkProperty from '@kitware/vtk.js/Rendering/Core/Property';
import hull from 'hull.js';

import {
  Enums,
  Types,
  cache,
  eventTarget,
  geometryLoader,
  volumeLoader,
  utilities,
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
import { addAnnotation, getAnnotation } from '../annotation/annotationState';
import { getBoundingBoxAroundShapeWorld } from '../../utilities/boundingBox';
import { validate as validateLabelmap } from '../../tools/displayTools/Labelmap/validateLabelmap';
import { isPointInsidePolyline3D } from '../../utilities/math/polyline';
import { getDeduplicatedVTKPolyDataPoints } from '../../utilities/contours/getDeduplicatedVTKPolyDataPoints';
import { findContoursFromReducedSet } from '../../utilities/contours/contourFinder';
import { generateContourSetsFromLabelmap } from '../../utilities/contours';
import vtkClipClosedSurface from '@kitware/vtk.js/Filters/General/ClipClosedSurface';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';

type RawSurfacesData = { segmentIndex: number; data: Types.SurfaceData }[];

/**
 * Class to control polymorphic segmentations
 */
class PolySegManager {
  initialized = false;
  private polySeg;
  private computedRepresentations = new Map<
    string,
    SegmentationRepresentations[]
  >();
  private _debouncedSegmentationModified;

  // Map of conversion paths between source and target representations
  // You should read it as "source" -> "targets"
  conversionPaths = new Map<
    SegmentationRepresentations,
    Set<SegmentationRepresentations>
  >([
    [
      SegmentationRepresentations.Labelmap,
      new Set([
        SegmentationRepresentations.Surface,
        SegmentationRepresentations.Contour,
      ]),
    ],
    [
      SegmentationRepresentations.Contour,
      new Set([
        SegmentationRepresentations.Labelmap,
        SegmentationRepresentations.Surface,
      ]),
    ],
    [
      SegmentationRepresentations.Surface,
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
   * Retrieves the computed  surface data for a given segmentation representation.
   * - If the underlying segmentation data is a labelmap, it converts the labelmap to a surface.
   * - Todo: Contour -> Surface (not yet implemented)
   *
   * @param viewport - The viewport associated with the segmentation.
   * @param segmentationId - The id of the segmentation
   * @param options - Optional object containing additional options.
   * @param [options.segmentIndices] - Optional array of segment indices to retrieve surface data for.
   * If not provided, it will retrieve surface data for all segments.
   * @param [options.segmentationRepresentationUID] - Optional segmentation representation UID to retrieve color data from.
   *
   * @returns A promise that resolves to the surface segmentation data.
   */
  public async computeAndAddSurfaceRepresentation(
    segmentationId: string,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    } = {}
  ): Promise<SurfaceSegmentationData> {
    const surfacesData = await this.computeSurfaceRepresentation(
      segmentationId,
      options
    );

    addRepresentationData({
      segmentationId,
      type: SegmentationRepresentations.Surface,
      data: {
        ...surfacesData,
      },
    });

    this.addComputedRepresentationInternally(
      segmentationId,
      SegmentationRepresentations.Surface
    );

    this.subscribeToSegmentationChanges();

    triggerSegmentationModified(segmentationId);

    return surfacesData;
  }

  /**
   * Retrieves the computed labelmap data for a given segmentation representation.
   * - If the underlying segmentation data is a contour, it converts the contour to a labelmap.
   * - Todo: Surface -> Contour (not yet implemented)
   *
   * @param segmentationId - The id of the segmentation
   * @param options - Optional object containing additional options.
   * @param [options.segmentIndices] - Optional array of segment indices to retrieve labelmap data for.
   * If not provided, it will retrieve labelmap data for all segments.
   * @param [options.segmentationRepresentationUID] - Optional segmentation representation UID to retrieve color data from.
   * @param [options.isVolume] - Optional flag to indicate whether the labelmap should be a volume or stack.
   *
   * @returns A promise that resolves to the labelmap segmentation data.
   */
  public async computeAndAddLabelmapRepresentation(
    segmentationId: string,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
      isVolume?: boolean;
      viewport?: Types.IVolumeViewport | Types.IStackViewport;
    } = {}
  ): Promise<LabelmapSegmentationData> {
    const labelmapData = await this.computeLabelmapRepresentation(
      segmentationId,
      options
    );

    addRepresentationData({
      segmentationId,
      type: SegmentationRepresentations.Labelmap,
      data: {
        ...labelmapData,
      },
    });

    this.addComputedRepresentationInternally(
      segmentationId,
      SegmentationRepresentations.Labelmap
    );

    this.subscribeToSegmentationChanges();

    triggerSegmentationModified(segmentationId);

    return labelmapData;
  }

  /**
   * Retrieves the computed contour data for a given segmentation representation.
   * - If the underlying segmentation data is a labelmap, it converts it to the contour
   *
   * @param segmentationId - The id of the segmentation
   * @param options - Optional object containing additional options.
   * @param [options.segmentIndices] - Optional array of segment indices to retrieve labelmap data for.
   * If not provided, it will retrieve labelmap data for all segments.
   * @param [options.segmentationRepresentationUID] - Optional segmentation representation UID to retrieve color data from.
   * @param [options.viewport] - Optional viewport to use for default values.
   *
   * @returns A promise that resolves to the labelmap segmentation data.
   */
  public async computeAndAddContourRepresentation(
    segmentationId: string,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
      viewport?: Types.IVolumeViewport | Types.IStackViewport;
    } = {}
  ): Promise<ContourSegmentationData> {
    let contourData = await this.computeContourRepresentation(
      segmentationId,
      options
    );

    contourData = contourData.filter((contour) => contour.length > 2);

    const uids = [];
    contourData.forEach((contour, index) => {
      // chop each contour instead of a flat array to array of x,y,z (3 elements)
      // const polyline = [];
      // for (let i = 0; i < contour.length; i += 3) {
      //   polyline.push([contour[i], contour[i + 1], contour[i + 2]]);
      // }

      const uid = utilities.uuidv4();
      uids.push(uid);
      // const contourSegmentationAnnotation = {
      //   annotationUID: uid,
      //   data: {
      //     contour: {
      //       closed: true,
      //       polyline: contour,
      //     },
      //     segmentation: {
      //       segmentationId,
      //       segmentIndex: 1, // Todo
      //       segmentationRepresentationUID:
      //         options.segmentationRepresentationUID,
      //     },
      //   },
      //   highlighted: false,
      //   invalidated: false,
      //   isLocked: false,
      //   isVisible: true,
      //   metadata: {
      //     toolName: 'PlanarFreehandContourSegmentationTool',
      //     FrameOfReferenceUID: options.viewport.getFrameOfReferenceUID(),
      //     viewPlaneNormal: options.viewport.getCamera().viewPlaneNormal,
      //   },
      // };

      const contourSegmentationAnnotation = {
        annotationUID: uid,
        data: {
          contour: {
            polyline: contour,
          },
          handles: {
            activeHandleIndex: null,
          },
        },
        highlighted: false,
        invalidated: false,
        isLocked: false,
        isVisible: true,
        metadata: {
          toolName: 'PlanarFreehandROI',
          FrameOfReferenceUID: options.viewport.getFrameOfReferenceUID(),
          viewPlaneNormal: options.viewport.getCamera().viewPlaneNormal,
        },
      };

      addAnnotation(
        contourSegmentationAnnotation,
        options.viewport.getFrameOfReferenceUID()
      );
    });

    const annotationUIDsMap = new Map();
    annotationUIDsMap.set(1, uids);
    addRepresentationData({
      segmentationId,
      type: SegmentationRepresentations.Contour,
      data: { annotationUIDsMap },
    });

    this.addComputedRepresentationInternally(
      segmentationId,
      SegmentationRepresentations.Contour
    );

    this.subscribeToSegmentationChanges();

    triggerSegmentationModified(segmentationId);

    return contourData;
  }

  /**
   * Computes the surface representation of a segmentation.
   * It will find the right conversion path based on the existing representation types and available conversion paths.
   *
   *
   * @param segmentationId - The ID of the segmentation.
   * @param options - Optional parameters for surface computation.
   * @param [options.segmentIndices] - Optional array of segment indices to convert.
   * If not provided, all unique segment indices will be converted.
   * @param [options.segmentationRepresentationUID] - Optional segmentation representation UID to retrieve color data from.
   *
   * @throws An error if there is not enough data to convert to surface.
   */
  public async computeSurfaceRepresentation(
    segmentationId: string,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    } = {}
  ): Promise<SurfaceSegmentationData> {
    const rawSurfacesData = await this.createRawSurfaceData(
      segmentationId,
      options
    );

    if (!rawSurfacesData) {
      throw new Error(
        'Not enough data to convert to surface, currently only support converting volume labelmap to surface if available'
      );
    }

    const surfacesData = await this.createAndCacheSurfacesFromRaw(
      segmentationId,
      rawSurfacesData,
      options
    );

    return surfacesData;
  }

  /**
   * Computes the labelmap representation for a given segmentation.
   * It will find the right conversion path based on the existing representation types and available conversion paths.
   *
   * @param segmentationId - The ID of the segmentation.
   * @param options - Optional parameters for the computation.
   * @param [options.segmentIndices] - Optional array of segment indices to convert.
   * If not provided, all unique segment indices will be converted.
   * @param [options.segmentationRepresentationUID] - Optional segmentation representation UID to retrieve color data from.
   * @param [options.viewport] - Optional viewport to use for default values.
   * @returns A promise that resolves to the labelmap segmentation data.
   */
  public async computeContourRepresentation(
    segmentationId: string,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
      viewport?: Types.IVolumeViewport | Types.IStackViewport;
    } = {}
  ): Promise<ContourSegmentationData> {
    const rawContourData = await this.createRawContourData(
      segmentationId,
      options
    );

    if (!rawContourData) {
      throw new Error(
        'Not enough data to convert to contour, currently only support converting labelmap to contour if available'
      );
    }

    // We don't need to cache the labelmap data since it is already cached
    // by the converter, since it needed to write it to the cache in order
    // to create the geometry
    // await this.createAndCacheLabelmapFromRaw(segmentationId, rawContourData);

    return rawContourData;
  }
  /**
   * Computes the labelmap representation for a given segmentation.
   * It will find the right conversion path based on the existing representation types and available conversion paths.
   *
   * @param segmentationId - The ID of the segmentation.
   * @param options - Optional parameters for the computation.
   * @param [options.segmentIndices] - Optional array of segment indices to convert.
   * If not provided, all unique segment indices will be converted.
   * @param [options.segmentationRepresentationUID] - Optional segmentation representation UID to retrieve color data from.
   * @param [options.isVolume] - Optional flag to indicate whether the labelmap should be a volume or stack.
   * @param [options.viewport] - Optional viewport to use for default values.
   * @returns A promise that resolves to the labelmap segmentation data.
   */
  public async computeLabelmapRepresentation(
    segmentationId: string,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
      isVolume?: boolean;
      viewport?: Types.IVolumeViewport | Types.IStackViewport;
    } = {}
  ): Promise<LabelmapSegmentationData> {
    const rawLabelmapData = await this.createRawLabelmapData(
      segmentationId,
      options
    );

    if (!rawLabelmapData) {
      throw new Error(
        'Not enough data to convert to labelmap, currently only support converting contour to labelmap if available'
      );
    }

    // We don't need to cache the labelmap data since it is already cached
    // by the converter, since it needed to write it to the cache in order
    // to create the geometry
    await this.createAndCacheLabelmapFromRaw(segmentationId, rawLabelmapData);

    return rawLabelmapData;
  }

  /**
   * Converts labelmap data to surface data for the specified segmentation.
   * @param segmentationId - The ID of the segmentation.
   * @param segmentIndices - An optional array of segment indices to convert.
   * If not provided, all unique segment indices will be converted.
   * @returns A promise that resolves to an array of objects containing the segment index and the corresponding surface data.
   */
  public async computeSurfaceFromLabelmapSegmentation(
    segmentationId,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    } = {}
  ): Promise<RawSurfacesData> {
    await this.initializeIfNecessary();

    // Todo: validate valid labelmap representation
    const segmentation = getSegmentation(segmentationId);

    if (!segmentation?.representationData?.LABELMAP) {
      throw new Error('No labelmap data found for segmentation');
    }

    const isVolume = isVolumeSegmentation(
      segmentation.representationData.LABELMAP
    );

    const segmentIndices = options.segmentIndices?.length
      ? options.segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    const labelmapRepresentationData = segmentation.representationData.LABELMAP;

    const promises = segmentIndices.map(async (index) => {
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
   * Converts contour data to surface data for the specified segmentation.
   * @param segmentationId - The ID of the segmentation.
   * @param segmentIndices - An optional array of segment indices to convert.
   * If not provided, all unique segment indices will be converted.
   * @returns A promise that resolves to an array of objects containing the segment index and the corresponding surface data.
   */
  public async computeSurfaceFromContourSegmentation(
    segmentationId,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    } = {}
  ): Promise<RawSurfacesData> {
    await this.initializeIfNecessary();

    // Todo: validate valid labelmap representation
    const segmentation = getSegmentation(segmentationId);

    const segmentIndices = options.segmentIndices?.length
      ? options.segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    const contourRepresentationData = segmentation.representationData.CONTOUR;

    const promises = segmentIndices.map(async (index) => {
      const surface = await this._convertContourToSurface(
        contourRepresentationData as ContourSegmentationData,
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
  public async computeLabelmapFromContourSegmentation(
    segmentationId,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
      viewport?: Types.IVolumeViewport | Types.IStackViewport;
    } = {}
  ): Promise<LabelmapSegmentationDataVolume | LabelmapSegmentationDataStack> {
    await this.initializeIfNecessary();

    const isVolume = options.viewport instanceof VolumeViewport ?? true;

    if (isVolume && !options.viewport) {
      // Todo: we don't have support for volume viewport without providing the
      // viewport, since we need to get the referenced volumeId from the viewport
      // but we can alternatively provide the volumeId directly, or even better
      // the target metadata for the volume (spacing, origin, dimensions, etc.)
      // and then we can create the volume from that
      throw new Error(
        'Cannot compute labelmap from contour segmentation without providing the viewport'
      );
    }

    const segmentIndices = options.segmentIndices?.length
      ? options.segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    const segmentation = getSegmentation(segmentationId);
    const representationData = segmentation.representationData.CONTOUR;

    let result;
    if (isVolume) {
      const defaultActor = options.viewport.getDefaultActor();
      const { uid: volumeId } = defaultActor;
      const segmentationVolume =
        await volumeLoader.createAndCacheDerivedSegmentationVolume(volumeId);

      result = this._convertContourToVolumeLabelmap(
        representationData,
        segmentationVolume,
        {
          segmentIndices,
          segmentationRepresentationUID: options.segmentationRepresentationUID,
        }
      );
    } else {
      const cachedImages = new Map();
      result = this._convertContourToStackLabelmap(
        representationData,
        cachedImages,
        {
          segmentIndices,
          segmentationRepresentationUID: options.segmentationRepresentationUID,
        }
      );
    }

    return result;
  }

  /**
   * Computes a labelmap segmentation data volume from surface segmentation.
   *
   * @param viewport - The viewport.
   * @param segmentationId - The ID of the segmentation.
   * @param segmentationIndices - Optional array of segmentation indices.
   * @returns A promise that resolves to a LabelmapSegmentationDataVolume object containing the volume ID.
   */
  public async computeLabelmapFromSurfaceSegmentation(
    segmentationId,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
      viewport?: Types.IVolumeViewport | Types.IStackViewport;
    } = {}
  ): Promise<LabelmapSegmentationDataVolume | LabelmapSegmentationDataStack> {
    await this.initializeIfNecessary();

    const isVolume = options.viewport instanceof VolumeViewport ?? true;

    if (isVolume && !options.viewport) {
      // Todo: we don't have support for volume viewport without providing the
      // viewport, since we need to get the referenced volumeId from the viewport
      // but we can alternatively provide the volumeId directly, or even better
      // the target metadata for the volume (spacing, origin, dimensions, etc.)
      // and then we can create the volume from that
      throw new Error(
        'Cannot compute labelmap from contour segmentation without providing the viewport'
      );
    }

    const segmentIndices = options.segmentIndices?.length
      ? options.segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    const segmentation = getSegmentation(segmentationId);
    const representationData = segmentation.representationData.SURFACE;

    let result;
    if (isVolume) {
      const defaultActor = options.viewport.getDefaultActor();
      const { uid: volumeId } = defaultActor;
      const segmentationVolume =
        await volumeLoader.createAndCacheDerivedSegmentationVolume(volumeId);

      result = this._convertSurfaceToVolumeLabelmap(
        representationData,
        segmentationVolume,
        {
          segmentIndices,
          segmentationRepresentationUID: options.segmentationRepresentationUID,
        }
      );
    } else {
      const cachedImages = new Map();
      result = this._convertSurfaceToStackLabelmap(
        representationData,
        cachedImages,
        {
          segmentIndices,
          segmentationRepresentationUID: options.segmentationRepresentationUID,
        }
      );
    }

    return result;
  }

  /**
   * Computes a contour segmentation data from labelmap segmentation.
   *
   * @param viewport - The viewport.
   * @param segmentationId - The ID of the segmentation.
   * @param segmentationIndices - Optional array of segmentation indices.
   * @returns A promise that resolves to a LabelmapSegmentationDataVolume object containing the volume ID.
   */
  public async computeContourFromLabelmapSegmentation(
    segmentationId,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
      viewport?: Types.IVolumeViewport | Types.IStackViewport;
    } = {}
  ): Promise<ContourSegmentationData> {
    await this.initializeIfNecessary();

    const isVolume = options.viewport instanceof VolumeViewport ?? true;

    if (isVolume && !options.viewport) {
      // Todo: we don't have support for volume viewport without providing the
      // viewport, since we need to get the referenced volumeId from the viewport
      // but we can alternatively provide the volumeId directly, or even better
      // the target metadata for the volume (spacing, origin, dimensions, etc.)
      // and then we can create the volume from that
      throw new Error(
        'Cannot compute labelmap from contour segmentation without providing the viewport yet'
      );
    }

    const segmentIndices = options.segmentIndices?.length
      ? options.segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    const segmentation = getSegmentation(segmentationId);
    const representationData = segmentation.representationData.LABELMAP;

    let result;
    if (isVolume) {
      result = this._convertVolumeLabelmapToContour(
        <LabelmapSegmentationDataVolume>representationData,
        {
          segmentIndices,
          segmentationRepresentationUID: options.segmentationRepresentationUID,
          viewport: options.viewport,
        }
      );
    } else {
      throw new Error(
        'Labelmap to contour conversion for stack viewport not yet implemented'
      );
    }

    return result;
  }

  private async createAndCacheSurfacesFromRaw(
    segmentationId: string,
    rawSurfacesData: RawSurfacesData,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    } = {}
  ) {
    let segmentationRepresentation, toolGroupId;
    if (options.segmentationRepresentationUID) {
      ({ segmentationRepresentation, toolGroupId } =
        findSegmentationRepresentationByUID(
          options.segmentationRepresentationUID
        ));
    }

    const segmentation = getSegmentation(segmentationId);

    const geometryIds = [];
    const promises = Object.keys(rawSurfacesData).map((index) => {
      const rawSurfaceData = rawSurfacesData[index];
      const segmentIndex = rawSurfaceData.segmentIndex;

      let color;
      if (segmentationRepresentation) {
        color = getColorForSegmentIndex(
          toolGroupId,
          segmentationRepresentation.segmentationRepresentationUID,
          segmentIndex
        ).slice(0, 3);
      } else {
        color = [Math.random() * 255, Math.random() * 255, Math.random() * 255];
      }

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

    return {
      geometryIds,
    };
  }

  private async createAndCacheLabelmapFromRaw(
    segmentationId: string,
    rawLabelmapData:
      | LabelmapSegmentationDataVolume
      | LabelmapSegmentationDataStack
  ) {
    const labelmapData = {
      volumeId: rawLabelmapData,
    };

    addRepresentationData({
      segmentationId,
      type: SegmentationRepresentations.Labelmap,
      data: {
        ...labelmapData,
      },
    });

    this.addComputedRepresentationInternally(
      segmentationId,
      SegmentationRepresentations.Labelmap
    );

    this.subscribeToSegmentationChanges();

    triggerSegmentationModified(segmentationId);

    return labelmapData;
  }

  private async createRawSurfaceData(
    segmentationId: string,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    } = {}
  ): Promise<RawSurfacesData> {
    const segmentation = getSegmentation(segmentationId);
    const representationData = segmentation.representationData;

    if (
      (representationData.LABELMAP as LabelmapSegmentationDataVolume)?.volumeId
    ) {
      // convert volume labelmap to surface
      let rawSurfacesDataObj;
      try {
        rawSurfacesDataObj = await this.computeSurfaceFromLabelmapSegmentation(
          segmentation.segmentationId,
          options
        );
      } catch (error) {
        console.warn('Error converting volume labelmap to surface');
        console.warn(error);
        return;
      }

      return rawSurfacesDataObj;
    } else if (
      (representationData.CONTOUR as ContourSegmentationData)?.annotationUIDsMap
        ?.size
    ) {
      // convert volume labelmap to surface
      let rawSurfacesDataObj;
      try {
        rawSurfacesDataObj = await this.computeSurfaceFromContourSegmentation(
          segmentation.segmentationId,
          options
        );
      } catch (error) {
        console.warn('Error converting volume labelmap to surface');
        console.warn(error);
        return;
      }

      return rawSurfacesDataObj;
    } else {
      throw new Error(
        'Not enough data to convert to surface, currently only support converting volume labelmap to surface if available'
      );
    }
  }

  private async createRawLabelmapData(
    segmentationId: string,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
      isVolume?: boolean;
      viewport?: Types.IVolumeViewport | Types.IStackViewport;
    } = {}
  ): Promise<LabelmapSegmentationDataVolume | LabelmapSegmentationDataStack> {
    const segmentation = getSegmentation(segmentationId);
    const { representationData } = segmentation;

    if (representationData.CONTOUR as ContourSegmentationData) {
      // convert volume labelmap to surface
      let rawLabelmapData;
      try {
        rawLabelmapData = await this.computeLabelmapFromContourSegmentation(
          segmentationId,
          options
        );
      } catch (error) {
        console.warn('Error converting  contour to labelmap');
        console.warn(error);
        return;
      }

      return rawLabelmapData;
    } else if (representationData.SURFACE as SurfaceSegmentationData) {
      // convert volume labelmap to surface
      let rawLabelmapData;
      try {
        rawLabelmapData = await this.computeLabelmapFromSurfaceSegmentation(
          segmentationId,
          options
        );
      } catch (error) {
        console.warn('Error converting  contour to labelmap');
        console.warn(error);
        return;
      }

      return rawLabelmapData;
    } else {
      throw new Error(
        'Not enough data to convert to surface, currently only support converting volume labelmap to surface if available'
      );
    }
  }

  private async createRawContourData(
    segmentationId: string,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
      viewport?: Types.IVolumeViewport | Types.IStackViewport;
    } = {}
  ): Promise<ContourSegmentationData> {
    const segmentation = getSegmentation(segmentationId);
    const { representationData } = segmentation;

    if (representationData.LABELMAP as LabelmapSegmentationDataVolume) {
      // convert volume labelmap to surface
      let contourData;
      try {
        contourData = await this.computeContourFromLabelmapSegmentation(
          segmentationId,
          options
        );
      } catch (error) {
        console.warn('Error converting labelmap to contour');
        console.warn(error);
        return;
      }

      return contourData;
    } else {
      throw new Error(
        'Not enough data to convert to contour, currently only support converting volume labelmap to contour if available'
      );
    }
  }

  private async _convertVolumeLabelmapToSurface(
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

  private async _convertStackLabelmapToSurface(
    segmentation: LabelmapSegmentationData,
    segmentIndice: number
  ): Promise<Types.SurfaceData> {
    throw new Error('Not implemented yet');
  }

  private async _convertContourToSurface(
    contourRepresentationData: ContourSegmentationData,
    segmentIndex: number
  ): Promise<Types.SurfaceData> {
    const { annotationUIDsMap } = contourRepresentationData;

    // loop over all annotations in the segment and flatten their polylines
    const polylines = [];
    const numPointsArray = [];
    const annotationUIDs = annotationUIDsMap.get(segmentIndex);

    for (const annotationUID of annotationUIDs) {
      const annotation = getAnnotation(annotationUID);
      const polyline = annotation.data.contour.polyline;
      numPointsArray.push(polyline.length);
      polyline.forEach((polyline) => polylines.push(...polyline));
    }

    const results = this.polySeg.instance.convertContourRoiToSurface(
      polylines,
      numPointsArray
    ) as Types.SurfaceData;

    return results;
  }

  /**
   * Convert contour representation to labelmap representation.
   * @param viewport - The viewport where the point resides. We need the viewport
   * to assume some default values for the labelmap.
   * @param segmentation - The segmentation data being converted.
   * @returns A Promise that resolves to a LabelmapSegmentationDataVolume containing the volumeId of the new labelmap.
   */
  private async _convertContourToVolumeLabelmap(
    contourRepresentationData: ContourSegmentationData,
    segmentationVolume: Types.IImageVolume,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    } = {}
  ) {
    const annotationMap = contourRepresentationData.annotationUIDsMap;

    const segmentIndices = options.segmentIndices?.length
      ? options.segmentIndices
      : Array.from(annotationMap.keys());

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
   * Convert surface representation to labelmap representation.
   * @param viewport - The viewport where the point resides. We need the viewport
   * to assume some default values for the labelmap.
   * @param segmentation - The segmentation data being converted.
   * @returns A Promise that resolves to a LabelmapSegmentationDataVolume containing the volumeId of the new labelmap.
   */
  private async _convertSurfaceToVolumeLabelmap(
    surfaceRepresentationData: SurfaceSegmentationData,
    segmentationVolume: Types.IImageVolume,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    } = {}
  ) {
    const { geometryIds } = surfaceRepresentationData;
    if (!geometryIds?.length) {
      throw new Error('No geometry IDs found for surface representation');
    }

    // for (const geometryId of geometryIds) {
    const geometryId = geometryIds[0];
    const geometryData = cache.getGeometry(geometryId)?.data as Types.ISurface;
    const points = geometryData.getPoints();
    const polys = geometryData.getPolys();

    const polyData = vtkPolyData.newInstance();
    polyData.getPoints().setData(points, 3);
    polyData.getPolys().setData(polys);

    const results = this.polySeg.instance.convertSurfaceToLabelmap(
      points,
      polys,
      segmentationVolume.dimensions,
      segmentationVolume.spacing,
      segmentationVolume.direction,
      segmentationVolume.origin
    );

    const { data, dimensions, direction, origin, spacing } = results;
    const volumeId = 'segment1';
    await volumeLoader.createLocalVolume(
      {
        dimensions,
        direction,
        origin,
        metadata: {},
        scalarData: data,
        spacing,
      },
      volumeId
    );

    // }

    return {
      volumeId: volumeId,
    };
  }

  /**
   * Convert contour representation to stack labelmap representation.
   * @param viewport - The viewport where the point resides. We need the viewport
   * to assume some default values for the labelmap.
   * @param segmentation - The segmentation data being converted.
   * @returns A Promise that resolves to a LabelmapSegmentationDataStack containing the imageIdReferenceMap of the new labelmap.
   */
  private async _convertContourToStackLabelmap(
    contourRepresentationData: ContourSegmentationData,
    cachedImages: Map<string, Types.IImage>,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    } = {}
  ) {
    throw new Error('Not implemented yet');
  }

  private async _convertSurfaceToStackLabelmap(
    contourRepresentationData: ContourSegmentationData,
    cachedImages: Map<string, Types.IImage>,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    } = {}
  ) {
    throw new Error('Not implemented yet');
  }

  private async _convertVolumeLabelmapToContour(
    labelmapRepresentationData: LabelmapSegmentationDataVolume,
    options: {
      segmentIndices: number[];
      segmentationRepresentationUID?: string;
      viewport;
    }
  ): Promise<ContourSegmentationData> {
    const volumeId = labelmapRepresentationData.volumeId;

    const volume = cache.getVolume(volumeId);

    const scalarData = volume.getScalarData();
    const { dimensions, spacing, origin, direction } = volume;
    const slicesContours = [];

    /**
     * Soulution 1
     * Soulution 1
     * Soulution 1
     * Soulution 1
     * Soulution 1
     * Soulution 1
     * Soulution 1
     * Soulution 1
     * Soulution 1
     * Soulution 1
     */
    for (const segmentIndex of [1, 2]) {
      const results = (await this.polySeg.instance.convertLabelmapToSurface(
        scalarData,
        dimensions,
        spacing,
        direction,
        origin,
        [segmentIndex]
      )) as Types.SurfaceData;

      const { points, polys } = results;

      const polyData = vtkPolyData.newInstance();
      polyData.getPoints().setData(points, 3);
      polyData.getPolys().setData(polys);

      for (let i = 0; i < dimensions[2]; i++) {
        const cutter = vtkCutter.newInstance();
        cutter.setCutFunction(vtkPlane.newInstance());

        cutter.setInputData(polyData);

        const planeNormal = direction.slice(6, 9);
        cutter.getCutFunction().setNormal(planeNormal);

        const planeOrigin = [
          origin[0] + spacing[0] * i * planeNormal[0],
          origin[1] + spacing[1] * i * planeNormal[1],
          origin[2] + spacing[2] * i * planeNormal[2],
        ];

        cutter.getCutFunction().setOrigin(planeOrigin);

        cutter.update();

        // Retrieve the resulting contour data
        const contourData = cutter.getOutputData();

        // const { points, lines } = getDeduplicatedVTKPolyDataPoints(contourData);

        // const contours = findContoursFromReducedSet(lines);

        const points = contourData.getPoints().getData();

        // remove every 3rd element and group them into [ [x, y] , [x, y] , ...]
        const points2D = [];
        for (let i = 0; i < points.length; i += 3) {
          points2D.push([points[i], points[i + 1]]);
        }

        if (points2D.length < 2) {
          continue;
        }

        const convexHull = hull(points2D, 100);

        // put back the z coordinate
        const contour = convexHull.map((pt) => {
          return [pt[0], pt[1], points[2]];
        });

        // let i = 0;
        // while (i < lines?.length) {
        //   const n = lines[i];
        //   const linePtIdxs = lines.slice(i + 1, i + 1 + n);
        //   const linePts = linePtIdxs.map((idx) =>
        //     points.slice(idx * 3, (idx + 1) * 3)
        //   );
        //   i += n + 1;
        // }

        slicesContours.push(contour);
      }
    }

    return slicesContours;

    /**
     * Soulution 2
     * Soulution 2
     * Soulution 2
     * Soulution 2
     * Soulution 2
     * Soulution 2
     * Soulution 2
     */
    // const results = generateContourSetsFromLabelmap({
    //   segmentations: {
    //     representationData: {
    //       LABELMAP: labelmapRepresentationData,
    //     },
    //   },
    // });

    // return results[0].sliceContours.map((res) => {
    //   return res.polyData.points;
    // });
    /**
     * Soulution 3
     * Soulution 3
     * Soulution 3
     * Soulution 3
     * Soulution 3
     * Soulution 3
     * Soulution 3
     */
    // for (const segmentIndex of [1]) {
    //   const results = (await this.polySeg.instance.convertLabelmapToSurface(
    //     scalarData,
    //     dimensions,
    //     spacing,
    //     direction,
    //     origin,
    //     [segmentIndex]
    //   )) as Types.SurfaceData;

    //   const { points, polys } = results;

    //   const polyData = vtkPolyData.newInstance();
    //   polyData.getPoints().setData(points, 3);
    //   polyData.getPolys().setData(polys);

    //   const clippingFilter = vtkClipClosedSurface.newInstance({
    //     clippingPlanes: [],
    //     activePlaneId: 2,
    //     passPointData: false,
    //   });
    //   clippingFilter.setInputData(polyData);
    //   clippingFilter.setGenerateOutline(true);
    //   clippingFilter.setGenerateFaces(false);
    //   // clippingFilter.update();

    //   const { viewPlaneNormal, slabThickness } = options.viewport.getCamera();

    //   const vtkPlanes = [vtkPlane.newInstance({}), vtkPlane.newInstance({})];
    //   const scaledDistance = [
    //     viewPlaneNormal[0],
    //     viewPlaneNormal[1],
    //     viewPlaneNormal[2],
    //   ];
    //   vtkMath.multiplyScalar(scaledDistance, slabThickness);
    //   vtkPlanes[0].setNormal(viewPlaneNormal);
    //   vtkPlanes[1].setNormal(
    //     -viewPlaneNormal[0],
    //     -viewPlaneNormal[1],
    //     -viewPlaneNormal[2]
    //   );

    //   for (let i = 0; i < dimensions[2]; i++) {
    //     const newOrigin1 = [
    //       origin[0] + spacing[0] * i * viewPlaneNormal[0],
    //       origin[1] + spacing[1] * i * viewPlaneNormal[1],
    //       origin[2] + spacing[2] * i * viewPlaneNormal[2],
    //     ];

    //     const newOrigin2 = [
    //       origin[0] + spacing[0] * (i + 1) * viewPlaneNormal[0],
    //       origin[1] + spacing[1] * (i + 1) * viewPlaneNormal[1],
    //       origin[2] + spacing[2] * (i + 1) * viewPlaneNormal[2],
    //     ];

    //     vtkPlanes[0].setOrigin(newOrigin1);
    //     vtkPlanes[1].setOrigin(newOrigin2);

    //     clippingFilter.setClippingPlanes(vtkPlanes);

    //     clippingFilter.update();

    //     const points = clippingFilter.getOutputData().getPoints().getData();
    //     console.debug('🚀 ~ points:', points);

    //     slicesContours.push(points);
    //   }
    // }

    return slicesContours;
  }

  private async updateSurfaceRepresentation(segmentationId) {
    const surfacesObj = await this.createRawSurfaceData(segmentationId);
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

    const promises = surfacesObj.map(({ data, segmentIndex }) => {
      const geometryId = `segmentation_${segmentationId}_surface_${segmentIndex}`;

      const geometry = cache.getGeometry(geometryId);

      if (!geometry) {
        // means it is a new segment getting added while we were
        // listening to the segmentation data modified event
        const toolGroupIds = getToolGroupIdsWithSegmentation(segmentationId);

        return toolGroupIds.map((toolGroupId) => {
          const segmentationRepresentations = getSegmentationRepresentations(
            toolGroupId
          ) as ToolGroupSpecificRepresentations;

          return segmentationRepresentations.map(
            (segmentationRepresentation) => {
              if (
                segmentationRepresentation.type !==
                SegmentationRepresentations.Surface
              ) {
                return;
              }
              segmentation.representationData.SURFACE.geometryIds.push(
                geometryId
              );

              return this.createAndCacheSurfacesFromRaw(
                segmentationId,
                [{ segmentIndex, data }],
                {
                  segmentationRepresentationUID:
                    segmentationRepresentation.segmentationRepresentationUID,
                }
              );
            }
          );
        });
      } else {
        if (indices.includes(segmentIndex)) {
          // if the geometry already exists and the segmentIndex is
          // still present, update the geometry data
          const surface = geometry.data as Types.ISurface;
          surface.setPoints(data.points);
          surface.setPolys(data.polys);
          return;
        } else {
          const surface = geometry.data as Types.ISurface;
          surface.setPoints([]);
          surface.setPolys([]);
          return;
        }
      }
    });

    await Promise.all(promises);

    triggerSegmentationModified(segmentationId);
  }

  private async updateLabelmapRepresentation(segmentationId) {}

  /**
   * Checks whether a conversion path exists between two given representation types.
   *
   * @param fromRepresentationType - The starting representation type.
   * @param toRepresentationType - The target representation type.
   * @returns true if the conversion is available, otherwise false.
   */
  private canConvertFromTo(fromRepresentationType, toRepresentationType) {
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
}

const polySegManager = new PolySegManager();

export { polySegManager };
