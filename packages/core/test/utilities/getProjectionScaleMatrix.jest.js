import { vec3, mat4 } from 'gl-matrix';
import { getProjectionScaleMatrix } from '../../src/RenderingEngine/helpers/getProjectionScaleMatrix';
import { describe, it, expect } from '@jest/globals';

describe('getProjectionScaleMatrix', () => {
  const aspect = [1.0, 2.0]; // scaleX=1, scaleY=2

  it('axial view vpn [0, 0, 1]  stretch in Anterior-Posterior', () => {
    const viewUp = vec3.fromValues(0, -1, 0);
    const vpn = vec3.fromValues(0, 0, 1);
    const matrix = getProjectionScaleMatrix(viewUp, vpn, aspect);

    expect(matrix[0]).toBeCloseTo(1.0);
    expect(matrix[5]).toBeCloseTo(2.0);
  });

  it('sagittal view vpn [1, 0, 0] Superior-Inferior', () => {
    const viewUp = vec3.fromValues(0, 0, 1);
    const vpn = vec3.fromValues(1, 0, 0);
    const matrix = getProjectionScaleMatrix(viewUp, vpn, aspect);

    expect(matrix[0]).toBeCloseTo(1.0);
    expect(matrix[5]).toBeCloseTo(2.0);
  });

  it('coronal view vpn [0, 1, 0] Superior-Inferior', () => {
    const viewUp = vec3.fromValues(0, 0, 1);
    const vpn = vec3.fromValues(0, -1, 0);
    const matrix = getProjectionScaleMatrix(viewUp, vpn, aspect);

    expect(matrix[0]).toBeCloseTo(1.0);
    expect(matrix[5]).toBeCloseTo(2.0);
  });

  it('oblique vpn halfway between axial and sagittal', () => {
    const viewUp = vec3.normalize(vec3.create(), vec3.fromValues(1, 0, 1));
    const vpn = vec3.fromValues(0, 1, 0);
    const matrix = getProjectionScaleMatrix(viewUp, vpn, aspect);

    // 45 deg alignment should interpolate: ~0.707 * 2.0 + 0.293 * 1.0 = 1.707
    expect(matrix[5]).toBeGreaterThan(1.0);
    expect(matrix[5]).toBeLessThan(2.0);
    expect(matrix[5]).toBeCloseTo(1.7071, 4);
  });

  describe('Rotation invariance - stretch follows patient direction', () => {
    it('axial view +90 deg rotation - stretch stays in AP direction', () => {
      const vpn = vec3.fromValues(0, 0, 1);

      const viewUp1 = vec3.fromValues(0, -1, 0);
      const matrix1 = getProjectionScaleMatrix(viewUp1, vpn, aspect);

      const viewUp2 = vec3.fromValues(-1, 0, 0);
      const matrix2 = getProjectionScaleMatrix(viewUp2, vpn, aspect);

      // Scales swap as screen axes rotate, but stretch stays in AP direction
      expect(matrix1[0]).toBeCloseTo(1.0);
      expect(matrix1[5]).toBeCloseTo(2.0);
      expect(matrix2[0]).toBeCloseTo(2.0);
      expect(matrix2[5]).toBeCloseTo(1.0);
    });

    it('axial view -90 deg rotation - stretch stays in AP direction', () => {
      const vpn = vec3.fromValues(0, 0, 1);

      const viewUp1 = vec3.fromValues(0, -1, 0);
      const matrix1 = getProjectionScaleMatrix(viewUp1, vpn, aspect);

      const viewUp2 = vec3.fromValues(1, 0, 0);
      const matrix2 = getProjectionScaleMatrix(viewUp2, vpn, aspect);

      expect(matrix1[0]).toBeCloseTo(1.0);
      expect(matrix1[5]).toBeCloseTo(2.0);
      expect(matrix2[0]).toBeCloseTo(2.0);
      expect(matrix2[5]).toBeCloseTo(1.0);
    });

    it('sagittal view +90 deg rotation - stretch stays in SI direction', () => {
      const vpn = vec3.fromValues(1, 0, 0);

      const viewUp1 = vec3.fromValues(0, 0, 1);
      const matrix1 = getProjectionScaleMatrix(viewUp1, vpn, aspect);

      const viewUp2 = vec3.fromValues(0, -1, 0);
      const matrix2 = getProjectionScaleMatrix(viewUp2, vpn, aspect);

      expect(matrix1[0]).toBeCloseTo(1.0);
      expect(matrix1[5]).toBeCloseTo(2.0);
      expect(matrix2[0]).toBeCloseTo(2.0);
      expect(matrix2[5]).toBeCloseTo(1.0);
    });

    it('coronal view +90 deg rotation - stretch stays in SI direction', () => {
      const vpn = vec3.fromValues(0, -1, 0);

      const viewUp1 = vec3.fromValues(0, 0, 1);
      const matrix1 = getProjectionScaleMatrix(viewUp1, vpn, aspect);

      const viewUp2 = vec3.fromValues(1, 0, 0);
      const matrix2 = getProjectionScaleMatrix(viewUp2, vpn, aspect);

      expect(matrix1[0]).toBeCloseTo(1.0);
      expect(matrix1[5]).toBeCloseTo(2.0);
      expect(matrix2[0]).toBeCloseTo(2.0);
      expect(matrix2[5]).toBeCloseTo(1.0);
    });

    it('oblique view rotation - stretch follows patient anatomy', () => {
      const vpn = vec3.normalize(vec3.create(), vec3.fromValues(1, 1, 0));
      const viewUp1 = vec3.normalize(vec3.create(), vec3.fromValues(0, 0, 1));
      const matrix1 = getProjectionScaleMatrix(viewUp1, vpn, aspect);

      const oldViewRight = vec3.create();
      vec3.cross(oldViewRight, viewUp1, vpn);
      vec3.normalize(oldViewRight, oldViewRight);

      const viewUp2 = vec3.clone(oldViewRight);
      const matrix2 = getProjectionScaleMatrix(viewUp2, vpn, aspect);

      const originalRightScale = matrix1[0];
      const originalUpScale = matrix1[5];

      // After 90 deg rotation, scales should swap
      expect(matrix2[0]).toBeCloseTo(originalUpScale, 4);
      expect(matrix2[5]).toBeCloseTo(originalRightScale, 4);
    });

    it('axial view 180 deg rotation - stretch magnitude unchanged', () => {
      const vpn = vec3.fromValues(0, 0, 1);
      const viewUp1 = vec3.fromValues(0, -1, 0);
      const matrix1 = getProjectionScaleMatrix(viewUp1, vpn, aspect);

      const viewUp2 = vec3.fromValues(0, 1, 0);
      const matrix2 = getProjectionScaleMatrix(viewUp2, vpn, aspect);

      expect(Math.abs(matrix1[0])).toBeCloseTo(Math.abs(matrix2[0]), 4);
      expect(Math.abs(matrix1[5])).toBeCloseTo(Math.abs(matrix2[5]), 4);
      expect(matrix2[0]).toBeCloseTo(1.0);
      expect(matrix2[5]).toBeCloseTo(2.0);
    });

    it('continuous rotation 0 to 360 degrees - smooth scale transition', () => {
      const vpn = vec3.fromValues(0, 0, 1);
      const angles = [
        0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360,
      ];

      const matrices = angles.map((angleDeg) => {
        const angleRad = (angleDeg * Math.PI) / 180;
        const viewUp = vec3.fromValues(
          Math.sin(angleRad),
          -Math.cos(angleRad),
          0
        );
        return getProjectionScaleMatrix(viewUp, vpn, aspect);
      });

      // Verify smooth transitions between adjacent angles
      for (let i = 0; i < matrices.length - 1; i++) {
        const diff0 = Math.abs(matrices[i][0] - matrices[i + 1][0]);
        const diff5 = Math.abs(matrices[i][5] - matrices[i + 1][5]);
        expect(diff0).toBeLessThanOrEqual(0.6);
        expect(diff5).toBeLessThanOrEqual(0.6);
      }

      // Full circle should return to start
      expect(matrices[0][0]).toBeCloseTo(matrices[matrices.length - 1][0], 4);
      expect(matrices[0][5]).toBeCloseTo(matrices[matrices.length - 1][5], 4);

      // Verify 90 deg interval pattern
      expect(matrices[0][5]).toBeCloseTo(2.0, 4);
      expect(matrices[3][0]).toBeCloseTo(2.0, 4);
      expect(matrices[6][5]).toBeCloseTo(2.0, 4);
      expect(matrices[9][0]).toBeCloseTo(2.0, 4);
    });
  });
});
