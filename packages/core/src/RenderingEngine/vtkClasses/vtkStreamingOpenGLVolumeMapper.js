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

  publicAPI.setCameraShaderParameters = (cellBO, ren, actor) => {
    const program = cellBO.getProgram();
    const cam = model.openGLCamera.getRenderable();
    const crange = cam.getClippingRange();
    // NOTE: the actual slab thickness clipping is done with clipping planes,
    // but here we still need to set the cam uniform to the clipping range.

    program.setUniformf('camThick', crange[1] - crange[0]);
    program.setUniformf('camNear', crange[0]);
    program.setUniformf('camFar', crange[1]);

    // // [WMVP]C == {world, model, view, projection} coordinates
    // // E.g., WCPC == world to projection coordinate transformation
    const keyMats = model.openGLCamera.getKeyMatrices(ren);
    const actMats = model.openGLVolume.getKeyMatrices();
    mat4.multiply(model.modelToView, keyMats.wcvc, actMats.mcwc);

    const bounds = model.currentInput.getBounds();
    const spc = model.currentInput.getSpacing();
    const dims = model.currentInput.getDimensions();

    // compute the viewport bounds of the volume
    // we will only render those fragments.
    const pos = new Float64Array(3);
    const dir = new Float64Array(3);
    let dcxmin = 1.0;
    let dcxmax = -1.0;
    let dcymin = 1.0;
    let dcymax = -1.0;

    for (let i = 0; i < 8; ++i) {
      vec3.set(
        pos,
        bounds[i % 2],
        bounds[2 + (Math.floor(i / 2) % 2)],
        bounds[4 + Math.floor(i / 4)]
      );
      vec3.transformMat4(pos, pos, model.modelToView);
      if (!cam.getParallelProjection()) {
        vec3.normalize(dir, pos);

        // now find the projection of this point onto a
        // nearZ distance plane. Since the camera is at 0,0,0
        // in VC the ray is just t*pos and
        // t is -nearZ/dir.z
        // intersection becomes pos.x/pos.z
        const t = -crange[0] / pos[2];
        vec3.scale(pos, dir, t);
      }
      // now convert to DC
      vec3.transformMat4(pos, pos, keyMats.vcpc);

      dcxmin = Math.min(pos[0], dcxmin);
      dcxmax = Math.max(pos[0], dcxmax);
      dcymin = Math.min(pos[1], dcymin);
      dcymax = Math.max(pos[1], dcymax);
    }

    program.setUniformf('dcxmin', dcxmin);
    program.setUniformf('dcxmax', dcxmax);
    program.setUniformf('dcymin', dcymin);
    program.setUniformf('dcymax', dcymax);

    if (program.isUniformUsed('cameraParallel')) {
      program.setUniformi('cameraParallel', cam.getParallelProjection());
    }

    const ext = model.currentInput.getSpatialExtent();
    const vsize = new Float64Array(3);
    vec3.set(
      vsize,
      (ext[1] - ext[0]) * spc[0],
      (ext[3] - ext[2]) * spc[1],
      (ext[5] - ext[4]) * spc[2]
    );
    program.setUniform3f('vSpacing', spc[0], spc[1], spc[2]);

    vec3.set(pos, ext[0], ext[2], ext[4]);

    model.currentInput.indexToWorldVec3(pos, pos);

    vec3.transformMat4(pos, pos, model.modelToView);

    program.setUniform3f('vOriginVC', pos[0], pos[1], pos[2]);

    // apply the image directions
    const i2wmat4 = model.currentInput.getIndexToWorld();
    mat4.multiply(model.idxToView, model.modelToView, i2wmat4);

    mat3.multiply(
      model.idxNormalMatrix,
      keyMats.normalMatrix,
      actMats.normalMatrix
    );
    mat3.multiply(
      model.idxNormalMatrix,
      model.idxNormalMatrix,
      model.currentInput.getDirection()
    );

    const maxSamples =
      vec3.length(vsize) / model.renderable.getSampleDistance();
    if (maxSamples > model.renderable.getMaximumSamplesPerRay()) {
      vtkWarningMacro(`The number of steps required ${Math.ceil(
        maxSamples
      )} is larger than the
        specified maximum number of steps ${model.renderable.getMaximumSamplesPerRay()}.
        Please either change the
        volumeMapper sampleDistance or its maximum number of samples.`);
    }

    const vctoijk = new Float64Array(3);

    vec3.set(vctoijk, 1.0, 1.0, 1.0);
    vec3.divide(vctoijk, vctoijk, vsize);
    program.setUniform3f('vVCToIJK', vctoijk[0], vctoijk[1], vctoijk[2]);
    program.setUniform3i('volumeDimensions', dims[0], dims[1], dims[2]);

    if (!model._openGLRenderWindow.getWebgl2()) {
      const volInfo = model.scalarTexture.getVolumeInfo();
      program.setUniformf('texWidth', model.scalarTexture.getWidth());
      program.setUniformf('texHeight', model.scalarTexture.getHeight());
      program.setUniformi('xreps', volInfo.xreps);
      program.setUniformi('xstride', volInfo.xstride);
      program.setUniformi('ystride', volInfo.ystride);
    }

    // map normals through normal matrix
    // then use a point on the plane to compute the distance
    const normal = new Float64Array(3);
    const pos2 = new Float64Array(3);
    for (let i = 0; i < 6; ++i) {
      switch (i) {
        case 1:
          vec3.set(normal, -1.0, 0.0, 0.0);
          vec3.set(pos2, ext[0], ext[2], ext[4]);
          break;
        case 2:
          vec3.set(normal, 0.0, 1.0, 0.0);
          vec3.set(pos2, ext[1], ext[3], ext[5]);
          break;
        case 3:
          vec3.set(normal, 0.0, -1.0, 0.0);
          vec3.set(pos2, ext[0], ext[2], ext[4]);
          break;
        case 4:
          vec3.set(normal, 0.0, 0.0, 1.0);
          vec3.set(pos2, ext[1], ext[3], ext[5]);
          break;
        case 5:
          vec3.set(normal, 0.0, 0.0, -1.0);
          vec3.set(pos2, ext[0], ext[2], ext[4]);
          break;
        case 0:
        default:
          vec3.set(normal, 1.0, 0.0, 0.0);
          vec3.set(pos2, ext[1], ext[3], ext[5]);
          break;
      }
      vec3.transformMat3(normal, normal, model.idxNormalMatrix);
      vec3.transformMat4(pos2, pos2, model.idxToView);
      const dist = -1.0 * vec3.dot(pos2, normal);

      // we have the plane in view coordinates
      // specify the planes in view coordinates
      program.setUniform3f(`vPlaneNormal${i}`, normal[0], normal[1], normal[2]);
      program.setUniformf(`vPlaneDistance${i}`, dist);

      if (actor.getProperty().getUseLabelOutline()) {
        const image = model.currentInput;
        const worldToIndex = image.getWorldToIndex();

        program.setUniformMatrix('vWCtoIDX', worldToIndex);

        const camera = ren.getActiveCamera();
        const [cRange0, cRange1] = camera.getClippingRange();
        const distance = camera.getDistance();

        // set the clipping range to be model.distance and model.distance + 0.1
        // since we use this in the keyMats.wcpc (world to projection) matrix
        // the projection matrix calculation relies on the clipping range to be
        // set correctly. This is done inside the interactorStyleMPRSlice which
        // limits use cases where the interactor style is not used.

        camera.setClippingRange(distance, distance + 0.1);
        const labelOutlineKeyMats = model.openGLCamera.getKeyMatrices(ren);

        // Get the projection coordinate to world coordinate transformation matrix.
        mat4.invert(model.projectionToWorld, labelOutlineKeyMats.wcpc);

        // reset the clipping range since the keyMats are cached
        camera.setClippingRange(cRange0, cRange1);

        // to re compute the matrices for the current camera and cache them
        model.openGLCamera.getKeyMatrices(ren);

        program.setUniformMatrix('PCWCMatrix', model.projectionToWorld);

        const size = publicAPI.getRenderTargetSize();
        program.setUniformf('vpWidth', size[0]);
        program.setUniformf('vpHeight', size[1]);
        const offset = publicAPI.getRenderTargetOffset();
        program.setUniformf('vpOffsetX', offset[0] / size[0]);
        program.setUniformf('vpOffsetY', offset[1] / size[1]);
      }
    }

    mat4.invert(model.projectionToView, keyMats.vcpc);
    program.setUniformMatrix('PCVCMatrix', model.projectionToView);

    switch (model.lastLightComplexity) {
      default:
      case 0: // no lighting, tcolor is fine as is
        break;

      case 1: // headlight
      case 2: // light kit
      case 3: {
        // positional not implemented fallback to directional
        // mat3.transpose(keyMats.normalMatrix, keyMats.normalMatrix);
        let lightNum = 0;
        const lightColor = [];
        ren.getLights().forEach((light) => {
          const status = light.getSwitch();
          if (status > 0) {
            const dColor = light.getColor();
            const intensity = light.getIntensity();
            lightColor[0] = dColor[0] * intensity;
            lightColor[1] = dColor[1] * intensity;
            lightColor[2] = dColor[2] * intensity;
            program.setUniform3fArray(`lightColor${lightNum}`, lightColor);
            const ldir = light.getDirection();
            vec3.set(normal, ldir[0], ldir[1], ldir[2]);
            vec3.transformMat3(normal, normal, keyMats.normalMatrix);
            program.setUniform3f(
              `lightDirectionVC${lightNum}`,
              normal[0],
              normal[1],
              normal[2]
            );
            // camera DOP is 0,0,-1.0 in VC
            const halfAngle = [
              -0.5 * normal[0],
              -0.5 * normal[1],
              -0.5 * (normal[2] - 1.0),
            ];
            program.setUniform3fArray(`lightHalfAngleVC${lightNum}`, halfAngle);
            lightNum++;
          }
        });
        // mat3.transpose(keyMats.normalMatrix, keyMats.normalMatrix);
      }
    }

    let lightNum = 0;
    const lightColor = [];
    const lightDir = [];
    const halfAngle = [];
    ren.getLights().forEach((light) => {
      const status = light.getSwitch();
      if (status > 0) {
        const dColor = light.getColor();
        const intensity = light.getIntensity();
        lightColor[0 + lightNum * 3] = dColor[0] * intensity;
        lightColor[1 + lightNum * 3] = dColor[1] * intensity;
        lightColor[2 + lightNum * 3] = dColor[2] * intensity;
        const ldir = light.getDirection();
        vec3.set(normal, ldir[0], ldir[1], ldir[2]);
        vec3.transformMat3(normal, normal, keyMats.normalMatrix); // in view coordinat
        vec3.normalize(normal, normal);
        lightDir[0 + lightNum * 3] = normal[0];
        lightDir[1 + lightNum * 3] = normal[1];
        lightDir[2 + lightNum * 3] = normal[2];
        // camera DOP is 0,0,-1.0 in VC
        halfAngle[0 + lightNum * 3] = -0.5 * normal[0];
        halfAngle[1 + lightNum * 3] = -0.5 * normal[1];
        halfAngle[2 + lightNum * 3] = -0.5 * (normal[2] - 1.0);
        lightNum++;
      }
    });
    program.setUniformi('twoSidedLighting', ren.getTwoSidedLighting());
    program.setUniformi('lightNum', lightNum);
    program.setUniform3fv('lightColor', lightColor);
    program.setUniform3fv('lightDirectionVC', lightDir);
    program.setUniform3fv('lightHalfAngleVC', halfAngle);

    if (model.lastLightComplexity === 3) {
      lightNum = 0;
      const lightPositionVC = [];
      const lightAttenuation = [];
      const lightConeAngle = [];
      const lightExponent = [];
      const lightPositional = [];
      ren.getLights().forEach((light) => {
        const status = light.getSwitch();
        if (status > 0) {
          const attenuation = light.getAttenuationValues();
          lightAttenuation[0 + lightNum * 3] = attenuation[0];
          lightAttenuation[1 + lightNum * 3] = attenuation[1];
          lightAttenuation[2 + lightNum * 3] = attenuation[2];
          lightExponent[lightNum] = light.getExponent();
          lightConeAngle[lightNum] = light.getConeAngle();
          lightPositional[lightNum] = light.getPositional();
          const lp = light.getTransformedPosition();
          vec3.transformMat4(lp, lp, model.modelToView);
          lightPositionVC[0 + lightNum * 3] = lp[0];
          lightPositionVC[1 + lightNum * 3] = lp[1];
          lightPositionVC[2 + lightNum * 3] = lp[2];
          lightNum += 1;
        }
      });
      program.setUniform3fv('lightPositionVC', lightPositionVC);
      program.setUniform3fv('lightAttenuation', lightAttenuation);
      program.setUniformfv('lightConeAngle', lightConeAngle);
      program.setUniformfv('lightExponent', lightExponent);
      program.setUniformiv('lightPositional', lightPositional);
    }
    if (model.renderable.getVolumetricScatteringBlending() > 0.0) {
      program.setUniformf(
        'giReach',
        model.renderable.getGlobalIlluminationReach()
      );
      program.setUniformf(
        'volumetricScatteringBlending',
        model.renderable.getVolumetricScatteringBlending()
      );
      program.setUniformf(
        'volumeShadowSamplingDistFactor',
        model.renderable.getVolumeShadowSamplingDistFactor()
      );
      program.setUniformf('anisotropy', model.renderable.getAnisotropy());
      program.setUniformf(
        'anisotropy2',
        model.renderable.getAnisotropy() ** 2.0
      );
    }
    if (
      model.renderable.getVolumetricScatteringBlending() === 0.0 &&
      model.renderable.getLocalAmbientOcclusion() &&
      actor.getProperty().getAmbient() > 0.0
    ) {
      const ks = model.renderable.getLAOKernelSize();
      program.setUniformi('kernelSize', ks);
      const kernelSample = [];
      for (let i = 0; i < ks; i++) {
        kernelSample[i * 2] = Math.random() * 0.5;
        kernelSample[i * 2 + 1] = Math.random() * 0.5;
      }
      program.setUniform2fv('kernelSample', kernelSample);
      program.setUniformi(
        'kernelRadius',
        model.renderable.getLAOKernelRadius()
      );
    }
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

    const { usize, vsize } = model.openGLRenderer.getTiledSizeAndOrigin();

    return [usize, vsize];
  };

  publicAPI.getRenderTargetOffset = () => {
    const { lowerLeftU, lowerLeftV } =
      model.openGLRenderer.getTiledSizeAndOrigin();

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
