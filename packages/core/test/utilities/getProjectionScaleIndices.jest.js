import { vec3 } from 'gl-matrix';
import { getProjectionScaleIndices } from '../../src/RenderingEngine/helpers/getProjectionScaleIndices';
import { describe, it, expect } from '@jest/globals';

describe('getProjectionScaleIndices', () => {
  const EPS = 1e-6;

  test('axial view vpn [0, 0, 1]  stretch in Anterior-Posterior', () => {
    const viewUp = vec3.fromValues(0, -1, 0);
    const vpn = vec3.fromValues(0, 0, 1);

    const { idxX, idxY } = getProjectionScaleIndices(viewUp, vpn);

    // Expect vertical scaling to map to Y (matrix[5])
    expect(idxX).toBe(0);
    expect(idxY).toBe(5);
  });

  test('sagittal view vpn [1, 0, 0] Superior-Inferior', () => {
    const viewUp = vec3.fromValues(0, 0, -1);
    const vpn = vec3.fromValues(1, 0, 0);

    const { idxX, idxY } = getProjectionScaleIndices(viewUp, vpn);

    // Stretch in Z means likely vertical scale should flip
    expect([0, 5]).toContain(idxX);
    expect([0, 5]).toContain(idxY);
    expect(idxX).not.toBe(idxY);
  });

  test('coronal view vpn [0, 1, 0] Superior-Inferior', () => {
    const viewUp = vec3.fromValues(0, 0, -1);
    const vpn = vec3.fromValues(0, 1, 0);

    const { idxX, idxY } = getProjectionScaleIndices(viewUp, vpn);

    expect([0, 5]).toContain(idxX);
    expect([0, 5]).toContain(idxY);
    expect(idxX).not.toBe(idxY);
  });

  test('oblique vpn halfway between axial and sagittal', () => {
    const vpn = vec3.normalize(vec3.create(), vec3.fromValues(0.707, 0, 0.707));
    const viewUp = vec3.fromValues(0, -1, 0);

    const { idxX, idxY } = getProjectionScaleIndices(viewUp, vpn);

    // Should still return valid diagonal indices
    expect([0, 5]).toContain(idxX);
    expect([0, 5]).toContain(idxY);
    expect(idxX).not.toBe(idxY);
  });
});
