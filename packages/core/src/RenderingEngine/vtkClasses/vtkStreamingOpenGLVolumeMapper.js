import macro from '@kitware/vtk.js/macros';
import vtkOpenGLVolumeMapper from '@kitware/vtk.js/Rendering/OpenGL/VolumeMapper';
import { Filter } from '@kitware/vtk.js/Rendering/OpenGL/Texture/Constants';
import { VtkDataTypes } from '@kitware/vtk.js/Common/Core/DataArray/Constants';
import { getTransferFunctionsHash } from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow/resourceSharingHelper';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { Representation } from '@kitware/vtk.js/Rendering/Core/Property/Constants';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import { getConstructorFromType } from '../../utilities/getBufferConfiguration';
import { getCanUseNorm16Texture } from '../../init';

/**
 * vtkStreamingOpenGLVolumeMapper - A derived class of the core vtkOpenGLVolumeMapper class.
 * This class  replaces the buildBufferObjects function so that we progressively upload our textures
 * into GPU memory using the new methods on vtkStreamingOpenGLTexture.
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

    const vprop = actor.getProperty();

    if (!model.jitterTexture.getHandle()) {
      const oTable = new Uint8Array(32 * 32);
      for (let i = 0; i < 32 * 32; ++i) {
        oTable[i] = 255.0 * Math.random();
      }
      model.jitterTexture.setMinificationFilter(Filter.LINEAR);
      model.jitterTexture.setMagnificationFilter(Filter.LINEAR);
      model.jitterTexture.create2DFromRaw({
        width: 32,
        height: 32,
        numberOfComponents: 1,
        dataType: VtkDataTypes.UNSIGNED_CHAR,
        data: oTable,
      });
    }

    const { numberOfComponents: numIComps } = image.get('numberOfComponents');
    const useIndependentComps = publicAPI.useIndependentComponents(vprop);

    const scalarOpacityFunc = vprop.getScalarOpacity();
    const opTex =
      model._openGLRenderWindow.getGraphicsResourceForObject(scalarOpacityFunc);
    let toString = getTransferFunctionsHash(
      [scalarOpacityFunc],
      useIndependentComps,
      numIComps
    );
    const reBuildOp = !opTex?.oglObject || opTex.hash !== toString;
    if (reBuildOp) {
      model.opacityTexture = vtkOpenGLTexture.newInstance();
      model.opacityTexture.setOpenGLRenderWindow(model._openGLRenderWindow);
      // rebuild opacity tfun?
      const oWidth = 1024;
      const oSize = oWidth * 2 * numIComps;
      const ofTable = new Float32Array(oSize);
      const tmpTable = new Float32Array(oWidth);

      // for debugging
      // for (let index = 0; index < 3; index++) {
      //   const ofun = vprop.getScalarOpacity(0);
      //   const nodeValue1 = [];
      //   ofun.getNodeValue(index, nodeValue1);
      //   console.debug(index, nodeValue1);
      // }

      for (let c = 0; c < numIComps; ++c) {
        const ofun = vprop.getScalarOpacity(c);
        const opacityFactor =
          publicAPI.getCurrentSampleDistance(ren) /
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

      model.opacityTexture.resetFormatAndType();
      model.opacityTexture.setMinificationFilter(Filter.LINEAR);
      model.opacityTexture.setMagnificationFilter(Filter.LINEAR);

      // use float texture where possible because we really need the resolution
      // for this table. Errors in low values of opacity accumulate to
      // visible artifacts. High values of opacity quickly terminate without
      // artifacts.
      if (
        model._openGLRenderWindow.getWebgl2() &&
        model.context.getExtension('OES_texture_float') &&
        model.context.getExtension('OES_texture_float_linear')
      ) {
        model.opacityTexture.create2DFromRaw({
          width: oWidth,
          height: 2 * numIComps,
          numberOfComponents: 1,
          dataType: VtkDataTypes.FLOAT,
          data: ofTable,
        });
      } else {
        const oTable = new Uint8ClampedArray(oSize);
        for (let i = 0; i < oSize; ++i) {
          oTable[i] = 255.0 * ofTable[i];
        }
        model.opacityTexture.create2DFromRaw({
          width: oWidth,
          height: 2 * numIComps,
          numberOfComponents: 1,
          dataType: VtkDataTypes.UNSIGNED_CHAR,
          data: oTable,
        });
      }
      if (scalarOpacityFunc) {
        model._openGLRenderWindow.setGraphicsResourceForObject(
          scalarOpacityFunc,
          model.opacityTexture,
          toString
        );
        if (scalarOpacityFunc !== model._scalarOpacityFunc) {
          model._openGLRenderWindow.registerGraphicsResourceUser(
            scalarOpacityFunc,
            publicAPI
          );
          model._openGLRenderWindow.unregisterGraphicsResourceUser(
            model._scalarOpacityFunc,
            publicAPI
          );
        }
        model._scalarOpacityFunc = scalarOpacityFunc;
      }
    } else {
      model.opacityTexture = opTex.oglObject;
    }

    // rebuild color tfun?
    const colorTransferFunc = vprop.getRGBTransferFunction();
    toString = getTransferFunctionHash(
      colorTransferFunc,
      useIndependentComps,
      numIComps
    );
    const cTex =
      model._openGLRenderWindow.getGraphicsResourceForObject(colorTransferFunc);
    const reBuildC = !cTex?.oglObject?.getHandle() || cTex?.hash !== toString;
    if (reBuildC) {
      model.colorTexture = vtkOpenGLTexture.newInstance();
      model.colorTexture.setOpenGLRenderWindow(model._openGLRenderWindow);
      const cWidth = 1024;
      const cSize = cWidth * 2 * numIComps * 3;
      const cTable = new Uint8ClampedArray(cSize);
      const tmpTable = new Float32Array(cWidth * 3);

      // // for debugging
      // for (let index = 0; index < 3; index++) {
      //   const cfun = vprop.getRGBTransferFunction(0);
      //   const nodeValue1 = [];
      //   cfun.getNodeValue(index, nodeValue1);
      //   console.debug(index, nodeValue1);
      // }

      for (let c = 0; c < numIComps; ++c) {
        const cfun = vprop.getRGBTransferFunction(c);
        const cRange = cfun.getRange();
        cfun.getTable(cRange[0], cRange[1], cWidth, tmpTable, 1);

        for (let i = 0; i < cWidth * 3; ++i) {
          cTable[c * cWidth * 6 + i] = 255.0 * tmpTable[i];
          cTable[c * cWidth * 6 + i + cWidth * 3] = 255.0 * tmpTable[i];
        }
      }

      model.colorTexture.resetFormatAndType();
      model.colorTexture.setMinificationFilter(Filter.LINEAR);
      model.colorTexture.setMagnificationFilter(Filter.LINEAR);

      model.colorTexture.create2DFromRaw({
        width: cWidth,
        height: 2 * numIComps,
        numberOfComponents: 3,
        dataType: VtkDataTypes.UNSIGNED_CHAR,
        data: cTable,
      });
      if (colorTransferFunc) {
        model._openGLRenderWindow.setGraphicsResourceForObject(
          colorTransferFunc,
          model.colorTexture,
          toString
        );
        if (colorTransferFunc !== model._colorTransferFunc) {
          model._openGLRenderWindow.registerGraphicsResourceUser(
            colorTransferFunc,
            publicAPI
          );
          model._openGLRenderWindow.unregisterGraphicsResourceUser(
            model._colorTransferFunc,
            publicAPI
          );
        }
        model._colorTransferFunc = colorTransferFunc;
      }
    } else {
      model.colorTexture = cTex.oglObject;
    }

    publicAPI.updateLabelOutlineThicknessTexture(actor);

    // rebuild the scalarTexture if the data has changed
    // IMPORTANT: this is the most important part of the streaming process.
    // we need to take into account that sometimes the texture is updated (mtime)
    // but the image is not updated since in the new model the image lives in the cpu
    // while the texture lives in the gpu.
    toString = `${image.getMTime()}-${model.scalarTexture.getMTime()}`;

    if (model.scalarTextureString !== toString) {
      // Build the textures
      const dims = image.getDimensions();
      model.scalarTexture.setOpenGLRenderWindow(model._openGLRenderWindow);

      // Set not to use half float initially since we don't know if the
      // streamed data is actually half float compatible or not yet, as
      // the data has not arrived due to streaming
      model.scalarTexture.enableUseHalfFloat(false);

      const previousTextureParameters =
        model.scalarTexture.getTextureParameters();

      const dataType = image.get('dataType').dataType;

      let shouldReset = true;

      if (previousTextureParameters?.dataType === dataType) {
        if (previousTextureParameters?.width === dims[0]) {
          if (previousTextureParameters?.height === dims[1]) {
            if (previousTextureParameters?.depth === dims[2]) {
              shouldReset = false;
            }
          }
        }
      }

      if (shouldReset) {
        const norm16Ext = model.context.getExtension('EXT_texture_norm16');
        model.scalarTexture.setOglNorm16Ext(
          getCanUseNorm16Texture() ? norm16Ext : null
        );
        model.scalarTexture.resetFormatAndType();

        model.scalarTexture.setTextureParameters({
          width: dims[0],
          height: dims[1],
          depth: dims[2],
          numberOfComponents: numIComps,
          dataType,
        });

        // const emptyDataTypeOfType = getConstructorFromType(dataType);
        // const emptyData = new emptyDataTypeOfType(dims[0] * dims[1] * dims[2]);

        // There are some bugs in mac for texStorage3D so basically here
        // we let the vtk.js decide if it wants to use it or not
        model.scalarTexture.create3DFromRaw({
          width: dims[0],
          height: dims[1],
          depth: dims[2],
          numberOfComponents: numIComps,
          dataType,
          data: null,
          // emptyData
        });

        // do an initial update since some data may be already
        // available and we can avoid a re-render to trigger
        // the update
        model.scalarTexture.update3DFromRaw();

        // since we don't have scalars we don't need to set graphics resource for the scalar texture
      } else {
        model.scalarTexture.deactivate();
        model.scalarTexture.update3DFromRaw();
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

  publicAPI.getNeedToRebuildBufferObjects = (ren, actor) => {
    if (
      model.VBOBuildTime.getMTime() < publicAPI.getMTime() ||
      model.VBOBuildTime.getMTime() < actor.getMTime() ||
      model.VBOBuildTime.getMTime() < model.renderable.getMTime() ||
      model.VBOBuildTime.getMTime() < actor.getProperty().getMTime() ||
      model.VBOBuildTime.getMTime() < model.currentInput.getMTime() ||
      model.VBOBuildTime.getMTime() < model.scalarTexture?.getMTime() ||
      model.VBOBuildTime.getMTime() < model.colorTexture?.getMTime() ||
      model.VBOBuildTime.getMTime() <
        model.labelOutlineThicknessTexture?.getMTime() ||
      !model.scalarTexture?.getHandle() ||
      !model.colorTexture?.getHandle() ||
      !model.labelOutlineThicknessTexture?.getHandle()
    ) {
      return true;
    }

    return false;
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
