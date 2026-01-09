import { vec3, mat4 } from 'gl-matrix';
import { getProjectionScaleMatrix } from '../../src/RenderingEngine/helpers/getProjectionScaleMatrix';
import { describe, it, expect } from '@jest/globals';

describe('getProjectionScaleMatrix', () => {
  const aspect = [1.0, 2.0]; // scaleX=1, scaleY=2
  const EPSILON = 1e-6;

  it('axial view vpn [0, 0, 1]  stretch in Anterior-Posterior', () => {
    const viewUp = vec3.fromValues(0, -1, 0); // Anterior-Posterior
    const vpn = vec3.fromValues(0, 0, 1); // Axial
    const matrix = getProjectionScaleMatrix(viewUp, vpn, aspect);

    expect(matrix[0]).toBeCloseTo(1.0); // Right axis is Left-Right (align 0)
    expect(matrix[5]).toBeCloseTo(2.0); // Up axis is AP (align 1)
  });

  it('sagittal view vpn [1, 0, 0] Superior-Inferior', () => {
    const viewUp = vec3.fromValues(0, 0, 1); // Superior (SI axis)
    const vpn = vec3.fromValues(1, 0, 0); // Sagittal

    const matrix = getProjectionScaleMatrix(viewUp, vpn, aspect);

    expect(matrix[0]).toBeCloseTo(1.0); // Right is AP (align 1)
    expect(matrix[5]).toBeCloseTo(2.0); // Up is SI (align 1)
  });

  it('coronal view vpn [0, 1, 0] Superior-Inferior', () => {
    const viewUp = vec3.fromValues(0, 0, 1); // Superior-Inferior
    const vpn = vec3.fromValues(0, -1, 0); // Coronal
    const matrix = getProjectionScaleMatrix(viewUp, vpn, aspect);

    expect(matrix[0]).toBeCloseTo(1.0); // Right axis is Left-Right (align 0)
    expect(matrix[5]).toBeCloseTo(2.0); // Up axis is SI (align 1)
  });

  it('oblique vpn halfway between axial and sagittal', () => {
    // VPN is Axial.
    // We tilt viewUp 45 degrees between Left-Right (X) and Superior-Inferior (Z)
    const viewUp = vec3.normalize(vec3.create(), vec3.fromValues(1, 0, 1));
    const vpn = vec3.fromValues(0, 1, 0);

    const matrix = getProjectionScaleMatrix(viewUp, vpn, aspect);

    // viewUp is 45 deg between X (0) and Z (1), alignment should be ~0.707
    // Interpolation: (0.707 * 2.0) + (0.293 * 1.0) = 1.707
    expect(matrix[5]).toBeGreaterThan(1.0);
    expect(matrix[5]).toBeLessThan(2.0);
    expect(matrix[5]).toBeCloseTo(1.7071, 4);
  });
});
