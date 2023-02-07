import { mat3, mat4, vec3 } from 'gl-matrix';
import macro from '@kitware/vtk.js/macros';
import vtkOpenGLVolumeMapper from '@kitware/vtk.js/Rendering/OpenGL/VolumeMapper';
import { Filter } from '@kitware/vtk.js/Rendering/OpenGL/Texture/Constants';
import { VtkDataTypes } from '@kitware/vtk.js/Common/Core/DataArray/Constants';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { Representation } from '@kitware/vtk.js/Rendering/Core/Property/Constants';

const { vtkWarningMacro } = macro;
/**
 * vtkStreamingOpenGLVolumeMapper - A dervied class of the core vtkOpenGLVolumeMapper class.
 * This class  replaces the buildBufferObjects function so that we progressively upload our textures
 * into GPU memory using the new methods on vtkStreamingOpenGLTexture.
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkStreamingOpenGLVolumeMapper(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLVolumeMapper');

  /**
   * buildBufferObjects - A fork of vtkOpenGLVolumeMapper's buildBufferObjects method.
   * This fork performs most of the same actions, but builds the textures progressively using
   * vtkStreamingOpenGLTexture's methods, and also prevents recomputation of the texture for each
   * vtkStreamingOpenGLVolumeMapper using the texture.
   *
   *
   * @param {*} ren The renderer.
   * @param {*} actor The actor to build the buffer objects for.
   */
  publicAPI.buildBufferObjects = (ren, actor) => {
    const image = model.currentInput;
    if (!image) {
      return;
    }

    const scalars = image.getPointData() && image.getPointData().getScalars();
    if (!scalars) {
      return;
    }

    const vprop = actor.getProperty();

    if (!model.jitterTexture.getHandle()) {
      const oTable = new Uint8Array(32 * 32);
      for (let i = 0; i < 32 * 32; ++i) {
        oTable[i] = 255.0 * Math.random();
      }
      model.jitterTexture.setMinificationFilter(Filter.LINEAR);
      model.jitterTexture.setMagnificationFilter(Filter.LINEAR);
      model.jitterTexture.create2DFromRaw(
        32,
        32,
        1,
        VtkDataTypes.UNSIGNED_CHAR,
        oTable
      );
    }

    const numComp = scalars.getNumberOfComponents();
    const iComps = vprop.getIndependentComponents();
    const numIComps = iComps ? numComp : 1;

    // rebuild opacity tfun?
    let toString = `${vprop.getMTime()}`;
    if (model.opacityTextureString !== toString) {
      const oWidth = 1024;
      const oSize = oWidth * 2 * numIComps;
      const ofTable = new Float32Array(oSize);
      const tmpTable = new Float32Array(oWidth);

      for (let c = 0; c < numIComps; ++c) {
        const ofun = vprop.getScalarOpacity(c);
        const opacityFactor =
          model.renderable.getSampleDistance() /
          vprop.getScalarOpacityUnitDistance(c);

        const oRange = ofun.getRange();
        ofun.getTable(oRange[0], oRange[1], oWidth, tmpTable, 1);
        // adjust for sample distance etc
        for (let i = 0; i < oWidth; ++i) {
          ofTable[c * oWidth * 2 + i] =
            1.0 - (1.0 - tmpTable[i]) ** opacityFactor;
          ofTable[c * oWidth * 2 + i + oWidth] = ofTable[c * oWidth * 2 + i];
        }
      }

      model.opacityTexture.releaseGraphicsResources(model._openGLRenderWindow);
      model.opacityTexture.setMinificationFilter(Filter.LINEAR);
      model.opacityTexture.setMagnificationFilter(Filter.LINEAR);

      // use float texture where possible because we really need the resolution
      // for this table. Errors in low values of opacity accumulate to
      // visible artifacts. High values of opacity quickly terminate without
      // artifacts.
      if (
        model._openGLRenderWindow.getWebgl2() ||
        (model.context.getExtension('OES_texture_float') &&
          model.context.getExtension('OES_texture_float_linear'))
      ) {
        model.opacityTexture.create2DFromRaw(
          oWidth,
          2 * numIComps,
          1,
          VtkDataTypes.FLOAT,
          ofTable
        );
      } else {
        const oTable = new Uint8Array(oSize);
        for (let i = 0; i < oSize; ++i) {
          oTable[i] = 255.0 * ofTable[i];
        }
        model.opacityTexture.create2DFromRaw(
          oWidth,
          2 * numIComps,
          1,
          VtkDataTypes.UNSIGNED_CHAR,
          oTable
        );
      }
      model.opacityTextureString = toString;
    }

    // rebuild color tfun?
    toString = `${vprop.getMTime()}`;

    if (model.colorTextureString !== toString) {
      const cWidth = 1024;
      const cSize = cWidth * 2 * numIComps * 3;
      const cTable = new Uint8Array(cSize);
      const tmpTable = new Float32Array(cWidth * 3);

      for (let c = 0; c < numIComps; ++c) {
        const cfun = vprop.getRGBTransferFunction(c);
        const cRange = cfun.getRange();
        cfun.getTable(cRange[0], cRange[1], cWidth, tmpTable, 1);
        for (let i = 0; i < cWidth * 3; ++i) {
          cTable[c * cWidth * 6 + i] = 255.0 * tmpTable[i];
          cTable[c * cWidth * 6 + i + cWidth * 3] = 255.0 * tmpTable[i];
        }
      }

      model.colorTexture.releaseGraphicsResources(model._openGLRenderWindow);
      model.colorTexture.setMinificationFilter(Filter.LINEAR);
      model.colorTexture.setMagnificationFilter(Filter.LINEAR);

      model.colorTexture.create2DFromRaw(
        cWidth,
        2 * numIComps,
        3,
        VtkDataTypes.UNSIGNED_CHAR,
        cTable
      );
      model.colorTextureString = toString;
    }

    // rebuild the scalarTexture if the data has changed
    toString = `${image.getMTime()}`;

    if (model.scalarTextureString !== toString) {
      // Build the textures
      const dims = image.getDimensions();

      const previousTextureParameters =
        model.scalarTexture.getTextureParameters();

      const dataType = image.getPointData().getScalars().getDataType();
      const data = image.getPointData().getScalars().getData();

      let shouldReset = true;

      if (
        previousTextureParameters.dataType &&
        previousTextureParameters.dataType === dataType
      ) {
        const previousTextureSize =
          previousTextureParameters.width *
          previousTextureParameters.height *
          previousTextureParameters.depth *
          previousTextureParameters.numComps;
        if (data.length === previousTextureSize) {
          shouldReset = false;
        }
      }

      if (shouldReset) {
        model.scalarTexture.releaseGraphicsResources(model._openGLRenderWindow);
        model.scalarTexture.resetFormatAndType();

        model.scalarTexture.create3DFilterableFromRaw(
          dims[0],
          dims[1],
          dims[2],
          numComp,
          scalars.getDataType(),
          scalars.getData(),
          model.renderable.getPreferSizeOverAccuracy()
        );
      } else {
        model.scalarTexture.deactivate();
        model.scalarTexture.update3DFromRaw(data);
      }

      model.scalarTextureString = toString;
    }

    if (!model.tris.getCABO().getElementCount()) {
      // build the CABO
      const ptsArray = new Float32Array(12);
      for (let i = 0; i < 4; i++) {
        ptsArray[i * 3] = (i % 2) * 2 - 1.0;
        ptsArray[i * 3 + 1] = i > 1 ? 1.0 : -1.0;
        ptsArray[i * 3 + 2] = -1.0;
      }

      const cellArray = new Uint16Array(8);
      cellArray[0] = 3;
      cellArray[1] = 0;
      cellArray[2] = 1;
      cellArray[3] = 3;
      cellArray[4] = 3;
      cellArray[5] = 0;
      cellArray[6] = 3;
      cellArray[7] = 2;

      const points = vtkDataArray.newInstance({
        numberOfComponents: 3,
        values: ptsArray,
      });
      points.setName('points');
      const cells = vtkDataArray.newInstance({
        numberOfComponents: 1,
        values: cellArray,
      });
      model.tris.getCABO().createVBO(cells, 'polys', Representation.SURFACE, {
        points,
        cellOffset: 0,
      });
    }

    model.VBOBuildTime.modified();
  };

  // publicAPI.getRenderTargetSize = () => {
  //   // https://github.com/Kitware/vtk-js/blob/master/Sources/Rendering/OpenGL/VolumeMapper/index.js#L952
  //   if (model.lastXYF > 1.43) {
  //     const sz = model.framebuffer.getSize()
  //     return [model.fvp[0] * sz[0], model.fvp[1] * sz[1]]
  //   }

  //   // This seems wrong, it assumes the renderWindow only has one renderer
  //   // but I don't know if this stuff is correct...

  //   const { usize, vsize } = model.openGLRenderer.getTiledSizeAndOrigin()

  //   return [usize, vsize]
  // }

  // publicAPI.getRenderTargetSize = () => {
  //   if (model._useSmallViewport) {
  //     return [model._smallViewportWidth, model._smallViewportHeight]
  //   }

  //   return model._openGLRenderWindow.getFramebufferSize()
  // }

  publicAPI.getRenderTargetSize = () => {
    if (model._useSmallViewport) {
      return [model._smallViewportWidth, model._smallViewportHeight];
    }

    const { usize, vsize } = model._openGLRenderer.getTiledSizeAndOrigin();

    return [usize, vsize];
  };

  publicAPI.getRenderTargetOffset = () => {
    const { lowerLeftU, lowerLeftV } =
      model._openGLRenderer.getTiledSizeAndOrigin();

    return [lowerLeftU, lowerLeftV];
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkOpenGLVolumeMapper.extend(publicAPI, model, initialValues);

  model.scalarTexture = initialValues.scalarTexture;
  model.previousState = {};

  // Object methods
  vtkStreamingOpenGLVolumeMapper(publicAPI, model);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkStreamingOpenGLVolumeMapper'
);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
