import macro from '@kitware/vtk.js/macros';
import vtkOpenGLImageResliceMapper from '@kitware/vtk.js/Rendering/OpenGL/ImageResliceMapper';
import vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { VtkDataTypes } from '@kitware/vtk.js/Common/Core/DataArray/Constants';
import { Representation } from '@kitware/vtk.js/Rendering/Core/Property/Constants';
import {
  getTransferFunctionsHash,
  getImageDataHash,
} from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow/resourceSharingHelper';
import { getCanUseNorm16Texture } from '../../init';

const { vtkErrorMacro } = macro;

/**
 * vtkStreamingOpenGLImageResliceMapper - A derived class of vtkOpenGLImageResliceMapper
 * that uses vtkStreamingOpenGLTexture for progressive texture updates without
 * requiring full scalar data upfront.
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkStreamingOpenGLImageResliceMapper(publicAPI, model) {
  model.classHierarchy.push('vtkStreamingOpenGLImageResliceMapper');

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
    model.renderable.update();
    const numberOfInputs = model.renderable.getNumberOfInputPorts();
    model.currentValidInputs = [];
    for (let inputIndex = 0; inputIndex < numberOfInputs; ++inputIndex) {
      const imageData = model.renderable.getInputData(inputIndex);
      if (imageData && !imageData.isDeleted()) {
        model.currentValidInputs.push({ imageData, inputIndex });
      }
    }

    const numberOfValidInputs = model.currentValidInputs.length;
    if (numberOfValidInputs <= 0) {
      vtkErrorMacro('No input!');
      return;
    }

    const firstImageData = model.currentValidInputs[0].imageData;
    const firstScalars = firstImageData.getPointData().getScalars();
    const { numberOfComponents } = firstImageData.get('numberOfComponents') || {
      numberOfComponents: undefined,
    };

    model.multiTexturePerVolumeEnabled = numberOfValidInputs > 1;
    const resolvedComponents = model.multiTexturePerVolumeEnabled
      ? numberOfValidInputs
      : typeof numberOfComponents === 'number'
        ? numberOfComponents
        : (firstScalars?.getNumberOfComponents?.() ?? 1);
    model.numberOfComponents = resolvedComponents;

    publicAPI.updateResliceGeometry();

    publicAPI.renderPieceStart(ren, actor);
    publicAPI.renderPieceDraw(ren, actor);
    publicAPI.renderPieceFinish(ren, actor);
    publicAPI.invokeEvent({ type: 'EndEvent' });
  };

  publicAPI.getNeedToRebuildBufferObjects = (ren, actor) => {
    if (
      model.VBOBuildTime.getMTime() < publicAPI.getMTime() ||
      model.VBOBuildTime.getMTime() < actor.getMTime() ||
      model.VBOBuildTime.getMTime() < model.renderable.getMTime() ||
      model.VBOBuildTime.getMTime() <
        actor.getProperty(model.currentValidInputs[0].inputIndex)?.getMTime() ||
      model.currentValidInputs.some(
        ({ imageData }) => model.VBOBuildTime.getMTime() < imageData.getMTime()
      ) ||
      model.VBOBuildTime.getMTime() < model.resliceGeom.getMTime() ||
      model.scalarTextures.length !== model.currentValidInputs.length ||
      !model.colorTexture?.getHandle() ||
      !model.pwfTexture?.getHandle()
    ) {
      return true;
    }

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

    return false;
  };

  publicAPI.buildBufferObjects = (ren, actor) => {
    const actorProperties = actor.getProperties();

    model.currentValidInputs.forEach(({ imageData }, component) => {
      if (!model.scalarTextures) {
        model.scalarTextures = [];
      }

      if (!model.scalarTextures[component]) {
        model.scalarTextures[component] = vtkOpenGLTexture.newInstance();
      }

      const currentTexture = model.scalarTextures[component];
      const actorProperty = actorProperties[component];
      const updatedExtents = actorProperty.getUpdatedExtents();
      const hasUpdatedExtents = !!updatedExtents.length;

      const canStream =
        currentTexture && typeof currentTexture.hasUpdatedFrames === 'function';

      if (canStream) {
        const dims = imageData.getDimensions();
        const { dataType } = imageData.get('dataType');
        const numComps = model.numberOfComponents;

        currentTexture.setOpenGLRenderWindow(model._openGLRenderWindow);
        currentTexture.enableUseHalfFloat?.(false);

        const previousTextureParameters =
          currentTexture.getTextureParameters?.();

        let shouldReset = true;
        if (previousTextureParameters?.dataType === dataType) {
          if (
            previousTextureParameters?.width === dims[0] &&
            previousTextureParameters?.height === dims[1] &&
            previousTextureParameters?.depth === dims[2]
          ) {
            shouldReset = false;
          }
        }

        if (shouldReset) {
          const norm16Ext = model.context.getExtension('EXT_texture_norm16');
          currentTexture.setOglNorm16Ext(
            getCanUseNorm16Texture() ? norm16Ext : null
          );
          currentTexture.resetFormatAndType();
          currentTexture.setTextureParameters?.({
            width: dims[0],
            height: dims[1],
            depth: dims[2],
            numberOfComponents: numComps,
            dataType,
          });
          currentTexture.create3DFromRaw({
            width: dims[0],
            height: dims[1],
            depth: dims[2],
            numComps,
            dataType,
            data: null,
          });
          currentTexture.update3DFromRaw();
        } else {
          currentTexture.deactivate?.();
          currentTexture.update3DFromRaw();
        }

        if (hasUpdatedExtents) {
          actorProperty.setUpdatedExtents([]);
        }
        return;
      }

      // Fallback to non-streaming scalar textures
      const scalars = imageData.getPointData().getScalars();
      if (!scalars) {
        vtkErrorMacro('No scalars available for non-streaming reslice mapper');
        return;
      }
      const tex =
        model._openGLRenderWindow.getGraphicsResourceForObject(scalars);
      const scalarsHash = getImageDataHash(imageData, scalars);
      const reBuildTex =
        !tex?.oglObject?.getHandle() || tex?.hash !== scalarsHash;

      if (reBuildTex && !hasUpdatedExtents) {
        const newScalarTexture = vtkOpenGLTexture.newInstance();
        newScalarTexture.setOpenGLRenderWindow(model._openGLRenderWindow);
        const dims = imageData.getDimensions();
        newScalarTexture.setOglNorm16Ext(
          model.context.getExtension('EXT_texture_norm16')
        );
        newScalarTexture.resetFormatAndType();
        newScalarTexture.create3DFilterableFromDataArray({
          width: dims[0],
          height: dims[1],
          depth: dims[2],
          dataArray: scalars,
        });
        model._openGLRenderWindow.setGraphicsResourceForObject(
          scalars,
          newScalarTexture,
          scalarsHash
        );
        model.scalarTextures[component] = newScalarTexture;
      } else {
        model.scalarTextures[component] = tex.oglObject;
      }

      if (hasUpdatedExtents) {
        actorProperty.setUpdatedExtents([]);
        const dims = imageData.getDimensions();
        model.scalarTextures[component].create3DFilterableFromDataArray({
          width: dims[0],
          height: dims[1],
          depth: dims[2],
          dataArray: scalars,
          updatedExtents,
        });
      }

      replaceGraphicsResource(
        model._openGLRenderWindow,
        model._scalarTexturesCore[component],
        scalars
      );
      model._scalarTexturesCore[component] = scalars;
    });

    const firstValidInput = model.currentValidInputs[0];
    const firstActorProperty = actorProperties[firstValidInput.inputIndex];
    const iComps = firstActorProperty.getIndependentComponents();
    const numIComps = iComps ? model.numberOfComponents : 1;
    const textureHeight = iComps ? 2 * numIComps : 1;

    const colorTransferFunctions = [];
    for (let component = 0; component < numIComps; ++component) {
      colorTransferFunctions.push(
        firstActorProperty.getRGBTransferFunction(component)
      );
    }
    const colorFuncHash = getTransferFunctionsHash(
      colorTransferFunctions,
      iComps,
      numIComps
    );
    const firstColorTransferFunc = firstActorProperty.getRGBTransferFunction();
    const cTex = model._openGLRenderWindow.getGraphicsResourceForObject(
      firstColorTransferFunc
    );
    const reBuildC =
      !cTex?.oglObject?.getHandle() || cTex?.hash !== colorFuncHash;
    if (reBuildC) {
      let cWidth = model.renderable.getColorTextureWidth();
      if (cWidth <= 0) {
        cWidth = model.context.getParameter(model.context.MAX_TEXTURE_SIZE);
      }
      const cSize = cWidth * textureHeight * 3;
      const cTable = new Uint8ClampedArray(cSize);
      const newColorTexture = vtkOpenGLTexture.newInstance();
      newColorTexture.setOpenGLRenderWindow(model._openGLRenderWindow);
      if (firstColorTransferFunc) {
        const tmpTable = new Float32Array(cWidth * 3);

        for (let c = 0; c < numIComps; c++) {
          const cfun = firstActorProperty.getRGBTransferFunction(c);
          const cRange = cfun.getRange();
          cfun.getTable(cRange[0], cRange[1], cWidth, tmpTable, 1);
          if (iComps) {
            for (let i = 0; i < cWidth * 3; i++) {
              cTable[c * cWidth * 6 + i] = 255.0 * tmpTable[i];
              cTable[c * cWidth * 6 + i + cWidth * 3] = 255.0 * tmpTable[i];
            }
          } else {
            for (let i = 0; i < cWidth * 3; i++) {
              cTable[c * cWidth * 3 + i] = 255.0 * tmpTable[i];
            }
          }
        }
        newColorTexture.resetFormatAndType();
        newColorTexture.create2DFromRaw({
          width: cWidth,
          height: textureHeight,
          numComps: 3,
          dataType: VtkDataTypes.UNSIGNED_CHAR,
          data: cTable,
        });
      } else {
        for (let column = 0; column < cWidth * 3; ++column) {
          const opacity = (255.0 * column) / ((cWidth - 1) * 3);
          for (let row = 0; row < textureHeight; ++row) {
            cTable[row * cWidth * 3 + column + 0] = opacity;
            cTable[row * cWidth * 3 + column + 1] = opacity;
            cTable[row * cWidth * 3 + column + 2] = opacity;
          }
        }
        newColorTexture.resetFormatAndType();
        newColorTexture.create2DFromRaw({
          width: cWidth,
          height: 1,
          numComps: 3,
          dataType: VtkDataTypes.UNSIGNED_CHAR,
          data: cTable,
        });
      }

      if (firstColorTransferFunc) {
        model._openGLRenderWindow.setGraphicsResourceForObject(
          firstColorTransferFunc,
          newColorTexture,
          colorFuncHash
        );
      }
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

    const opacityFunctions = [];
    for (let component = 0; component < numIComps; ++component) {
      opacityFunctions.push(firstActorProperty.getPiecewiseFunction(component));
    }
    const opacityFuncHash = getTransferFunctionsHash(
      opacityFunctions,
      iComps,
      numIComps
    );
    const firstPwFunc = firstActorProperty.getPiecewiseFunction();
    const pwfTex =
      model._openGLRenderWindow.getGraphicsResourceForObject(firstPwFunc);
    const reBuildPwf =
      !pwfTex?.oglObject?.getHandle() || pwfTex?.hash !== opacityFuncHash;
    if (reBuildPwf) {
      let pwfWidth = model.renderable.getOpacityTextureWidth();
      if (pwfWidth <= 0) {
        pwfWidth = model.context.getParameter(model.context.MAX_TEXTURE_SIZE);
      }
      const pwfSize = pwfWidth * textureHeight;
      const pwfTable = new Uint8ClampedArray(pwfSize);
      const newOpacityTexture = vtkOpenGLTexture.newInstance();
      newOpacityTexture.setOpenGLRenderWindow(model._openGLRenderWindow);
      if (firstPwFunc) {
        const pwfFloatTable = new Float32Array(pwfSize);
        const tmpTable = new Float32Array(pwfWidth);

        for (let c = 0; c < numIComps; ++c) {
          const pwfun = firstActorProperty.getPiecewiseFunction(c);
          if (pwfun === null) {
            pwfFloatTable.fill(1.0);
          } else {
            const pwfRange = pwfun.getRange();
            pwfun.getTable(pwfRange[0], pwfRange[1], pwfWidth, tmpTable, 1);
            if (iComps) {
              for (let i = 0; i < pwfWidth; i++) {
                pwfFloatTable[c * pwfWidth * 2 + i] = tmpTable[i];
                pwfFloatTable[c * pwfWidth * 2 + i + pwfWidth] = tmpTable[i];
              }
            } else {
              for (let i = 0; i < pwfWidth; i++) {
                pwfFloatTable[i] = tmpTable[i];
              }
            }
          }
        }
        newOpacityTexture.resetFormatAndType();
        newOpacityTexture.create2DFromRaw({
          width: pwfWidth,
          height: textureHeight,
          numComps: 1,
          dataType: VtkDataTypes.FLOAT,
          data: pwfFloatTable,
        });
      } else {
        pwfTable.fill(255.0);
        newOpacityTexture.resetFormatAndType();
        newOpacityTexture.create2DFromRaw({
          width: pwfWidth,
          height: textureHeight,
          numComps: 1,
          dataType: VtkDataTypes.UNSIGNED_CHAR,
          data: pwfTable,
        });
      }
      if (firstPwFunc) {
        model._openGLRenderWindow.setGraphicsResourceForObject(
          firstPwFunc,
          newOpacityTexture,
          opacityFuncHash
        );
      }
      model.pwfTexture = newOpacityTexture;
    } else {
      model.pwfTexture = pwfTex.oglObject;
    }
    replaceGraphicsResource(
      model._openGLRenderWindow,
      model._pwfTextureCore,
      firstPwFunc
    );
    model._pwfTextureCore = firstPwFunc;

    const vboString = `${model.resliceGeom.getMTime()}A${model.renderable.getSlabThickness()}`;
    if (
      !model.tris.getCABO().getElementCount() ||
      model.VBOBuildString !== vboString
    ) {
      const points = vtkDataArray.newInstance({
        numberOfComponents: 3,
        values: model.resliceGeom.getPoints().getData(),
      });
      points.setName('points');
      const cells = vtkDataArray.newInstance({
        numberOfComponents: 1,
        values: model.resliceGeom.getPolys().getData(),
      });

      const options = {
        points,
        cellOffset: 0,
      };
      if (model.renderable.getSlabThickness() > 0.0) {
        const n = model.resliceGeom.getPointData().getNormals();
        if (!n) {
          vtkErrorMacro('Slab mode requested without normals');
        } else {
          options.normals = n;
        }
      }
      model.tris
        .getCABO()
        .createVBO(cells, 'polys', Representation.SURFACE, options);
    }

    model.VBOBuildString = vboString;
    model.VBOBuildTime.modified();
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {};

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  vtkOpenGLImageResliceMapper.extend(publicAPI, model, initialValues);

  if (initialValues.scalarTexture) {
    model.scalarTextures = [initialValues.scalarTexture];
  } else {
    model.scalarTextures = [];
  }

  model.scalarTextureStrings = [];
  model._scalarTexturesCore = [];

  vtkStreamingOpenGLImageResliceMapper(publicAPI, model);
}

export const newInstance = macro.newInstance(
  extend,
  'vtkStreamingOpenGLImageResliceMapper'
);

export default { newInstance, extend };
