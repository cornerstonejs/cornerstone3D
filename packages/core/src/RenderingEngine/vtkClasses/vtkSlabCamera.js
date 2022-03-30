import macro from '@kitware/vtk.js/macros'
import vtkCamera from '@kitware/vtk.js/Rendering/Core/Camera'
import { vec3, mat4 } from 'gl-matrix'
import vtkMath from '@kitware/vtk.js/Common/Core/Math'

/**
 * vtkSlabCamera - A dervied class of the core vtkCamera class
 *
 * This class adds a slabThickness parameter. The difference between this and
 * the regular thickness parameter is that the set method will not modify the
 * vtk camera range parameters.
 *
 * NOTE1: there is a 1:1 correspondence between a camera and a viewport.
 *
 * NOTE2: while the thickness is a property unique to the viewport/camera, the
 * blendMode is a property of a volume (which can be shared over multiple viewports)
 * and one viewport can have multiple volumes.
 *
 * NOTE3: In the case of thickness > 0.1, this customization is needed to
 * distinguish cases different BlendMode in the mapper shader. In fact, the same
 * shader is called over multiple volumes which can have different blend modes.
 * For example, if the blend mode is different from COMPOSITE and we
 * are rendering thin layers, the camera parameters in the shaders are derived
 * from the new slabThickness (which does not affect the vtk camera
 * clipping/range parameters).
 *
 *
 * @param {*} publicAPI The public API to extend
 * @param {*} model The private model to extend.
 */
function vtkSlabCamera(publicAPI, model) {
  model.classHierarchy.push('vtkSlabCamera')

  const tmpMatrix = mat4.create()

  /**
   * getProjectionMatrix - A fork of vtkCamera's getProjectionMatrix method.
   * This fork performs most of the same actions, but if slabThicknessActive is
   * true, then it uses the value of slabThickness for calculating the actual
   * clipping range for the Z-buffer values that map to the near and far
   * clipping planes.
   */
  publicAPI.getProjectionMatrix = (aspect, nearz, farz) => {
    const result = mat4.create()

    if (model.projectionMatrix) {
      const scale = 1 / model.physicalScale
      vec3.set(tmpvec1, scale, scale, scale)

      mat4.copy(result, model.projectionMatrix)
      mat4.scale(result, result, tmpvec1)
      mat4.transpose(result, result)
      return result
    }

    mat4.identity(tmpMatrix)

    let cRange0 = model.clippingRange[0]
    let cRange1 = model.clippingRange[1]

    if (model.slabThicknessActive) {
      const cameraMidpoint =
        (model.clippingRange[1] + model.clippingRange[0]) * 0.5
      cRange0 = cameraMidpoint - model.slabThickness
      cRange1 = cameraMidpoint + model.slabThickness
    }

    const cWidth = cRange1 - cRange0
    const cRange = [
      cRange0 + ((nearz + 1) * cWidth) / 2.0,
      cRange0 + ((farz + 1) * cWidth) / 2.0,
    ]

    if (model.parallelProjection) {
      // set up a rectangular parallelipiped
      const width = model.parallelScale * aspect
      const height = model.parallelScale

      const xmin = (model.windowCenter[0] - 1.0) * width
      const xmax = (model.windowCenter[0] + 1.0) * width
      const ymin = (model.windowCenter[1] - 1.0) * height
      const ymax = (model.windowCenter[1] + 1.0) * height

      mat4.ortho(tmpMatrix, xmin, xmax, ymin, ymax, cRange[0], cRange[1])
      mat4.transpose(tmpMatrix, tmpMatrix)
    } else if (model.useOffAxisProjection) {
      throw new Error('Off-Axis projection is not supported at this time')
    } else {
      const tmp = Math.tan(vtkMath.radiansFromDegrees(model.viewAngle) / 2.0)
      let width
      let height
      if (model.useHorizontalViewAngle === true) {
        width = cRange0 * tmp
        height = (cRange0 * tmp) / aspect
      } else {
        width = cRange0 * tmp * aspect
        height = cRange0 * tmp
      }

      const xmin = (model.windowCenter[0] - 1.0) * width
      const xmax = (model.windowCenter[0] + 1.0) * width
      const ymin = (model.windowCenter[1] - 1.0) * height
      const ymax = (model.windowCenter[1] + 1.0) * height
      const znear = cRange[0]
      const zfar = cRange[1]

      tmpMatrix[0] = (2.0 * znear) / (xmax - xmin)
      tmpMatrix[5] = (2.0 * znear) / (ymax - ymin)
      tmpMatrix[2] = (xmin + xmax) / (xmax - xmin)
      tmpMatrix[6] = (ymin + ymax) / (ymax - ymin)
      tmpMatrix[10] = -(znear + zfar) / (zfar - znear)
      tmpMatrix[14] = -1.0
      tmpMatrix[11] = (-2.0 * znear * zfar) / (zfar - znear)
      tmpMatrix[15] = 0.0
    }

    mat4.copy(result, tmpMatrix)

    return result
  }
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  slabThickness: null,
  slabThicknessActive: false,
}

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues)

  vtkCamera.extend(publicAPI, model, initialValues)

  macro.setGet(publicAPI, model, ['slabThickness', 'slabThicknessActive'])

  // Object methods
  vtkSlabCamera(publicAPI, model)
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend, 'vtkSlabCamera')

// ----------------------------------------------------------------------------

export default { newInstance, extend }
