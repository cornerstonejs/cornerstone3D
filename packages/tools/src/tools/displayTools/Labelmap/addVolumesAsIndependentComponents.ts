import {
  cache,
  Enums,
  convertMapperToNotSharedMapper,
  volumeLoader,
  eventTarget,
  createVolumeActor,
  type Types,
} from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../../enums';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import type { LabelmapSegmentationDataVolume } from '../../../types/LabelmapTypes';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

/**
 * Internal cache entry for independent component state
 */
type CacheEntry = {
  added: boolean;
  segmentationRepresentationUID: string;
  originalBlendMode: Enums.BlendModes;
  cleanup?: () => void;
};

/**
 * Configuration options for independent component addition
 */
interface IndependentComponentOptions {
  blendMode?: Enums.BlendModes;
  debounceTime?: number;
  validateDimensions?: boolean;
  enableOptimizations?: boolean;
}

/**
 * Result interface for independent component addition
 */
interface IndependentComponentResult {
  uid: string;
  actor: Types.ViewportActor;
  success: boolean;
  error?: string;
  processedVoxels?: number;
}

/**
 * Validates input parameters for addVolumesAsIndependentComponents
 */
function validateInputs(
  viewport: Types.IVolumeViewport,
  volumeInputs: Types.IVolumeInput[],
  segmentationId: string
): void {
  if (!viewport) {
    throw new Error('Valid viewport is required');
  }

  if (!Array.isArray(volumeInputs) || volumeInputs.length === 0) {
    throw new Error(
      'Valid volumeInputs array with at least one element is required'
    );
  }

  if (!segmentationId || typeof segmentationId !== 'string') {
    throw new Error('Valid segmentation ID is required');
  }

  // Validate volume inputs
  volumeInputs.forEach((input, index) => {
    if (!input.volumeId || typeof input.volumeId !== 'string') {
      throw new Error(`Invalid volumeId at index ${index}`);
    }
  });
}

/**
 * Validates that volumes have compatible dimensions
 */
function validateVolumeDimensions(
  baseVolume: Types.IImageVolume,
  segVolume: Types.IImageVolume
): void {
  const baseDims = baseVolume.imageData.getDimensions();
  const segDims = segVolume.imageData.getDimensions();

  if (
    baseDims[0] !== segDims[0] ||
    baseDims[1] !== segDims[1] ||
    baseDims[2] !== segDims[2]
  ) {
    throw new Error(
      `Volume dimensions mismatch. Base: [${baseDims.join(', ')}], ` +
        `Segmentation: [${segDims.join(', ')}]`
    );
  }
}

/**
 * Safely retrieves volume from cache with validation
 */
function getValidatedVolume(volumeId: string): Types.IImageVolume {
  const volume = cache.getVolume(volumeId);
  if (!volume) {
    throw new Error(`Volume not found in cache: ${volumeId}`);
  }

  if (!volume.voxelManager) {
    throw new Error(`Volume ${volumeId} has no voxel manager`);
  }

  if (!volume.imageData) {
    throw new Error(`Volume ${volumeId} has no image data`);
  }

  return volume;
}

/**
 * Optimized function to combine volume data with segmentation data
 */
function combineVolumeData(
  baseData: ArrayLike<number>,
  segData: ArrayLike<number>,
  dimensions: number[],
  enableOptimizations: boolean = true
): Float32Array {
  const newComp = 2;
  const totalVoxels = dimensions[0] * dimensions[1] * dimensions[2];
  const cubeData = new Float32Array(newComp * totalVoxels);

  if (enableOptimizations && totalVoxels > 1000000) {
    // Use optimized approach for large volumes
    console.debug(`Using optimized data combination for ${totalVoxels} voxels`);

    for (let i = 0; i < totalVoxels; i++) {
      cubeData[i * newComp + 0] = baseData[i];
      cubeData[i * newComp + 1] = segData[i];
    }
  } else {
    // Use traditional approach for smaller volumes
    for (let z = 0; z < dimensions[2]; ++z) {
      for (let y = 0; y < dimensions[1]; ++y) {
        for (let x = 0; x < dimensions[0]; ++x) {
          const iTuple = x + dimensions[0] * (y + dimensions[1] * z);
          cubeData[iTuple * newComp + 0] = baseData[iTuple];
          cubeData[iTuple * newComp + 1] = segData[iTuple];
        }
      }
    }
  }

  return cubeData;
}

const internalCache = new Map<string, CacheEntry>();

const load = ({ cfun, ofun, actor }) => {
  actor.getProperty().setRGBTransferFunction(1, cfun);
  actor.getProperty().setScalarOpacity(1, ofun);
};

/**
 * Creates a debounced event handler for segmentation data modifications
 */
function createSegmentationDataModifiedHandler(
  segImageVolumeId: string,
  segImageData: Types.IImageData,
  mapper: vtkVolumeMapper,
  viewport: Types.IVolumeViewport
): (evt: CustomEvent) => void {
  return (evt: CustomEvent): void => {
    try {
      const { segmentationId: eventSegmentationId } = evt.detail || {};
      if (!eventSegmentationId) {
        console.warn('Segmentation data modified event missing segmentationId');
        return;
      }

      const segmentation = getSegmentation(eventSegmentationId);
      if (!segmentation?.representationData?.Labelmap) {
        console.warn(
          `No labelmap representation found for segmentation: ${eventSegmentationId}`
        );
        return;
      }

      const volumeIds =
        (
          segmentation.representationData
            .Labelmap as LabelmapSegmentationDataVolume
        ).volumeIds || [];

      // Support multiple volumeIds, but update only if segImageVolume is among them
      if (!volumeIds.includes(segImageVolumeId)) {
        return;
      }

      const segmentationVolume = cache.getVolume(segImageVolumeId);
      if (!segmentationVolume?.voxelManager) {
        console.error(
          `Invalid segmentation volume or voxel manager: ${segImageVolumeId}`
        );
        return;
      }

      const imageData = mapper.getInputData();
      const array = imageData.getPointData().getArray(0);
      const baseData = array.getData();
      const newComp = 2;
      const dims = segImageData.dimensions;

      // Update segmentation component data
      const totalVoxels = dims[0] * dims[1] * dims[2];
      for (let i = 0; i < totalVoxels; i++) {
        baseData[i * newComp + 1] = segmentationVolume.voxelManager.getAtIndex(
          i
        ) as number;
      }

      array.setData(baseData);
      imageData.modified();
      viewport.render();
    } catch (error) {
      console.error('Error handling segmentation data modification:', error);
    }
  };
}

/**
 * Creates a cleanup handler for segmentation representation removal
 */
function createRepresentationRemovedHandler(
  uid: string,
  volumeId: string,
  onSegmentationDataModified: (evt: CustomEvent) => void,
  viewport: Types.IVolumeViewport
): (evt: CustomEvent) => Promise<void> {
  return async (evt: CustomEvent): Promise<void> => {
    try {
      // Remove the data modification event listener
      eventTarget.removeEventListener(
        Events.SEGMENTATION_DATA_MODIFIED,
        onSegmentationDataModified
      );

      const actorEntry = viewport.getActor(uid);
      if (!actorEntry) {
        console.warn(`No actor found for uid: ${uid}`);
        return;
      }

      const { element, id } = viewport;
      viewport.removeActors([uid]);

      // Recreate the original volume actor
      const actor = await createVolumeActor(
        {
          volumeId: uid,
          blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
          callback: ({ volumeActor }) => {
            if (actorEntry.callback) {
              // @ts-expect-error - Legacy callback handling
              actorEntry.callback({
                volumeActor,
                volumeId,
              });
            }
          },
        },
        element,
        id
      );

      viewport.addActor({ actor, uid });
      viewport.render();

      // Clean up cache entry
      internalCache.delete(uid);
    } catch (error) {
      console.error(
        'Error handling segmentation representation removal:',
        error
      );
    }
  };
}

/**
 * Adds segmentation data as an independent component to the volume data.
 * This function combines base volume data with segmentation data as separate components
 * in a multi-component volume, allowing for advanced visualization and blending.
 *
 * @param params - The parameters for adding independent components
 * @param params.viewport - The volume viewport to modify
 * @param params.volumeInputs - Array of volume input objects (segmentation volumes)
 * @param params.segmentationId - The segmentation identifier
 * @param params.options - Optional configuration for the operation
 * @returns Promise resolving to an object containing the UID and actor
 * @throws {Error} When input validation fails or volume operations encounter errors
 */
export async function addVolumesAsIndependentComponents({
  viewport,
  volumeInputs,
  segmentationId,
  options = {},
}: {
  viewport: Types.IVolumeViewport;
  volumeInputs: Types.IVolumeInput[];
  segmentationId: string;
  options?: IndependentComponentOptions;
}): Promise<IndependentComponentResult> {
  const startTime = performance.now();

  try {
    // Validate inputs early
    validateInputs(viewport, volumeInputs, segmentationId);

    const defaultActor = viewport.getDefaultActor();
    if (!defaultActor) {
      throw new Error('No default actor found in viewport');
    }

    const { actor: volumeActor, uid, callback } = defaultActor;
    // Type cast for compatibility with VTK API; safe as long as actor is a VTK volume
    const actor = volumeActor as vtkVolume;

    // Check if already processed
    const cacheEntry = internalCache.get(uid);
    if (cacheEntry?.added) {
      console.debug(`Independent components already added for uid: ${uid}`);
      return {
        uid,
        actor: actor as unknown as Types.ViewportActor,
        success: true,
      };
    }

    const referenceVolumeId = viewport.getVolumeId();
    if (!referenceVolumeId) {
      throw new Error('No reference volume ID found in viewport');
    }

    // Get and validate volumes
    const baseVolume = getValidatedVolume(referenceVolumeId);

    const { volumeId } = volumeInputs[0];
    const segImageVolume = await volumeLoader.loadVolume(volumeId);

    if (!segImageVolume) {
      throw new Error(`Failed to load segmentation volume: ${volumeId}`);
    }

    // Validate volume compatibility
    if (options.validateDimensions !== false) {
      validateVolumeDimensions(baseVolume, segImageVolume);
    }

    // Get volume data
    const segVoxelManager = segImageVolume.voxelManager;
    const segData = segVoxelManager.getCompleteScalarDataArray();
    const baseVoxelManager = baseVolume.voxelManager;
    const baseData = baseVoxelManager.getCompleteScalarDataArray();

    const { imageData: segImageData } = segImageVolume;
    const dims = segImageData.getDimensions();

    // Combine volume data
    const cubeData = combineVolumeData(
      baseData,
      segData,
      dims,
      options.enableOptimizations !== false
    );

    // Update viewport and mapper
    viewport.removeActors([uid]);
    const oldMapper = actor.getMapper();
    const mapper = convertMapperToNotSharedMapper(oldMapper as vtkVolumeMapper);
    actor.setMapper(mapper);

    // Configure mapper for labelmap rendering
    // Blend mode: VTK expects a number, so ensure we pass a number
    const blendMode =
      options.blendMode ?? Enums.BlendModes.LABELMAP_EDGE_PROJECTION_BLEND;
    // If Enums.BlendModes is not a number enum, cast or convert as needed
    mapper.setBlendMode(Number(blendMode));

    // Update volume data
    const arrayAgain = mapper.getInputData().getPointData().getArray(0);
    arrayAgain.setData(cubeData);
    arrayAgain.setNumberOfComponents(2);

    // Configure actor properties
    actor.getProperty().setColorMixPreset(1);
    actor.getProperty().setForceNearestInterpolation(1, true);
    actor.getProperty().setIndependentComponents(true);

    // Add actor back to viewport
    viewport.addActor({
      actor: actor as unknown as Types.ViewportActor,
      uid,
      callback,
      referencedId: referenceVolumeId,
      representationUID: `${segmentationId}-${SegmentationRepresentations.Labelmap}`,
    });

    // Cache the operation
    const originalBlendMode = viewport.getBlendMode();
    internalCache.set(uid, {
      added: true,
      segmentationRepresentationUID: segmentationId,
      originalBlendMode,
    });

    // Set up preLoad function
    actor.set({
      preLoad: load,
    });

    // Set up event handlers
    const onSegmentationDataModified = createSegmentationDataModifiedHandler(
      segImageVolume.volumeId,
      segImageVolume.imageData as unknown as Types.IImageData, // Accepts both vtkImageData and IImageData
      mapper,
      viewport
    );

    const onRepresentationRemoved = createRepresentationRemovedHandler(
      uid,
      volumeId,
      onSegmentationDataModified,
      viewport
    );

    // Register event listeners
    eventTarget.addEventListenerDebounced(
      Events.SEGMENTATION_DATA_MODIFIED,
      onSegmentationDataModified,
      options.debounceTime || 200
    );

    eventTarget.addEventListener(
      Events.SEGMENTATION_REPRESENTATION_REMOVED,
      onRepresentationRemoved
    );

    const endTime = performance.now();
    console.debug(
      `Independent components added successfully in ${endTime - startTime}ms`
    );

    return {
      uid,
      actor: actor as unknown as Types.ViewportActor,
      success: true,
      processedVoxels: dims[0] * dims[1] * dims[2],
    };
  } catch (error) {
    const endTime = performance.now();

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    console.error(
      `Failed to add independent components in ${endTime - startTime}ms:`,
      error
    );

    return {
      uid: '',
      actor: null as unknown as Types.ViewportActor,
      success: false,
      error: errorMessage,
    };
  }
}
