import macro from '@kitware/vtk.js/macros';
import vtkOpenGLVolumeMapper from '@kitware/vtk.js/Rendering/OpenGL/VolumeMapper';
import { noteTextureRendered } from '../../utilities/gpuAllocationTracker';

/**
 * The OpenGL volume mapper of vtk.js for a plain `vtkVolumeMapper`, for
 * example the mapper that a projection converts to (see
 * `convertMapperToNotSharedMapper`). That mapper uploads its texture inside
 * vtk.js and notes the allocation with itself as the owner, so each draw
 * reports the mapper, and the first draw settles the allocation.
 *
 * @param {object} publicAPI - the public API to extend
 * @param {object} model - the private model to extend
 */
function vtkLedgerOpenGLVolumeMapper(publicAPI, model) {
  model.classHierarchy.push('vtkLedgerOpenGLVolumeMapper');

  const superRenderPieceDraw = publicAPI.renderPieceDraw;

  publicAPI.renderPieceDraw = (ren, actor) => {
    superRenderPieceDraw(ren, actor);
    noteTextureRendered(model.context, [model.renderable]);
  };
}

export function extend(publicAPI, model, initialValues = {}) {
  vtkOpenGLVolumeMapper.extend(publicAPI, model, initialValues);
  vtkLedgerOpenGLVolumeMapper(publicAPI, model);
}

export const newInstance = macro.newInstance(
  extend,
  'vtkLedgerOpenGLVolumeMapper'
);

export default { newInstance, extend };
