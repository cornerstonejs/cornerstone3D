import macro from '@kitware/vtk.js/macros';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { VtkDataTypes } from '@kitware/vtk.js/Common/Core/DataArray/Constants';
import vtkOpenGLVolumeMapper from '@kitware/vtk.js/Rendering/OpenGL/VolumeMapper';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import { Filter } from '@kitware/vtk.js/Rendering/OpenGL/Texture/Constants';
import { getTransferFunctionsHash } from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow/resourceSharingHelper';
import { Representation } from '@kitware/vtk.js/Rendering/Core/Property/Constants';
import { BlendMode } from '@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants';
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

  // Associate a reference counter to each graphics resource
  const graphicsResourceReferenceCount = new Map();

  function decreaseGraphicsResourceCount(openGLRenderWindow, coreObject) {
    if (!coreObject) {
      return;
    }
    const oldCount = graphicsResourceReferenceCount.get(coreObject) ?? 0;
    const newCount = oldCount - 1;
    if (newCount <= 0) {
      openGLRenderWindow.unregisterGraphicsResourceUser(coreObject, publicAPI);
      graphicsResourceReferenceCount.delete(coreObject);
    } else {
      graphicsResourceReferenceCount.set(coreObject, newCount);
    }
  }

  function increaseGraphicsResourceCount(openGLRenderWindow, coreObject) {
    if (!coreObject) {
      return;
    }
    const oldCount = graphicsResourceReferenceCount.get(coreObject) ?? 0;
    const newCount = oldCount + 1;
    graphicsResourceReferenceCount.set(coreObject, newCount);
    if (oldCount <= 0) {
      openGLRenderWindow.registerGraphicsResourceUser(coreObject, publicAPI);
    }
  }

  function replaceGraphicsResource(
    openGLRenderWindow,
    oldResourceCoreObject,
    newResourceCoreObject
  ) {
    if (oldResourceCoreObject === newResourceCoreObject) {
      return;
    }
    decreaseGraphicsResourceCount(openGLRenderWindow, oldResourceCoreObject);
    increaseGraphicsResourceCount(openGLRenderWindow, newResourceCoreObject);
  }

  publicAPI.renderPiece = (ren, actor) => {
    publicAPI.invokeEvent({ type: 'StartEvent' });

    // Get the valid image data inputs
    model.renderable.update();
    const numberOfInputs = model.renderable.getNumberOfInputPorts();
    model.currentValidInputs = [];
    for (let inputIndex = 0; inputIndex < numberOfInputs; ++inputIndex) {
      const imageData = model.renderable.getInputData(inputIndex);
      if (imageData && !imageData.isDeleted()) {
        model.currentValidInputs.push({ imageData, inputIndex });
      }
    }
    let newNumberOfLights = 0;
    if (model.currentValidInputs.length > 0) {
      const volumeProperties = actor.getProperties();
      const firstValidInput = model.currentValidInputs[0];
      const firstImageData = firstValidInput.imageData;
      const firstVolumeProperty = volumeProperties[firstValidInput.inputIndex];

      // Get the number of lights
      if (
        firstVolumeProperty.getShade() &&
        model.renderable.getBlendMode() === BlendMode.COMPOSITE_BLEND
      ) {
        ren.getLights().forEach((light) => {
          if (light.getSwitch() > 0) {
            newNumberOfLights++;
          }
        });
      }

      // Number of components
      const numberOfValidInputs = model.currentValidInputs.length;
      const multiTexturePerVolumeEnabled = numberOfValidInputs > 1;
      const { numberOfComponents } = firstImageData.get('numberOfComponents');
      model.numberOfComponents = multiTexturePerVolumeEnabled
        ? numberOfValidInputs
        : numberOfComponents;

      // Check if we should use independent components
      // For multi-component data, check the volume property
      if (model.numberOfComponents > 1) {
        model.useIndependentComponents =
          firstVolumeProperty.getIndependentComponents();
      } else {
        model.useIndependentComponents = false;
      }
    }
    if (newNumberOfLights !== model.numberOfLights) {
      model.numberOfLights = newNumberOfLights;
      publicAPI.modified();
    }

    publicAPI.invokeEvent({ type: 'EndEvent' });

    if (model.currentValidInputs.length === 0) {
      return;
    }

    publicAPI.renderPieceStart(ren, actor);
    publicAPI.renderPieceDraw(ren, actor);
    publicAPI.renderPieceFinish(ren, actor);
  };

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
    if (!model.jitterTexture.getHandle()) {
      const jitterArray = new Float32Array(32 * 32);
      for (let i = 0; i < 32 * 32; ++i) {
        jitterArray[i] = Math.random();
      }
      model.jitterTexture.setMinificationFilter(Filter.NEAREST);
      model.jitterTexture.setMagnificationFilter(Filter.NEAREST);
      model.jitterTexture.create2DFromRaw({
        width: 32,
        height: 32,
        numComps: 1,
        dataType: VtkDataTypes.FLOAT,
        data: jitterArray,
      });
    }

    const volumeProperties = actor.getProperties();
    const firstValidInput = model.currentValidInputs[0];
    const firstVolumeProperty = volumeProperties[firstValidInput.inputIndex];
    const numberOfComponents = model.numberOfComponents;
    const useIndependentComps = model.useIndependentComponents;
    const numIComps = useIndependentComps ? numberOfComponents : 1;

    // rebuild opacity tfun?
    const opacityFunctions = [];
    for (let component = 0; component < numIComps; ++component) {
      opacityFunctions.push(firstVolumeProperty.getScalarOpacity(component));
    }
    const opacityFuncHash = getTransferFunctionsHash(
      opacityFunctions,
      useIndependentComps,
      numIComps
    );
    const firstScalarOpacityFunc = firstVolumeProperty.getScalarOpacity();
    const opTex = model._openGLRenderWindow.getGraphicsResourceForObject(
      firstScalarOpacityFunc
    );
    const reBuildOp =
      !opTex?.oglObject?.getHandle() || opTex.hash !== opacityFuncHash;
    if (reBuildOp) {
      const newOpacityTexture = vtkOpenGLTexture.newInstance();
      newOpacityTexture.setOpenGLRenderWindow(model._openGLRenderWindow);
      let oWidth = model.renderable.getOpacityTextureWidth();
      if (oWidth <= 0) {
        oWidth = model.context.getParameter(model.context.MAX_TEXTURE_SIZE);
      }
      const oSize = oWidth * 2 * numIComps;
      const ofTable = new Float32Array(oSize);
      const tmpTable = new Float32Array(oWidth);

      for (let c = 0; c < numIComps; ++c) {
        const ofun = firstVolumeProperty.getScalarOpacity(c);
        const opacityFactor =
          publicAPI.getCurrentSampleDistance(ren) /
          firstVolumeProperty.getScalarOpacityUnitDistance(c);

        const oRange = ofun.getRange();
        ofun.getTable(oRange[0], oRange[1], oWidth, tmpTable, 1);
        // adjust for sample distance etc
        for (let i = 0; i < oWidth; ++i) {
          ofTable[c * oWidth * 2 + i] =
            1.0 - (1.0 - tmpTable[i]) ** opacityFactor;
          ofTable[c * oWidth * 2 + i + oWidth] = ofTable[c * oWidth * 2 + i];
        }
      }

      newOpacityTexture.resetFormatAndType();
      newOpacityTexture.setMinificationFilter(Filter.LINEAR);
      newOpacityTexture.setMagnificationFilter(Filter.LINEAR);

      // use float texture where possible because we really need the resolution
      // for this table. Errors in low values of opacity accumulate to
      // visible artifacts. High values of opacity quickly terminate without
      // artifacts.
      if (
        model._openGLRenderWindow.getWebgl2() ||
        (model.context.getExtension('OES_texture_float') &&
          model.context.getExtension('OES_texture_float_linear'))
      ) {
        newOpacityTexture.create2DFromRaw({
          width: oWidth,
          height: 2 * numIComps,
          numComps: 1,
          dataType: VtkDataTypes.FLOAT,
          data: ofTable,
        });
      } else {
        const oTable = new Uint8ClampedArray(oSize);
        for (let i = 0; i < oSize; ++i) {
          oTable[i] = 255.0 * ofTable[i];
        }
        newOpacityTexture.create2DFromRaw({
          width: oWidth,
          height: 2 * numIComps,
          numComps: 1,
          dataType: VtkDataTypes.UNSIGNED_CHAR,
          data: oTable,
        });
      }
      if (firstScalarOpacityFunc) {
        model._openGLRenderWindow.setGraphicsResourceForObject(
          firstScalarOpacityFunc,
          newOpacityTexture,
          opacityFuncHash
        );
      }
      model.opacityTexture = newOpacityTexture;
    } else {
      model.opacityTexture = opTex.oglObject;
    }
    replaceGraphicsResource(
      model._openGLRenderWindow,
      model._opacityTextureCore,
      firstScalarOpacityFunc
    );
    model._opacityTextureCore = firstScalarOpacityFunc;

    // rebuild color tfun?
    const colorTransferFunctions = [];
    for (let component = 0; component < numIComps; ++component) {
      colorTransferFunctions.push(
        firstVolumeProperty.getRGBTransferFunction(component)
      );
    }
    const colorFuncHash = getTransferFunctionsHash(
      colorTransferFunctions,
      useIndependentComps,
      numIComps
    );
    const firstColorTransferFunc = firstVolumeProperty.getRGBTransferFunction();
    const cTex = model._openGLRenderWindow.getGraphicsResourceForObject(
      firstColorTransferFunc
    );
    const reBuildC =
      !cTex?.oglObject?.getHandle() || cTex?.hash !== colorFuncHash;
    if (reBuildC) {
      const newColorTexture = vtkOpenGLTexture.newInstance();
      newColorTexture.setOpenGLRenderWindow(model._openGLRenderWindow);
      let cWidth = model.renderable.getColorTextureWidth();
      if (cWidth <= 0) {
        cWidth = model.context.getParameter(model.context.MAX_TEXTURE_SIZE);
      }
      const cSize = cWidth * 2 * numIComps * 3;
      const cTable = new Uint8ClampedArray(cSize);
      const tmpTable = new Float32Array(cWidth * 3);

      for (let c = 0; c < numIComps; ++c) {
        const cfun = firstVolumeProperty.getRGBTransferFunction(c);
        const cRange = cfun.getRange();
        cfun.getTable(cRange[0], cRange[1], cWidth, tmpTable, 1);
        for (let i = 0; i < cWidth * 3; ++i) {
          cTable[c * cWidth * 6 + i] = 255.0 * tmpTable[i];
          cTable[c * cWidth * 6 + i + cWidth * 3] = 255.0 * tmpTable[i];
        }
      }

      newColorTexture.resetFormatAndType();
      newColorTexture.setMinificationFilter(Filter.LINEAR);
      newColorTexture.setMagnificationFilter(Filter.LINEAR);

      newColorTexture.create2DFromRaw({
        width: cWidth,
        height: 2 * numIComps,
        numComps: 3,
        dataType: VtkDataTypes.UNSIGNED_CHAR,
        data: cTable,
      });
      model._openGLRenderWindow.setGraphicsResourceForObject(
        firstColorTransferFunc,
        newColorTexture,
        colorFuncHash
      );
      model.colorTexture = newColorTexture;
    } else {
      model.colorTexture = cTex.oglObject;
    }
    replaceGraphicsResource(
      model._openGLRenderWindow,
      model._colorTextureCore,
      firstColorTransferFunc
    );
    model._colorTextureCore = firstColorTransferFunc;

    // rebuild scalarTextures using custom streaming approach
    model.currentValidInputs.forEach(
      ({ imageData, inputIndex: _inputIndex }, component) => {
        // rebuild the scalarTexture if the data has changed
        // IMPORTANT: this is the most important part of the streaming process.
        // we need to take into account that sometimes the texture is updated (mtime)
        // but the image is not updated since in the new model the image lives in the cpu
        // while the texture lives in the gpu.

        // Initialize scalarTextures array if needed
        if (!model.scalarTextures) {
          model.scalarTextures = [];
        }

        // Ensure texture exists for this component
        if (!model.scalarTextures[component]) {
          // Texture should have been initialized in extend(), but create if missing
          console.warn(
            `ScalarTexture for component ${component} not initialized, skipping.`
          );
          return;
        }

        const currentTexture = model.scalarTextures[component];
        const toString = `${imageData.getMTime()}-${currentTexture.getMTime()}`;

        if (!model.scalarTextureStrings) {
          model.scalarTextureStrings = [];
        }

        if (model.scalarTextureStrings[component] !== toString) {
          // Build the textures
          const dims = imageData.getDimensions();
          currentTexture.setOpenGLRenderWindow(model._openGLRenderWindow);

          // Set not to use half float initially since we don't know if the
          // streamed data is actually half float compatible or not yet, as
          // the data has not arrived due to streaming
          currentTexture.enableUseHalfFloat(false);

          const previousTextureParameters =
            currentTexture.getTextureParameters();

          const dataType = imageData.get('dataType').dataType;

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
            currentTexture.setOglNorm16Ext(
              getCanUseNorm16Texture() ? norm16Ext : null
            );
            currentTexture.resetFormatAndType();

            currentTexture.setTextureParameters({
              width: dims[0],
              height: dims[1],
              depth: dims[2],
              numberOfComponents: numIComps,
              dataType,
            });

            // There are some bugs in mac for texStorage3D so basically here
            // we let the vtk.js decide if it wants to use it or not
            currentTexture.create3DFromRaw({
              width: dims[0],
              height: dims[1],
              depth: dims[2],
              numComps: numIComps,
              dataType,
              data: null,
            });

            // do an initial update since some data may be already
            // available and we can avoid a re-render to trigger
            // the update
            currentTexture.update3DFromRaw();

            // since we don't have scalars we don't need to set graphics resource for the scalar texture
          } else {
            currentTexture.deactivate();
            currentTexture.update3DFromRaw();
          }

          model.scalarTextureStrings[component] = toString;
        }

        // For resource tracking compatibility (though we don't use scalars directly)
        if (!model._scalarTexturesCore) {
          model._scalarTexturesCore = [];
        }
      }
    );

    // rebuild label outline thickness texture?
    const labelOutlineThicknessArray =
      firstVolumeProperty.getLabelOutlineThickness();
    const lTex = model._openGLRenderWindow.getGraphicsResourceForObject(
      labelOutlineThicknessArray
    );
    const labelOutlineThicknessHash = labelOutlineThicknessArray.join('-');
    const reBuildL =
      !lTex?.oglObject?.getHandle() || lTex?.hash !== labelOutlineThicknessHash;
    if (reBuildL) {
      const newLabelOutlineThicknessTexture = vtkOpenGLTexture.newInstance();
      newLabelOutlineThicknessTexture.setOpenGLRenderWindow(
        model._openGLRenderWindow
      );
      let lWidth = model.renderable.getLabelOutlineTextureWidth();
      if (lWidth <= 0) {
        lWidth = model.context.getParameter(model.context.MAX_TEXTURE_SIZE);
      }
      const lHeight = 1;
      const lSize = lWidth * lHeight;
      const lTable = new Uint8Array(lSize);

      // Assuming labelOutlineThicknessArray contains the thickness for each segment
      for (let i = 0; i < lWidth; ++i) {
        // Retrieve the thickness value for the current segment index.
        // If the value is undefined, use the first element's value as a default, otherwise use the value (even if 0)
        const thickness =
          typeof labelOutlineThicknessArray[i] !== 'undefined'
            ? labelOutlineThicknessArray[i]
            : labelOutlineThicknessArray[0];

        lTable[i] = thickness;
      }

      newLabelOutlineThicknessTexture.resetFormatAndType();
      newLabelOutlineThicknessTexture.setMinificationFilter(Filter.NEAREST);
      newLabelOutlineThicknessTexture.setMagnificationFilter(Filter.NEAREST);

      // Create a 2D texture (acting as 1D) from the raw data
      newLabelOutlineThicknessTexture.create2DFromRaw({
        width: lWidth,
        height: lHeight,
        numComps: 1,
        dataType: VtkDataTypes.UNSIGNED_CHAR,
        data: lTable,
      });

      if (labelOutlineThicknessArray) {
        model._openGLRenderWindow.setGraphicsResourceForObject(
          labelOutlineThicknessArray,
          newLabelOutlineThicknessTexture,
          labelOutlineThicknessHash
        );
      }
      model.labelOutlineThicknessTexture = newLabelOutlineThicknessTexture;
    } else {
      model.labelOutlineThicknessTexture = lTex.oglObject;
    }
    replaceGraphicsResource(
      model._openGLRenderWindow,
      model._labelOutlineThicknessTextureCore,
      labelOutlineThicknessArray
    );
    model._labelOutlineThicknessTextureCore = labelOutlineThicknessArray;

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
    // Check basic rebuild conditions
    if (
      model.VBOBuildTime.getMTime() < publicAPI.getMTime() ||
      model.VBOBuildTime.getMTime() < actor.getMTime() ||
      model.VBOBuildTime.getMTime() < model.renderable.getMTime() ||
      model.VBOBuildTime.getMTime() < actor.getProperty().getMTime() ||
      model.VBOBuildTime.getMTime() < model.colorTexture?.getMTime() ||
      model.VBOBuildTime.getMTime() <
        model.labelOutlineThicknessTexture?.getMTime() ||
      !model.colorTexture?.getHandle() ||
      !model.labelOutlineThicknessTexture?.getHandle()
    ) {
      return true;
    }

    // Check all scalar textures
    if (model.scalarTextures && model.scalarTextures.length > 0) {
      for (let i = 0; i < model.scalarTextures.length; i++) {
        const texture = model.scalarTextures[i];
        if (
          texture &&
          (model.VBOBuildTime.getMTime() < texture.getMTime() ||
            !texture.getHandle())
        ) {
          return true;
        }
      }
    }

    // Check current valid inputs
    if (model.currentValidInputs && model.currentValidInputs.length > 0) {
      for (let i = 0; i < model.currentValidInputs.length; i++) {
        const input = model.currentValidInputs[i];
        if (
          input &&
          input.imageData &&
          model.VBOBuildTime.getMTime() < input.imageData.getMTime()
        ) {
          return true;
        }
      }
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

  // Initialize scalarTextures array for multi-texture support
  // Keep backward compatibility with single scalarTexture
  if (initialValues.scalarTexture) {
    model.scalarTextures = [initialValues.scalarTexture];
  } else {
    model.scalarTextures = [];
  }

  model.scalarTextureStrings = [];
  model._scalarTexturesCore = [];
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
