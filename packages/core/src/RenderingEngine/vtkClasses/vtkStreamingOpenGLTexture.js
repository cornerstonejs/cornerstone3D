import macro from '@kitware/vtk.js/macros';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import cache from '../../cache/cache';
import { getConstructorFromType } from '../../utilities/getBufferConfiguration';
import VoxelManager from '../../utilities/VoxelManager';
import { voxelGridsEqual } from '../../utilities/voxelGrid';
import { requireVoxelStatistic } from '../../utilities/voxelGrid/voxelStatistics';
import VoxelStatistics from '../../enums/VoxelStatistics';
import ImageQualityStatus from '../../enums/ImageQualityStatus';
import autoLoad from '../../utilities/autoLoad';
import { getConfiguration } from '../../init';

const DEFAULT_MAX_SLICES_PER_RENDER = 16;
const DEFAULT_MAX_MILLISECONDS_PER_RENDER = 8;

/**
 * The work that one render does to fill a reduced texture. See
 * `rendering.reducedTextureFill` in `Cornerstone3DConfig`.
 */
function reducedTextureFillBudget() {
  const budget = getConfiguration()?.rendering?.reducedTextureFill;

  return {
    maxSlicesPerRender:
      budget?.maxSlicesPerRender ?? DEFAULT_MAX_SLICES_PER_RENDER,
    maxMillisecondsPerRender:
      budget?.maxMillisecondsPerRender ?? DEFAULT_MAX_MILLISECONDS_PER_RENDER,
  };
}

/**
 * Converts the input data array to the specified data type
 * @param {TypedArray} data - The source data array
 * @param {string} targetDataType - The target data type to convert to
 * @returns {TypedArray} The converted data array
 */
function convertDataType(data, targetDataType) {
  const Constructor = getConstructorFromType(targetDataType);
  const convertedData = new Constructor(data.length);
  convertedData.set(data);
  return convertedData;
}

/**
 * vtkStreamingOpenGLTexture - A derived class of the core vtkOpenGLTexture.
 * This class has methods to update the texture memory on the GPU slice by slice
 * in an efficient yet GPU-architecture friendly manner.
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkStreamingOpenGLTexture(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLTexture');

  model.updatedFrames = [];
  model.volumeId = null;
  // The slice where the next fill of a reduced texture starts.
  model.fillCursor = 0;
  model.remainingFillScheduled = false;
  // The grid that this texture holds. The texture store of `ImageVolume` states
  // it when it builds the texture. A texture whose grid is the grid of the
  // volume reads the cached images frame by frame, which is the path of the
  // full-resolution data. A texture of any other grid reads the composite,
  // because no cached image holds a reduced voxel.
  model.grid = null;

  const superCreate3DFilterableFromRaw = publicAPI.create3DFilterableFromRaw;

  publicAPI.create3DFilterableFromRaw = ({
    width,
    height,
    depth,
    numberOfComponents,
    dataType,
    data,
    preferSizeOverAccuracy,
  }) => {
    model.inputDataType = dataType;
    model.inputNumComps = numberOfComponents;

    superCreate3DFilterableFromRaw({
      width,
      height,
      depth,
      numberOfComponents,
      dataType,
      data,
      preferSizeOverAccuracy,
    });
  };

  const superCreate3DFromRaw = publicAPI.create3DFromRaw;

  /**
   * The mappers allocate with `data: null`, which leaves the GPU storage empty,
   * so every slice needs a fill. `modified()` no longer implies that, and a
   * re-allocation after the first fill would otherwise stay black.
   */
  publicAPI.create3DFromRaw = (options) => {
    const created = superCreate3DFromRaw(options);

    if (created && !options.data) {
      publicAPI.markAllFramesUpdated();
    }

    return created;
  };

  const superUpdate = publicAPI.updateVolumeInfoForGL;

  publicAPI.updateVolumeInfoForGL = (dataType, numComps) => {
    const isScalingApplied = superUpdate(dataType, numComps);
    model.volumeInfo.dataComputedScale = [1];
    model.volumeInfo.dataComputedOffset = [0];
    return isScalingApplied;
  };

  /**
   * This function updates the GPU texture memory to match the current
   * representation of data held in RAM.
   *
   */
  publicAPI.update3DFromRaw = () => {
    const { volumeId } = model;

    if (!volumeId) {
      return;
    }

    const volume = cache.getVolume(volumeId);

    if (!volume) {
      return;
    }

    model._openGLRenderWindow.activateTexture(publicAPI);
    publicAPI.createTexture();
    publicAPI.bind();

    if (volume.isDynamicVolume()) {
      updateDynamicVolumeTexture();
      return;
    }

    if (model.grid && !isGridOfVolume(volume, model.grid)) {
      return publicAPI.hasUpdatedFrames() && updateTextureFromComposite(volume);
    }

    return (
      publicAPI.hasUpdatedFrames() && updateTextureImagesUsingVoxelManager()
    );
  };

  /** States whether the grid of this texture is the grid of the volume. */
  function isGridOfVolume(volume, grid) {
    return volume.voxelGrid ? voxelGridsEqual(volume.voxelGrid, grid) : true;
  }

  /**
   * Fills a texture whose grid is not the grid of the volume.
   *
   * The composite computes which sub voxel managers fill this texture, and
   * `fillGrid` reads the best sources that it holds. A fill is many to one:
   * several representations can cover one region between them, which is the
   * brick case, so this function states no single source.
   *
   * The fill computes every voxel of the grid, because `fillGrid` takes no
   * region. The upload stays partial: the function uploads the slices that a
   * delivery marked, and it leaves the others.
   */
  /**
   * The size of the box on each axis that takes the grid of the volume to the
   * grid of this texture, when the two share their axes and the ratio of the
   * spacing is a whole number on every axis.
   *
   * A grid that this does not describe, such as an oblique slab, returns
   * nothing, and the fill then reads the composite voxel by voxel.
   */
  function boxFactorsOf(volume, grid) {
    const volumeGrid = volume.voxelGrid;

    if (!volumeGrid) {
      return null;
    }

    const factors = [];

    for (let axis = 0; axis < 3; axis++) {
      for (let index = 0; index < 3; index++) {
        if (
          Math.abs(
            grid.direction[axis * 3 + index] -
              volumeGrid.direction[axis * 3 + index]
          ) > 1e-6
        ) {
          return null;
        }
      }

      const ratio = grid.spacing[axis] / volumeGrid.spacing[axis];
      const factor = Math.round(ratio);

      if (factor < 1 || Math.abs(ratio - factor) > 1e-6) {
        return null;
      }

      factors.push(factor);
    }

    return factors;
  }

  /**
   * Reads the frames of the volume that one reduced slice covers, in k order.
   *
   * The scalar data of the cached image is the frame itself, and reading it
   * costs nothing. `getSliceData` of a volume voxel manager composes the slice
   * one voxel at a time, which a profile showed as the cost of a fill, so it
   * serves only as the fallback.
   *
   * A frame that has not arrived is left out, because it holds no data and
   * would pull the value towards 0. A replicate is a copy of another frame,
   * so the slice reads replicates only when no frame of the box has arrived,
   * and then only the one nearest to the centre.
   *
   * @returns the frames, or null when the volume has no slice reader or the
   * slice lies past the end of the volume
   */
  function framesOfSlice(volume, factorK, slice) {
    const [sourceWidth, sourceHeight, sourceDepth] = volume.dimensions;
    const voxelManager = volume.voxelManager;
    const firstK = slice * factorK;

    if (!voxelManager?.getSliceData || firstK >= sourceDepth) {
      return null;
    }

    const lastK = Math.min(firstK + factorK, sourceDepth);
    const centre = (firstK + lastK - 1) / 2;
    const loaded = [];
    const replicates = [];

    for (let k = firstK; k < lastK; k++) {
      const quality = volume.getImageQuality
        ? volume.getImageQuality(k)
        : ImageQualityStatus.FULL_RESOLUTION;

      if (quality >= ImageQualityStatus.SUBRESOLUTION) {
        loaded.push(k);
      } else if (quality) {
        replicates.push(k);
      }
    }

    const indices = loaded.length ? loaded : nearestTo(centre, replicates);
    const frameLength = sourceWidth * sourceHeight;
    const frames = [];

    for (const k of indices) {
      const frame = readFrame(volume, k, frameLength);

      if (frame) {
        frames.push(frame);
      }
    }

    return frames;
  }

  /** The indices at the smallest distance from `centre`: one, or two on a tie. */
  function nearestTo(centre, indices) {
    let best = Infinity;

    for (const index of indices) {
      best = Math.min(best, Math.abs(index - centre));
    }

    return indices.filter((index) => Math.abs(index - centre) === best);
  }

  /** One frame of the volume, or null when its image is not in the cache. */
  function readFrame(volume, k, frameLength) {
    const imageId = volume.imageIds?.[k];
    const image = imageId ? cache.getImage(imageId) : undefined;

    if (imageId && !image) {
      return null;
    }

    let frame = image?.voxelManager?.getScalarData();

    // A reduced image of a progressive load holds fewer voxels than the
    // frame. `getSliceData` scales it to the frame, so it can still count.
    if (!frame || frame.length < frameLength) {
      try {
        frame = volume.voxelManager.getSliceData({
          sliceIndex: k,
          slicePlane: 2,
        });
      } catch {
        frame = null;
      }
    }

    return frame && frame.length >= frameLength ? frame : null;
  }

  /**
   * Fills one reduced slice with the `fillPlane` of the statistic of the
   * volume, read straight from the frames that the slice covers.
   *
   * @returns false when the statistic has no `fillPlane` or this slice holds no
   * data yet, so a caller can fall back
   * @throws when nothing registered the statistic of the volume
   */
  function fillSliceByBoxStatistic(volume, grid, factors, slice, target) {
    const statistic = volume.reductionStatistic ?? VoxelStatistics.Average;
    const { fillPlane } = requireVoxelStatistic(statistic);

    if (!fillPlane) {
      return false;
    }

    const [factorI, factorJ, factorK] = factors;
    const frames = framesOfSlice(volume, factorK, slice);

    if (!frames?.length) {
      return false;
    }

    fillPlane(
      frames,
      [volume.dimensions[0], volume.dimensions[1]],
      [grid.dimensions[0], grid.dimensions[1]],
      [factorI, factorJ],
      target.getScalarData()
    );

    return true;
  }

  /**
   * Reads one slice of the representation that the composite holds at this
   * exact grid.
   *
   * A CPU reader derives that representation, and
   * `ImageVolume.recordFrameDelivery` redoes its boxes as each frame arrives, so
   * the values follow the load. The values hold the statistic that the render
   * path asks for.
   *
   * THE IMAGE CACHE HOLDS THOSE VOXELS. One image holds one slice of the
   * reduced grid, exactly as one image holds one frame of the volume, so this
   * reads the same way that the full-resolution path reads a frame and it
   * copies nothing. A representation that keeps an array of its own, which a
   * composite without the cache builds, gives a view of that array instead.
   *
   * @returns a function that gives the voxels of one slice, or nothing when the
   * composite holds no such representation, and the caller then computes the
   * values itself
   */
  function derivedSliceReaderOf(composite, grid, statistic) {
    const representation = composite.getRepresentation(
      grid,
      statistic ?? VoxelStatistics.Average
    );
    const [width, height, depth] = grid.dimensions;
    const frameLength = width * height;

    if (!representation) {
      return null;
    }

    const { imageIds } = representation;

    if (imageIds?.length === depth) {
      // A slice that the cache has evicted gives nothing, and the caller then
      // computes that one slice. The other slices still read the cache.
      return (slice) =>
        cache.getImage(imageIds[slice])?.voxelManager?.getScalarData();
    }

    const voxels = representation.voxelManager?.getWritableScalarData?.();

    if (voxels?.length !== frameLength * depth) {
      return null;
    }

    return (slice) =>
      voxels.subarray(slice * frameLength, (slice + 1) * frameLength);
  }

  /**
   * Requests one more render of the viewports of this volume after the
   * current render, so the slices that the budget left dirty get their fill.
   * The request runs outside the render, because the mapper rebuilds only when
   * the texture changed after its last build.
   */
  function scheduleRemainingFill() {
    if (model.remainingFillScheduled) {
      return;
    }

    model.remainingFillScheduled = true;

    setTimeout(() => {
      model.remainingFillScheduled = false;

      if (!model.volumeId || !publicAPI.hasUpdatedFrames()) {
        return;
      }

      publicAPI.modified();
      autoLoad(model.volumeId);
    }, 0);
  }

  function updateTextureFromComposite(volume) {
    const { grid } = model;
    const [width, height, depth] = grid.dimensions;
    // The slab must hold the type that the volume declares, because the upload
    // below states that type to GL. `isVolumeBuffer` would widen an Int16Array
    // to a Float32Array, and the upload would then read the bytes of one type
    // as another.
    const Constructor = getConstructorFromType(volume.dataType, false);
    const frameLength = width * height;
    const composite = volume.compositeVoxelManager;
    const gl = model.context;
    const statistic = volume.reductionStatistic ?? VoxelStatistics.Average;
    const derivedSliceOf = derivedSliceReaderOf(composite, grid, statistic);
    // The factors serve the slices that the composite cannot give, so they are
    // computed even when a derived representation exists: the image cache can
    // evict one reduced slice, and the fill of that one slice falls back.
    const factors = boxFactorsOf(volume, grid);
    // One slice of this grid. A fill of the whole grid would read every voxel
    // of the volume on every refill, and a delivery changes one slice of it.
    const slab = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [width, height, 1],
      scalarData: new Constructor(frameLength),
      numberOfComponents: 1,
    });

    const { maxSlicesPerRender, maxMillisecondsPerRender } =
      reducedTextureFillBudget();
    const startTime = performance.now();
    let slicesHandled = 0;
    let slicesWithData = 0;
    let stoppedEarly = false;

    // The fill starts where the last render stopped, so every dirty slice
    // gets its turn while new frames keep arriving.
    for (let step = 0; step < depth; step++) {
      const slice = (model.fillCursor + step) % depth;

      if (!model.updatedFrames[slice]) {
        continue;
      }

      if (
        slicesWithData >= maxSlicesPerRender ||
        (slicesHandled &&
          performance.now() - startTime >= maxMillisecondsPerRender)
      ) {
        model.fillCursor = slice;
        stoppedEarly = true;
        break;
      }

      let data = derivedSliceOf?.(slice);
      let hasData = !!data;

      if (!data) {
        // `fillGrid` leaves a voxel untouched where the composite holds no
        // value, and this slab serves every slice, so a voxel that one slice
        // does not fill would keep the value that an earlier slice wrote.
        slab.getScalarData().fill(0);

        // A slice whose data has not arrived uploads the cleared slab, which
        // costs nothing to compute. The volume marks that slice again when its
        // frames arrive, and the next render fills it with real voxels.
        // Filling every slice of a new texture from the data would stall the
        // first render: a volume of 512 x 512 x 1232 measured about 17 seconds.
        const filled =
          factors &&
          fillSliceByBoxStatistic(volume, grid, factors, slice, slab);

        hasData = !!filled || !factors;

        if (!filled && !factors) {
          // The grid is not a box of the grid of the volume, such as an oblique
          // slab, and the composite covers a grid of any shape. Its origin
          // moves along the k axis by the spacing of one voxel of the grid, so
          // it reads the voxels that this slice covers and no others.
          composite.fillGrid(
            {
              dimensions: [width, height, 1],
              spacing: grid.spacing,
              direction: grid.direction,
              origin: [
                grid.origin[0] + grid.direction[6] * grid.spacing[2] * slice,
                grid.origin[1] + grid.direction[7] * grid.spacing[2] * slice,
                grid.origin[2] + grid.direction[8] * grid.spacing[2] * slice,
              ],
            },
            slab,
            statistic
          );
        }

        data = slab.getScalarData();
      }

      if (volume.dataType !== data.constructor.name) {
        data = convertDataType(data, volume.dataType);
      }

      const [pixData] = publicAPI.updateArrayDataTypeForGL(volume.dataType, [
        data,
      ]);

      publicAPI.bind();

      gl.texSubImage3D(
        model.target, // target
        0, // level
        0, // xoffset
        0, // yoffset
        slice, // zoffset
        width, // width
        height, // height
        1, // depth (1 slice)
        model.format, // format
        model.openGLDataType, // type
        pixData // data
      );

      publicAPI.deactivate();
      model.updatedFrames[slice] = null;
      slicesHandled++;

      // A slice with no data uploads zeros, which costs almost nothing, so
      // only a slice with data counts against the number of slices.
      if (hasData) {
        slicesWithData++;
      }
    }

    if (stoppedEarly) {
      scheduleRemainingFill();
    }

    if (model.generateMipmap) {
      model.context.generateMipmap(model.target);
    }

    publicAPI.deactivate();

    return true;
  }

  /**
   * Called when a frame is loaded so that on next render we know which data to load in.
   * @param {number} frameIndex The frame to load in.
   */
  publicAPI.setUpdatedFrame = (frameIndex) => {
    model.updatedFrames[frameIndex] = true;
    publicAPI.modified();
  };

  /**
   * Marks every slice of this texture for a refill on the next render.
   *
   * Prefer {@link setUpdatedFrame} when only some slices changed. Do not put
   * this behaviour on `modified()`: VTK property setters (filters, extensions)
   * call `modified()` and would then re-upload the whole volume.
   */
  publicAPI.markAllFramesUpdated = () => {
    const volume = cache.getVolume(model.volumeId);

    if (!volume) {
      return;
    }

    // The number of slices of this texture, and not the number of images of the
    // volume. A texture of a reduced grid holds fewer slices than the volume
    // holds images.
    const slices = model.grid
      ? model.grid.dimensions[2]
      : volume.imageIds.length;

    for (let i = 0; i < slices; i++) {
      model.updatedFrames[i] = true;
    }

    publicAPI.modified();
  };

  function updateTextureImagesUsingVoxelManager() {
    const volume = cache.getVolume(model.volumeId);
    const imageIds = volume.imageIds;
    for (let i = 0; i < model.updatedFrames.length; i++) {
      if (model.updatedFrames[i]) {
        // find the updated frames
        const image = cache.getImage(imageIds[i]);
        if (!image) {
          continue;
        }

        let data = image.voxelManager.getScalarData();
        const gl = model.context;

        // A progressive loader can cache a reduced image, which holds fewer
        // voxels than a slice of the texture. The voxel manager of the volume
        // scales that image to the slice.
        if (
          data.length !==
          model.width * model.height * (model.components || 1)
        ) {
          try {
            data = volume.voxelManager.getSliceData({
              sliceIndex: i,
              slicePlane: 2,
            });
          } catch {
            data = null;
          }

          if (!data) {
            continue;
          }
        }

        if (volume.dataType !== data.constructor.name) {
          data = convertDataType(data, volume.dataType);
        }

        const [pixData] = publicAPI.updateArrayDataTypeForGL(volume.dataType, [
          data,
        ]);

        // Bind the texture
        publicAPI.bind();

        // Calculate the offset within the 3D texture
        const zOffset = i;

        // Update the texture sub-image
        // Todo: need to check other systems if it can handle it
        gl.texSubImage3D(
          model.target, // target
          0, // level
          0, // xoffset
          0, // yoffset
          zOffset, // zoffset
          model.width, // width
          model.height, // height
          1, // depth (1 slice)
          model.format, // format
          model.openGLDataType, // type
          pixData // data
        );

        // Unbind the texture
        publicAPI.deactivate();
        // Reset the updated flag
        model.updatedFrames[i] = null;
      }
    }

    if (model.generateMipmap) {
      model.context.generateMipmap(model.target);
    }

    publicAPI.deactivate();
    return true;
  }

  function updateDynamicVolumeTexture() {
    const volume = cache.getVolume(model.volumeId);

    // loop over imageIds of the current time point and update the texture
    const imageIds = volume.getCurrentDimensionGroupImageIds();

    if (!imageIds.length) {
      return false;
    }

    let constructor;

    for (let i = 0; i < imageIds.length; i++) {
      const imageId = imageIds[i];
      const image = cache.getImage(imageId);

      let data;
      if (!image) {
        // if there is no data we should set zero
        constructor = getConstructorFromType(volume.dataType, true);
        data = new constructor(model.width * model.height);
      } else {
        data = image.voxelManager.getScalarData();
        constructor = data.constructor;
      }

      const gl = model.context;

      if (volume.dataType !== data.constructor.name) {
        data = convertDataType(data, volume.dataType);
      }

      const [pixData] = publicAPI.updateArrayDataTypeForGL(volume.dataType, [
        data,
      ]);

      // Bind the texture
      publicAPI.bind();

      // Calculate the offset within the 3D texture
      let zOffset = i;

      // Update the texture sub-image
      // Todo: need to check other systems if it can handle it
      gl.texSubImage3D(
        model.target, // target
        0, // level
        0, // xoffset
        0, // yoffset
        zOffset, // zoffset
        model.width, // width
        model.height, // height
        1, // depth (1 slice)
        model.format, // format
        model.openGLDataType, // type
        pixData // data
      );

      // Unbind the texture
      publicAPI.deactivate();
      // Reset the updated flag
    }

    if (model.generateMipmap) {
      model.context.generateMipmap(model.target);
    }

    publicAPI.deactivate();
    return true;
  }

  publicAPI.hasUpdatedFrames = () =>
    !model.updatedFrames.length || model.updatedFrames.some((frame) => frame);

  publicAPI.getUpdatedFrames = () => model.updatedFrames;

  publicAPI.setVolumeId = (volumeId) => {
    model.volumeId = volumeId;
  };

  publicAPI.getVolumeId = () => model.volumeId;

  /**
   * States the grid that this texture holds. The texture pool of `ImageVolume`
   * calls this member when it builds the texture.
   */
  publicAPI.setGrid = (grid) => {
    model.grid = grid;
  };

  /**
   * The grid that this texture holds, which a mapper reads to get the
   * dimensions of the allocation. A texture that states no grid holds the grid
   * of its volume.
   */
  publicAPI.getGrid = () => model.grid;

  publicAPI.setTextureParameters = ({
    width,
    height,
    depth,
    numberOfComponents,
    dataType,
  }) => {
    model.width ??= width;
    model.height ??= height;
    model.depth ??= depth;
    model.inputNumComps ??= numberOfComponents;
    model.inputDataType ??= dataType;
  };

  publicAPI.getTextureParameters = () => ({
    width: model.width,
    height: model.height,
    depth: model.depth,
    numberOfComponents: model.inputNumComps,
    dataType: model.inputDataType,
  });
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  updatedFrames: [],
};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkOpenGLTexture.extend(publicAPI, model, initialValues);

  // Object methods
  vtkStreamingOpenGLTexture(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkStreamingOpenGLTexture'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
