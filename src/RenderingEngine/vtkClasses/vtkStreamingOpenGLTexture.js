import macro from 'vtk.js/Sources/macro';
import vtkOpenGLTexture from 'vtk.js/Sources/Rendering/OpenGL/Texture';

// ----------------------------------------------------------------------------
// vtkOpenGLTexture methods
// ----------------------------------------------------------------------------

function vtkStreamingOpenGLTexture(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLTexture');

  const superCreate3DFilterableFromRaw = publicAPI.create3DFilterableFromRaw;

  publicAPI.create3DFilterableFromRaw = (
    width,
    height,
    depth,
    numComps,
    dataType,
    data
  ) => {
    model.inputDataType = dataType;
    model.inputNumComps = numComps;

    superCreate3DFilterableFromRaw(
      width,
      height,
      depth,
      numComps,
      dataType,
      data
    );
  };

  publicAPI.update3DFromRaw = data => {
    const { updatedFrames } = model;

    if (!updatedFrames.length) {
      return;
    }

    model.openGLRenderWindow.activateTexture(publicAPI);
    publicAPI.createTexture();
    publicAPI.bind();

    let bytesPerVoxel;
    let TypedArrayConstructor;

    if (data instanceof Uint8Array) {
      bytesPerVoxel = 1;
      TypedArrayConstructor = Uint8Array;
    } else if (data instanceof Int16Array) {
      bytesPerVoxel = 2;
      TypedArrayConstructor = Int16Array;
    } else if (data instanceof Float32Array) {
      bytesPerVoxel = 4;
      TypedArrayConstructor = Float32Array;
    } else {
      throw new Error(`No support for given TypedArray.`);
    }

    for (let i = 0; i < updatedFrames.length; i++) {
      if (updatedFrames[i]) {
        model.fillSubImage3D(data, i, bytesPerVoxel, TypedArrayConstructor);
      }
    }

    // Reset updatedFrames
    model.updatedFrames = [];

    if (model.generateMipmap) {
      model.context.generateMipmap(model.target);
    }

    publicAPI.deactivate();
    return true;
  };

  model.fillSubImage3D = (
    data,
    frameIndex,
    bytesPerVoxel,
    TypedArrayConstructor
  ) => {
    const buffer = data.buffer;

    const frameLength = model.width * model.height;
    const frameLengthInBytes = frameLength * bytesPerVoxel;

    const zOffset = frameIndex * frameLengthInBytes;
    const rowLength = model.width;

    const gl = model.context;

    /**
     * It appears that the implementation of texSubImage3D uses 2D textures to do the texture copy if
     * MAX_TEXTURE_SIZE is greater than MAX_TEXTURE_SIZE_3D. As such if you make a single block too big
     * the transfer messes up cleanly and you render a black box or some data if you are lucky.
     *
     * This block-size based on 2D texture size seems like the safest approach that should work on most systems.
     *
     * There are certainly further optimizations that could be done here, we can do bigger chunks with other systems
     * But we need to find the _exact_ criteria. And then its not even guaranteed it'll be much fasteR.
     */
    const MAX_TEXTURE_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    let blockHeight = Math.floor(
      (bytesPerVoxel * MAX_TEXTURE_SIZE) / model.width
    );

    // Cap to actual frame height:
    blockHeight = Math.min(blockHeight, model.height);

    const multiRowBlockLength = rowLength * blockHeight;
    const multiRowBlockLengthInBytes = multiRowBlockLength * bytesPerVoxel;

    const normalBlocks = Math.floor(model.height / blockHeight);

    const lastBlockHeight = model.height % blockHeight;
    const multiRowLastBlockLength = rowLength * lastBlockHeight;

    // Perform most blocks.
    for (let block = 0; block < normalBlocks; block++) {
      const yOffset = block * blockHeight;

      // Dataview of block
      const dataView = new TypedArrayConstructor(
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

  publicAPI.setUpdatedFrame = frameIndex => {
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
