import macro from '@kitware/vtk.js/macros';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import cache from '../../cache/cache';
import { getConstructorFromType } from '../../utilities/getBufferConfiguration';
import VoxelManager from '../../utilities/VoxelManager';
import { voxelGridsEqual } from '../../utilities/voxelGrid';

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
   * Fills one slice of this texture with the box average of the voxels of the
   * volume that the slice covers.
   *
   * The arithmetic is direct. A fill through the composite maps every voxel
   * through world coordinates, which measured 9 ms for a slice of 256 x 256 and
   * about 44 seconds for a volume of 512 x 512 x 1232. This reads the voxels of
   * the volume by index instead, and it gives the box average that the render
   * path asks for rather than the value of the nearest voxel.
   *
   * @returns false when this slice holds no data yet, so a caller can fall back
   */
  function fillSliceByBoxAverage(volume, grid, factors, slice, target) {
    const [width, height] = grid.dimensions;
    const [sourceWidth, sourceHeight, sourceDepth] = volume.dimensions;
    const voxelManager = volume.voxelManager;

    if (!voxelManager?.getSliceData) {
      return false;
    }

    const [factorI, factorJ, factorK] = factors;
    const firstK = slice * factorK;
    const lastK = Math.min(firstK + factorK, sourceDepth);

    if (firstK >= sourceDepth) {
      return false;
    }

    const accumulator = new Float64Array(width * height);
    const counts = new Float64Array(width * height);
    let read = 0;

    const imageIds = volume.imageIds;

    for (let k = firstK; k < lastK; k++) {
      // The scalar data of the cached image is the frame itself, and reading it
      // costs nothing. `getSliceData` of a volume voxel manager composes the
      // slice one voxel at a time, which a profile showed as the cost of this
      // fill, so it serves only as the fallback.
      let frame = imageIds?.[k]
        ? cache.getImage(imageIds[k])?.voxelManager?.getScalarData()
        : undefined;

      if (!frame) {
        try {
          frame = voxelManager.getSliceData({ sliceIndex: k, slicePlane: 2 });
        } catch (error) {
          frame = null;
        }
      }

      if (!frame || frame.length < sourceWidth * sourceHeight) {
        // The data of this frame has not arrived, so it contributes nothing.
        continue;
      }

      read++;

      for (let j = 0; j < sourceHeight; j++) {
        const targetRow = Math.min((j / factorJ) | 0, height - 1) * width;
        const sourceRow = j * sourceWidth;

        for (let i = 0; i < sourceWidth; i++) {
          const targetIndex =
            targetRow + Math.min((i / factorI) | 0, width - 1);

          accumulator[targetIndex] += frame[sourceRow + i];
          counts[targetIndex] += 1;
        }
      }
    }

    if (!read) {
      return false;
    }

    const values = target.getScalarData();

    for (let index = 0; index < values.length; index++) {
      values[index] = counts[index] ? accumulator[index] / counts[index] : 0;
    }

    return true;
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
    const factors = boxFactorsOf(volume, grid);
    // One slice of this grid. A fill of the whole grid would read every voxel
    // of the volume on every refill, and a delivery changes one slice of it.
    const slab = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [width, height, 1],
      scalarData: new Constructor(frameLength),
      numberOfComponents: 1,
    });

    for (let slice = 0; slice < depth; slice++) {
      if (!model.updatedFrames[slice]) {
        continue;
      }

      // `fillGrid` leaves a voxel untouched where the composite holds no
      // value, and this slab serves every slice, so a voxel that one slice does
      // not fill would keep the value that an earlier slice wrote.
      slab.getScalarData().fill(0);

      // A slice whose data has not arrived uploads the cleared slab, which
      // costs nothing to compute. The volume marks that slice again when its
      // frames arrive, and the next render fills it with real voxels. Filling
      // every slice of a new texture from the data would stall the first
      // render: a volume of 512 x 512 x 1232 measured about 17 seconds.
      const filled =
        factors && fillSliceByBoxAverage(volume, grid, factors, slice, slab);

      if (!filled && !factors) {
        // The grid is not a box of the grid of the volume, such as an oblique
        // slab, and the composite covers a grid of any shape. Its origin moves
        // along the k axis by the spacing of one voxel of the grid, so it reads
        // the voxels that this slice covers and no others.
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
          slab
        );
      }

      let data = slab.getScalarData();

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
  const superModified = publicAPI.modified;
  publicAPI.setUpdatedFrame = (frameIndex) => {
    model.updatedFrames[frameIndex] = true;
    superModified();
  };

  publicAPI.modified = () => {
    superModified();

    // this is really not efficient, but it works for now
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
