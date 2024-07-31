import macro from '@kitware/vtk.js/macros';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import HalfFloat from '@kitware/vtk.js/Common/Core/HalfFloat';
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

    if (!updatedFrames.length || !model.volumeId) {
      return;
    }
    model._openGLRenderWindow.activateTexture(publicAPI);
    // publicAPI.createTexture();
    // publicAPI.bind();

    let bytesPerVoxel;
    let TypedArrayConstructor;
    const volume = cache.getVolume(model.volumeId);
    const imageIds = volume.imageIds;
    for (let i = 0; i < updatedFrames.length; i++) {
      if (updatedFrames[i]) {
        // find the updated frames
        const image = cache.getImage(imageIds[i]);

        if (!image) {
          continue;
        }

        const data = image.getPixelData();
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

        model.fillSubImage3D(data, i, bytesPerVoxel, TypedArrayConstructor);

        // Reset the updated flag
        updatedFrames[i] = null;
      }
    }

    if (model.generateMipmap) {
      model.context.generateMipmap(model.target);
    }

    publicAPI.deactivate();
    return true;
  };

  /**
   * This function updates the GPU texture memory to match the current
   * representation of data held in RAM.
   *
   * @param {Float32Array|Uint8Array} data The data array which has been updated.
   * @param {number} frameIndex The frame to load in.
   * @param {number} BytesPerVoxel The number of bytes per voxel in the data, so we don't have to constantly
   * check the array type.
   * @param {object} TypedArrayConstructor The constructor for the array type. Again so we don't have to constantly check.
   */
  model.fillSubImage3D = (data, frameIndex) => {
    const gl = model.context;

    // Bind the texture
    publicAPI.bind();

    // Calculate the offset within the 3D texture
    const zOffset = frameIndex;

    // Update the texture sub-image
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
      data // data
    );

    // Unbind the texture
    publicAPI.deactivate();
  };

  publicAPI.setVolumeId = (volumeId) => {
    model.volumeId = volumeId;

    model.volumeInfo = {
      scale: [1],
      offset: [0],
      dataComputedScale: [1],
      dataComputedOffset: [0],
      width: 512,
      height: 512,
      depth: 311,
    };
  };

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
