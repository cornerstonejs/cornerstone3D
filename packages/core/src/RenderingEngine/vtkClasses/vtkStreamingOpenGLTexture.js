import macro from '@kitware/vtk.js/macros';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import { getConfiguration } from '../../init';
import cache from '../../cache';

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

  const superCreate3DFilterableFromRaw = publicAPI.create3DFilterableFromRaw;

  publicAPI.create3DFilterableFromRaw = (
    width,
    height,
    depth,
    numComps,
    dataType,
    data,
    preferSizeOverAccuracy
  ) => {
    model.inputDataType = dataType;
    model.inputNumComps = numComps;

    superCreate3DFilterableFromRaw(
      width,
      height,
      depth,
      numComps,
      dataType,
      data,
      preferSizeOverAccuracy
    );
  };

  /**
   * This function updates the GPU texture memory to match the current
   * representation of data held in RAM.
   *
   * @param {Float32Array|Uint8Array|Int16Array|Uint16Array} data The data array which has been updated.
   */
  publicAPI.update3DFromRaw = () => {
    const { updatedFrames } = model;

    if (!model.volumeId) {
      return;
    }

    const volume = cache.getVolume(model.volumeId);
    const isDynamicVolume = volume.isDynamicVolume();
    model._openGLRenderWindow.activateTexture(publicAPI);
    publicAPI.createTexture();
    publicAPI.bind();

    if (isDynamicVolume) {
      updateDynamicVolumeTexture();
      return;
    }

    // for dynamic volumes, we need to update the texture for the current time point
    // so there is no need to take a look at the updatedFrames really
    if (!updatedFrames.length) {
      return;
    }

    debugger;

    return updateTextureImagesUsingVoxelManager(updatedFrames);
  };

  function updateDynamicVolumeTexture() {
    const volume = cache.getVolume(model.volumeId);

    // loop over imageIds of the current time point and update the texture
    const imageIds = volume.getCurrentTimePointImageIds();

    for (let i = 0; i < imageIds.length; i++) {
      const imageId = imageIds[i];
      const image = cache.getImage(imageId);

      if (!image) {
        continue;
      }

      const data = image.voxelManager.getScalarData();
      const gl = model.context;

      const dataType = data.constructor.name;
      const [pixData] = publicAPI.updateArrayDataTypeForGL(dataType, [data]);

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

  publicAPI.setVolumeId = (volumeId) => {
    model.volumeId = volumeId;
  };

  publicAPI.getVolumeId = () => model.volumeId;

  publicAPI.setTextureParameters = (params) => {
    if (params.width) {
      model.width = params.width;
    }

    if (params.height) {
      model.height = params.height;
    }

    if (params.depth) {
      model.depth = params.depth;
    }

    if (params.numComps) {
      model.inputNumComps = params.numComps;
    }

    if (params.dataType) {
      model.inputDataType = params.dataType;
    }
  };

  publicAPI.getTextureParameters = () => {
    return {
      width: model.width,
      height: model.height,
      depth: model.depth,
      numComps: model.inputNumComps,
      dataType: model.inputDataType,
    };
  };

  /**
   * Called when a frame is loaded so that on next render we know which data to load in.
   * @param {number} frameIndex The frame to load in.
   */
  publicAPI.setUpdatedFrame = (frameIndex) => {
    model.updatedFrames[frameIndex] = true;
  };

  publicAPI.modified = () => {
    const volume = cache.getVolume(model.volumeId);
    const imageIds = volume.imageIds;

    for (let i = 0; i < imageIds.length; i++) {
      model.updatedFrames[i] = true;
    }
  };

  publicAPI.hasUpdatedFrames = () => {
    return model.updatedFrames.some((frame) => frame);
  };

  function update3DTextureLegacy(data, updatedFrames) {
    let bytesPerVoxel;
    let TypedArrayConstructor;
    if (data instanceof Uint8Array) {
      bytesPerVoxel = 1;
      TypedArrayConstructor = Uint8Array;
    } else if (data instanceof Int16Array) {
      bytesPerVoxel = 2;
      TypedArrayConstructor = Int16Array;
    } else if (data instanceof Uint16Array) {
      bytesPerVoxel = 2;
      TypedArrayConstructor = Uint16Array;
    } else if (data instanceof Float32Array) {
      bytesPerVoxel = 4;
      TypedArrayConstructor = Float32Array;
    } else {
      throw new Error(`No support for given TypedArray.`);
    }

    for (let i = 0; i < updatedFrames.length; i++) {
      if (updatedFrames[i]) {
        const buffer = data.buffer;
        const frameIndex = i;

        const frameLength = model.width * model.height;
        const frameLengthInBytes =
          frameLength * model.components * bytesPerVoxel;

        const zOffset = frameIndex * frameLengthInBytes;
        const rowLength = model.width * model.components;

        const gl = model.context;

        /**
         * It appears that the implementation of texSubImage3D uses 2D textures to do the texture copy if
         * MAX_TEXTURE_SIZE is greater than MAX_TEXTURE_SIZE_3D. As such if you make a single block too big
         * the transfer messes up cleanly and you render a black box or some data if you are lucky.
         *
         * This block-size based on 2D texture size seems like the safest approach that should work on most systems.
         *
         * There are certainly further optimizations that could be done here, we can do bigger chunks with other systems
         * But we need to find the _exact_ criteria. And then its not even guaranteed it'll be much faster.
         */
        const MAX_TEXTURE_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        let blockHeight = Math.floor(
          (bytesPerVoxel * MAX_TEXTURE_SIZE) / model.width
        );

        // Cap to actual frame height:
        blockHeight = Math.min(blockHeight, model.height);
        const { useNorm16Texture, preferSizeOverAccuracy } =
          getConfiguration().rendering;
        // TODO: there is currently a bug in chrome and safari which requires
        // blockheight = 1 for norm16 textures:
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1408247
        // https://bugs.webkit.org/show_bug.cgi?id=252039
        if (useNorm16Texture && !preferSizeOverAccuracy) {
          blockHeight = 1;
        }

        const multiRowBlockLength = rowLength * blockHeight;
        const multiRowBlockLengthInBytes = multiRowBlockLength * bytesPerVoxel;

        const normalBlocks = Math.floor(model.height / blockHeight);

        const lastBlockHeight = model.height % blockHeight;
        const multiRowLastBlockLength = rowLength * lastBlockHeight;

        // Perform most blocks.
        for (let block = 0; block < normalBlocks; block++) {
          const yOffset = block * blockHeight;

          let dataView = new TypedArrayConstructor(
            buffer,
            zOffset + block * multiRowBlockLengthInBytes,
            multiRowBlockLength
          );

          gl.texSubImage3D(
            model.target, // target
            0, // mipMap level (always zero)
            0, // xOffset
            yOffset, // yOffset
            frameIndex,
            model.width,
            blockHeight, //model.height,
            1, // numFramesInBlock,
            model.format,
            model.openGLDataType,
            dataView
          );
        }

        // perform last block if present
        if (lastBlockHeight !== 0) {
          const yOffset = normalBlocks * blockHeight;

          // Dataview of last block
          const dataView = new TypedArrayConstructor(
            buffer,
            zOffset + normalBlocks * multiRowBlockLengthInBytes,
            multiRowLastBlockLength
          );

          gl.texSubImage3D(
            model.target, // target
            0, // mipMap level (always zero)
            0, // xOffset
            yOffset, // yOffset
            frameIndex,
            model.width,
            lastBlockHeight, //model.height,
            1, // numFramesInBlock,
            model.format,
            model.openGLDataType,
            dataView
          );
        }
      }
    }

    // Reset updatedFrames
    model.updatedFrames = [];

    if (model.generateMipmap) {
      model.context.generateMipmap(model.target);
    }

    publicAPI.deactivate();
    return true;
  }

  function updateTextureImagesUsingVoxelManager(updatedFrames) {
    const volume = cache.getVolume(model.volumeId);
    const imageIds = volume.imageIds;
    for (let i = 0; i < updatedFrames.length; i++) {
      if (updatedFrames[i]) {
        // find the updated frames
        const image = cache.getImage(imageIds[i]);

        if (!image) {
          continue;
        }

        const data = image.voxelManager.getScalarData();
        const gl = model.context;

        const dataType = data.constructor.name;
        const [pixData] = publicAPI.updateArrayDataTypeForGL(dataType, [data]);

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
        updatedFrames[i] = null;
      }
    }

    if (model.generateMipmap) {
      model.context.generateMipmap(model.target);
    }

    publicAPI.deactivate();
    return true;
  }
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
