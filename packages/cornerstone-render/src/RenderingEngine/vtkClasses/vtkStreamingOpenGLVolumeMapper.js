import { mat3, mat4, vec3 } from 'gl-matrix'
import isEqual from 'lodash.isequal'
import macro from 'vtk.js/Sources/macro'
import vtkOpenGLVolumeMapper from 'vtk.js/Sources/Rendering/OpenGL/VolumeMapper'
import { Filter } from 'vtk.js/Sources/Rendering/OpenGL/Texture/Constants'
import { VtkDataTypes } from 'vtk.js/Sources/Common/Core/DataArray/Constants'
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray'
import { Representation } from 'vtk.js/Sources/Rendering/Core/Property/Constants'
import { BlendMode } from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants'

const { vtkWarningMacro } = macro
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
  model.classHierarchy.push('vtkStreamingOpenGLVolumeMapper')

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
    const image = model.currentInput

    if (image === null) {
      return
    }

    const vprop = actor.getProperty()

    if (!model.jitterTexture.getHandle()) {
      const oTable = new Uint8Array(32 * 32)
      for (let i = 0; i < 32 * 32; ++i) {
        oTable[i] = 255.0 * Math.random()
      }
      model.jitterTexture.setMinificationFilter(Filter.LINEAR)
      model.jitterTexture.setMagnificationFilter(Filter.LINEAR)
      model.jitterTexture.create2DFromRaw(
        32,
        32,
        1,
        VtkDataTypes.UNSIGNED_CHAR,
        oTable
      )
    }

    const numComp = image.getPointData().getScalars().getNumberOfComponents()
    const iComps = vprop.getIndependentComponents()
    const numIComps = iComps ? numComp : 1

    // rebuild opacity tfun?
    let toString = `${vprop.getMTime()}`
    if (model.opacityTextureString !== toString) {
      const oWidth = 1024
      const oSize = oWidth * 2 * numIComps
      const ofTable = new Float32Array(oSize)
      const tmpTable = new Float32Array(oWidth)

      for (let c = 0; c < numIComps; ++c) {
        const ofun = vprop.getScalarOpacity(c)
        const opacityFactor =
          model.renderable.getSampleDistance() /
          vprop.getScalarOpacityUnitDistance(c)

        const oRange = ofun.getRange()
        ofun.getTable(oRange[0], oRange[1], oWidth, tmpTable, 1)
        // adjust for sample distance etc
        for (let i = 0; i < oWidth; ++i) {
          ofTable[c * oWidth * 2 + i] =
            1.0 - (1.0 - tmpTable[i]) ** opacityFactor
          ofTable[c * oWidth * 2 + i + oWidth] = ofTable[c * oWidth * 2 + i]
        }
      }

      model.opacityTexture.releaseGraphicsResources(model.openGLRenderWindow)
      model.opacityTexture.setMinificationFilter(Filter.LINEAR)
      model.opacityTexture.setMagnificationFilter(Filter.LINEAR)

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
        )
      } else {
        const oTable = new Uint8Array(oSize)
        for (let i = 0; i < oSize; ++i) {
          oTable[i] = 255.0 * ofTable[i]
        }
        model.opacityTexture.create2DFromRaw(
          oWidth,
          2 * numIComps,
          1,
          VtkDataTypes.UNSIGNED_CHAR,
          oTable
        )
      }
      model.opacityTextureString = toString
    }

    // rebuild color tfun?
    toString = `${vprop.getMTime()}`

    if (model.colorTextureString !== toString) {
      const cWidth = 1024
      const cSize = cWidth * 2 * numIComps * 3
      const cTable = new Uint8Array(cSize)
      const tmpTable = new Float32Array(cWidth * 3)

      for (let c = 0; c < numIComps; ++c) {
        const cfun = vprop.getRGBTransferFunction(c)
        const cRange = cfun.getRange()
        cfun.getTable(cRange[0], cRange[1], cWidth, tmpTable, 1)
        for (let i = 0; i < cWidth * 3; ++i) {
          cTable[c * cWidth * 6 + i] = 255.0 * tmpTable[i]
          cTable[c * cWidth * 6 + i + cWidth * 3] = 255.0 * tmpTable[i]
        }
      }

      model.colorTexture.releaseGraphicsResources(model.openGLRenderWindow)
      model.colorTexture.setMinificationFilter(Filter.LINEAR)
      model.colorTexture.setMagnificationFilter(Filter.LINEAR)

      model.colorTexture.create2DFromRaw(
        cWidth,
        2 * numIComps,
        3,
        VtkDataTypes.UNSIGNED_CHAR,
        cTable
      )
      model.colorTextureString = toString
    }

    // rebuild the scalarTexture if the data has changed
    toString = `${image.getMTime()}`

    if (model.scalarTextureString !== toString) {
      // Build the textures
      const dims = image.getDimensions()

      const previousTextureParameters =
        model.scalarTexture.getTextureParameters()

      const dataType = image.getPointData().getScalars().getDataType()
      const data = image.getPointData().getScalars().getData()

      let shouldReset = true

      if (
        previousTextureParameters.dataType &&
        previousTextureParameters.dataType === dataType
      ) {
        const previousTextureSize =
          previousTextureParameters.width *
          previousTextureParameters.height *
          previousTextureParameters.depth *
          previousTextureParameters.numComps
        if (data.length === previousTextureSize) {
          shouldReset = false
        }
      }

      if (shouldReset) {
        model.scalarTexture.releaseGraphicsResources(model.openGLRenderWindow)
        model.scalarTexture.resetFormatAndType()

        model.scalarTexture.create3DFilterableFromRaw(
          dims[0],
          dims[1],
          dims[2],
          numComp,
          dataType,
          data
        )
      } else {
        model.scalarTexture.deactivate()
        model.scalarTexture.update3DFromRaw(data)
      }

      model.scalarTextureString = toString
    }

    if (!model.tris.getCABO().getElementCount()) {
      // build the CABO
      const ptsArray = new Float32Array(12)
      for (let i = 0; i < 4; i++) {
        ptsArray[i * 3] = (i % 2) * 2 - 1.0
        ptsArray[i * 3 + 1] = i > 1 ? 1.0 : -1.0
        ptsArray[i * 3 + 2] = -1.0
      }

      const cellArray = new Uint16Array(8)
      cellArray[0] = 3
      cellArray[1] = 0
      cellArray[2] = 1
      cellArray[3] = 3
      cellArray[4] = 3
      cellArray[5] = 0
      cellArray[6] = 3
      cellArray[7] = 2

      const points = vtkDataArray.newInstance({
        numberOfComponents: 3,
        values: ptsArray,
      })
      points.setName('points')
      const cells = vtkDataArray.newInstance({
        numberOfComponents: 1,
        values: cellArray,
      })
      model.tris.getCABO().createVBO(cells, 'polys', Representation.SURFACE, {
        points,
        cellOffset: 0,
      })
    }

    model.VBOBuildTime.modified()
  }

  publicAPI.setCameraShaderParameters = (cellBO, ren, actor) => {
    const program = cellBO.getProgram()
    const cam = model.openGLCamera.getRenderable()
    const blendMode = actor.getMapper().getBlendMode()
    const slabThickness = cam.getSlabThickness()
    const crange = cam.getClippingRange()

    const defaultSlabThickness = null
    const cameraMidpoint = (crange[1] + crange[0]) * 0.5
    // if not equal to tiny slab thickness (i.e. it is defined as an actual
    // intended value), use slab thickness instead of clipping range
    if (
      blendMode !== BlendMode.COMPOSITE_BLEND &&
      slabThickness !== defaultSlabThickness
    ) {
      crange[0] = cameraMidpoint - slabThickness
      crange[1] = cameraMidpoint + slabThickness
      cam.setSlabThicknessActive(true)
    } else {
      cam.setSlabThicknessActive(false)
    }

    program.setUniformf('camThick', crange[1] - crange[0])
    program.setUniformf('camNear', crange[0])
    program.setUniformf('camFar', crange[1])

    // // [WMVP]C == {world, model, view, projection} coordinates
    // // E.g., WCPC == world to projection coordinate transformation
    const keyMats = model.openGLCamera.getKeyMatrices(ren)
    const actMats = model.openGLVolume.getKeyMatrices()
    mat4.multiply(model.modelToView, keyMats.wcvc, actMats.mcwc)

    const bounds = model.currentInput.getBounds()
    const spc = model.currentInput.getSpacing()
    const dims = model.currentInput.getDimensions()

    // TODO: need a better name because this is not physical?
    // TODO: this should probably use extent, not bounds?
    const physicalBounds = [...bounds]
    physicalBounds[0] -= 0.5 * spc[0]
    physicalBounds[1] += 0.5 * spc[0]
    physicalBounds[2] -= 0.5 * spc[1]
    physicalBounds[3] += 0.5 * spc[1]
    physicalBounds[4] -= 0.5 * spc[2]
    physicalBounds[5] += 0.5 * spc[2]

    // compute the viewport bounds of the volume
    // we will only render those fragments.
    const pos = new Float64Array(3)
    const dir = new Float64Array(3)
    let dcxmin = 1.0
    let dcxmax = -1.0
    let dcymin = 1.0
    let dcymax = -1.0

    for (let i = 0; i < 8; ++i) {
      vec3.set(
        pos,
        physicalBounds[i % 2],
        physicalBounds[2 + (Math.floor(i / 2) % 2)],
        physicalBounds[4 + Math.floor(i / 4)]
      )
      vec3.transformMat4(pos, pos, model.modelToView)
      if (!cam.getParallelProjection()) {
        vec3.normalize(dir, pos)

        // now find the projection of this point onto a
        // nearZ distance plane. Since the camera is at 0,0,0
        // in VC the ray is just t*pos and
        // t is -nearZ/dir.z
        // intersection becomes pos.x/pos.z
        const t = -crange[0] / pos[2]
        vec3.scale(pos, dir, t)
      }
      // now convert to DC
      vec3.transformMat4(pos, pos, keyMats.vcpc)

      dcxmin = Math.min(pos[0], dcxmin)
      dcxmax = Math.max(pos[0], dcxmax)
      dcymin = Math.min(pos[1], dcymin)
      dcymax = Math.max(pos[1], dcymax)
    }

    program.setUniformf('dcxmin', dcxmin)
    program.setUniformf('dcxmax', dcxmax)
    program.setUniformf('dcymin', dcymin)
    program.setUniformf('dcymax', dcymax)

    if (program.isUniformUsed('cameraParallel')) {
      program.setUniformi('cameraParallel', cam.getParallelProjection())
    }

    const ext = model.currentInput.getExtent()
    const vsize = new Float64Array(3)
    vec3.set(
      vsize,
      (ext[1] - ext[0] + 1) * spc[0],
      (ext[3] - ext[2] + 1) * spc[1],
      (ext[5] - ext[4] + 1) * spc[2]
    )
    program.setUniform3f('vSpacing', spc[0], spc[1], spc[2])

    vec3.set(pos, ext[0], ext[2], ext[4])

    model.currentInput.indexToWorldVec3(pos, pos)

    vec3.transformMat4(pos, pos, model.modelToView)

    program.setUniform3f('vOriginVC', pos[0], pos[1], pos[2])

    vec3.set(pos, ext[0] + 0.5, ext[2] + 0.5, ext[4] + 0.5)
    model.currentInput.indexToWorldVec3(pos, pos)

    vec3.transformMat4(pos, pos, model.modelToView)
    program.setUniform3f('vOriginPlusHalfVoxelVC', pos[0], pos[1], pos[2])

    // apply the image directions
    const i2wmat4 = model.currentInput.getIndexToWorld()
    mat4.multiply(model.idxToView, model.modelToView, i2wmat4)

    mat3.multiply(
      model.idxNormalMatrix,
      keyMats.normalMatrix,
      actMats.normalMatrix
    )
    mat3.multiply(
      model.idxNormalMatrix,
      model.idxNormalMatrix,
      model.currentInput.getDirection()
    )

    const maxSamples = vec3.length(vsize) / model.renderable.getSampleDistance()
    if (maxSamples > model.renderable.getMaximumSamplesPerRay()) {
      vtkWarningMacro(`The number of steps required ${Math.ceil(
        maxSamples
      )} is larger than the
        specified maximum number of steps ${model.renderable.getMaximumSamplesPerRay()}.
        Please either change the
        volumeMapper sampleDistance or its maximum number of samples.`)
    }

    const vctoijk = new Float64Array(3)

    vec3.set(vctoijk, 1.0, 1.0, 1.0)
    vec3.divide(vctoijk, vctoijk, vsize)
    program.setUniform3f('vVCToIJK', vctoijk[0], vctoijk[1], vctoijk[2])
    program.setUniform3i('volumeDimensions', dims[0], dims[1], dims[2])

    if (!model.openGLRenderWindow.getWebgl2()) {
      const volInfo = model.scalarTexture.getVolumeInfo()
      program.setUniformf('texWidth', model.scalarTexture.getWidth())
      program.setUniformf('texHeight', model.scalarTexture.getHeight())
      program.setUniformi('xreps', volInfo.xreps)
      program.setUniformi('xstride', volInfo.xstride)
      program.setUniformi('ystride', volInfo.ystride)
    }

    // map normals through normal matrix
    // then use a point on the plane to compute the distance
    const normal = new Float64Array(3)
    const pos2 = new Float64Array(3)
    for (let i = 0; i < 6; ++i) {
      switch (i) {
        default:
        case 0:
          vec3.set(normal, 1.0, 0.0, 0.0)
          vec3.set(pos2, ext[1] + 0.5, ext[3] + 0.5, ext[5] + 0.5)
          break
        case 1:
          vec3.set(normal, -1.0, 0.0, 0.0)
          vec3.set(pos2, ext[0] - 0.5, ext[2] - 0.5, ext[4] - 0.5)
          break
        case 2:
          vec3.set(normal, 0.0, 1.0, 0.0)
          vec3.set(pos2, ext[1] + 0.5, ext[3] + 0.5, ext[5] + 0.5)
          break
        case 3:
          vec3.set(normal, 0.0, -1.0, 0.0)
          vec3.set(pos2, ext[0] - 0.5, ext[2] - 0.5, ext[4] - 0.5)
          break
        case 4:
          vec3.set(normal, 0.0, 0.0, 1.0)
          vec3.set(pos2, ext[1] + 0.5, ext[3] + 0.5, ext[5] + 0.5)
          break
        case 5:
          vec3.set(normal, 0.0, 0.0, -1.0)
          vec3.set(pos2, ext[0] - 0.5, ext[2] - 0.5, ext[4] - 0.5)
          break
      }
      vec3.transformMat3(normal, normal, model.idxNormalMatrix)
      vec3.transformMat4(pos2, pos2, model.idxToView)
      const dist = -1.0 * vec3.dot(pos2, normal)

      // we have the plane in view coordinates
      // specify the planes in view coordinates
      program.setUniform3f(`vPlaneNormal${i}`, normal[0], normal[1], normal[2])
      program.setUniformf(`vPlaneDistance${i}`, dist)

      if (actor.getProperty().getUseLabelOutline()) {
        const image = model.currentInput
        const worldToIndex = image.getWorldToIndex()

        program.setUniformMatrix('vWCtoIDX', worldToIndex)

        // Get the projection coordinate to world coordinate transformation matrix.
        mat4.invert(model.projectionToWorld, keyMats.wcpc)
        program.setUniformMatrix('PCWCMatrix', model.projectionToWorld)

        const size = publicAPI.getRenderTargetSize()
        const offset = publicAPI.getRenderTargetOffset()

        program.setUniformf('vpWidth', size[0])
        program.setUniformf('vpHeight', size[1])

        // TODO: You need to use the fix/labelMapOutline branch or these
        // won't be consumed by the shader
        program.setUniformf('vpOffsetX', offset[0] / size[0])
        program.setUniformf('vpOffsetY', offset[1] / size[1])
      }
    }

    mat4.invert(model.projectionToView, keyMats.vcpc)
    program.setUniformMatrix('PCVCMatrix', model.projectionToView)

    // handle lighting values
    switch (model.lastLightComplexity) {
      default:
      case 0: // no lighting, tcolor is fine as is
        break

      case 1: // headlight
      case 2: // light kit
      case 3: {
        // positional not implemented fallback to directional
        // mat3.transpose(keyMats.normalMatrix, keyMats.normalMatrix);
        let lightNum = 0
        const lightColor = []
        ren.getLights().forEach((light) => {
          const status = light.getSwitch()
          if (status > 0) {
            const dColor = light.getColor()
            const intensity = light.getIntensity()
            lightColor[0] = dColor[0] * intensity
            lightColor[1] = dColor[1] * intensity
            lightColor[2] = dColor[2] * intensity
            program.setUniform3fArray(`lightColor${lightNum}`, lightColor)
            const ldir = light.getDirection()
            vec3.set(normal, ldir[0], ldir[1], ldir[2])
            vec3.transformMat3(normal, normal, keyMats.normalMatrix)
            program.setUniform3f(
              `lightDirectionVC${lightNum}`,
              normal[0],
              normal[1],
              normal[2]
            )
            // camera DOP is 0,0,-1.0 in VC
            const halfAngle = [
              -0.5 * normal[0],
              -0.5 * normal[1],
              -0.5 * (normal[2] - 1.0),
            ]
            program.setUniform3fArray(`lightHalfAngleVC${lightNum}`, halfAngle)
            lightNum++
          }
        })
        // mat3.transpose(keyMats.normalMatrix, keyMats.normalMatrix);
      }
    }
  }

  publicAPI.getRenderTargetSize = () => {
    // https://github.com/Kitware/vtk-js/blob/master/Sources/Rendering/OpenGL/VolumeMapper/index.js#L952
    if (model.lastXYF > 1.43) {
      const sz = model.framebuffer.getSize()
      return [model.fvp[0] * sz[0], model.fvp[1] * sz[1]]
    }

    // This seems wrong, it assumes the renderWindow only has one renderer
    // but I don't know if this stuff is correct...
    // return model.openGLRenderWindow.getFramebufferSize();

    const { usize, vsize } = model.openGLRenderer.getTiledSizeAndOrigin()

    return [usize, vsize]
  }

  publicAPI.getRenderTargetOffset = () => {
    const { lowerLeftU, lowerLeftV } =
      model.openGLRenderer.getTiledSizeAndOrigin()

    return [lowerLeftU, lowerLeftV]
  }
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {}

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues)

  vtkOpenGLVolumeMapper.extend(publicAPI, model, initialValues)

  model.scalarTexture = initialValues.scalarTexture
  model.previousState = {}

  // Object methods
  vtkStreamingOpenGLVolumeMapper(publicAPI, model)
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(
  extend,
  'vtkStreamingOpenGLVolumeMapper'
)

// ----------------------------------------------------------------------------

export default { newInstance, extend }
