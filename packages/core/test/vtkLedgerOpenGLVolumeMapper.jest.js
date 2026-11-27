import { describe, it, expect, jest } from '@jest/globals';

const mockSuperDraw = jest.fn();

jest.mock('@kitware/vtk.js/Rendering/OpenGL/VolumeMapper', () => ({
  __esModule: true,
  default: {
    extend: (publicAPI, model) => {
      model.classHierarchy = ['vtkOpenGLVolumeMapper'];
      publicAPI.renderPieceDraw = mockSuperDraw;
    },
  },
}));
jest.mock('../src/utilities/gpuAllocationTracker', () => ({
  noteTextureRendered: jest.fn(),
}));

import { extend } from '../src/RenderingEngine/vtkClasses/vtkLedgerOpenGLVolumeMapper';
import { noteTextureRendered } from '../src/utilities/gpuAllocationTracker';

describe('the OpenGL mapper of a plain volume mapper', () => {
  it('reports each draw with its volume mapper, which owns the allocation', () => {
    const publicAPI = {};
    const renderable = {};
    const model = { context: { gl: true }, renderable };

    extend(publicAPI, model);
    publicAPI.renderPieceDraw('renderer', 'actor');

    expect(mockSuperDraw).toHaveBeenCalledWith('renderer', 'actor');
    expect(noteTextureRendered).toHaveBeenCalledWith(model.context, [
      renderable,
    ]);
  });
});
