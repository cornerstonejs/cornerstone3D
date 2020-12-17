import { vec3 } from 'gl-matrix';
import isEqual from 'lodash.isequal';
import macro from 'vtk.js/Sources/macro';
import vtkOpenGLVolumeMapper from 'vtk.js/Sources/Rendering/OpenGL/VolumeMapper';
import { Filter } from 'vtk.js/Sources/Rendering/OpenGL/Texture/Constants';
import { VtkDataTypes } from 'vtk.js/Sources/Common/Core/DataArray/Constants';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import { Representation } from 'vtk.js/Sources/Rendering/Core/Property/Constants';

/**
 * vtkStreamingOpenGLVolumeMapper - A dervied class of the core vtkOpenGLVolumeMapper class.
 * This class  replaces the buildBufferObjects function so that we progressively upload our textures
 * into GPU memory uisng the new methods on vtkStreamingOpenGLTexture.
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

    if (image === null) {
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

    const numComp = image.getPointData().getScalars().getNumberOfComponents();
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

      model.opacityTexture.releaseGraphicsResources(model.openGLRenderWindow);
      model.opacityTexture.setMinificationFilter(Filter.LINEAR);
      model.opacityTexture.setMagnificationFilter(Filter.LINEAR);

      // use float texture where possible because we really need the resolution
      // for this table. Errors in low values of opacity accumulate to
      // visible artifacts. High values of opacity quickly terminate without
      // artifacts.
      if (
        model.openGLRenderWindow.getWebgl2() ||
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

      model.colorTexture.releaseGraphicsResources(model.openGLRenderWindow);
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

      const previousTextureParameters = model.scalarTexture.getTextureParameters();

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
          previousTextureParameters.depth;
        if (data.length === previousTextureSize) {
          shouldReset = false;
        }
      }

      if (shouldReset) {
        model.scalarTexture.releaseGraphicsResources(model.openGLRenderWindow);
        model.scalarTexture.resetFormatAndType();

        model.scalarTexture.create3DFilterableFromRaw(
          dims[0],
          dims[1],
          dims[2],
          numComp,
          dataType,
          data
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

  publicAPI.getNeedToRebuildShaders = (cellBO, ren, actor) => {
    // do we need lighting?
    let lightComplexity = 0;
    if (
      actor.getProperty().getShade() &&
      model.renderable.getBlendMode() === BlendMode.COMPOSITE_BLEND
    ) {
      // consider the lighting complexity to determine which case applies
      // simple headlight, Light Kit, the whole feature set of VTK
      lightComplexity = 0;
      model.numberOfLights = 0;

      ren.getLights().forEach((light) => {
        const status = light.getSwitch();
        if (status > 0) {
          model.numberOfLights++;
          if (lightComplexity === 0) {
            lightComplexity = 1;
          }
        }

        if (
          lightComplexity === 1 &&
          (model.numberOfLights > 1 ||
            light.getIntensity() !== 1.0 ||
            !light.lightTypeIsHeadLight())
        ) {
          lightComplexity = 2;
        }
        if (lightComplexity < 3 && light.getPositional()) {
          lightComplexity = 3;
        }
      });
    }

    if (model.lastLightComplexity !== lightComplexity) {
      model.lastLightComplexity = lightComplexity;
      return true;
    }

    const numComp = model.scalarTexture.getComponents();
    const iComps = actor.getProperty().getIndependentComponents();
    let usesProportionalComponents = false;
    let proportionalComponents = [];
    if (iComps) {
      // Define any proportional components
      for (let nc = 0; nc < numComp; nc++) {
        proportionalComponents.push(actor.getProperty().getOpacityMode(nc));
      }

      if (proportionalComponents.length > 0) {
        usesProportionalComponents = true;
      }
    }

    const ext = model.currentInput.getExtent();
    const spc = model.currentInput.getSpacing();
    const vsize = vec3.create();
    vec3.set(
      vsize,
      (ext[1] - ext[0]) * spc[0],
      (ext[3] - ext[2]) * spc[1],
      (ext[5] - ext[4]) * spc[2]
    );

    const maxSamples =
      vec3.length(vsize) / model.renderable.getSampleDistance();

    const state = {
      interpolationType: actor.getProperty().getInterpolationType(),
      useLabelOutline: actor.getProperty().getUseLabelOutline(),
      numComp,
      usesProportionalComponents,
      iComps,
      maxSamples,
      useGradientOpacity: actor.getProperty().getUseGradientOpacity(0),
      blendMode: model.renderable.getBlendMode(),
      averageIPScalarMode: model.renderable.getAverageIPScalarRange(),
      proportionalComponents,
    };

    if (
      model.previousState.interpolationType !== state.interpolationType ||
      model.previousState.useLabelOutline !== state.useLabelOutline ||
      model.previousState.numComp !== state.numComp ||
      model.previousState.usesProportionalComponents !==
        state.usesProportionalComponents ||
      model.previousState.iComps !== state.iComps ||
      model.previousState.maxSamples !== state.maxSamples ||
      model.previousState.useGradientOpacity !== state.useGradientOpacity ||
      model.previousState.blendMode !== state.blendMode ||
      !isEqual(
        model.previousState.averageIPScalarMode,
        state.averageIPScalarMode
      ) ||
      !isEqual(
        model.previousState.proportionalComponents,
        state.proportionalComponents
      )
    ) {
      model.previousState = Object.assign({}, state);

      return true;
    }

    // has something changed that would require us to recreate the shader?
    if (
      cellBO.getProgram() === 0 ||
      model.lastHaveSeenDepthRequest !== model.haveSeenDepthRequest ||
      !!model.lastZBufferTexture !== !!model.zBufferTexture ||
      cellBO.getShaderSourceTime().getMTime() < publicAPI.getMTime() ||
      // cellBO.getShaderSourceTime().getMTime() < actor.getMTime() || // Disabled versus upstream VTK, since we only need to rebuild shaders if the above checks fail
      cellBO.getShaderSourceTime().getMTime() < model.renderable.getMTime()
      //cellBO.getShaderSourceTime().getMTime() < model.currentInput.getMTime()  // Disabled versus upstream VTK, since we only need to rebuild shaders if the above checks fail
    ) {
      model.lastZBufferTexture = model.zBufferTexture;
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
