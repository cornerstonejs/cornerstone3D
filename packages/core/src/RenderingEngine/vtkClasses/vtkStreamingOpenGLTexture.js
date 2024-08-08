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

  const superModified = publicAPI.modified;
  publicAPI.modified = () => {
    // Really important piece here that wasted a lot of time from me
    // always make sure to call the super method first
    superModified();
    const volume = cache.getVolume(model.volumeId);
    const imageIds = volume.imageIds;

    for (let i = 0; i < imageIds.length; i++) {
      model.updatedFrames[i] = true;
    }
  };

  publicAPI.hasUpdatedFrames = () => {
    return model.updatedFrames.some((frame) => frame);
  };

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
