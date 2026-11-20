import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkVolumeFS from '@kitware/vtk.js/Rendering/OpenGL/glsl/vtkVolumeFS.glsl';
import vtkPolyDataFS from '@kitware/vtk.js/Rendering/OpenGL/glsl/vtkPolyDataFS.glsl';
import type { Types } from '@cornerstonejs/core';
import {
  getViewCropPlanes,
  setCropClippingPlanes,
} from './setCropClippingPlanes';
import type { ClippingPlane } from './types';

const plane = (origin: number[], normal: number[]): ClippingPlane => ({
  origin: origin as Types.Point3,
  normal: normal as Types.Point3,
});

// Unit box crop planes [XMIN, XMAX, YMIN, YMAX, ZMIN, ZMAX], normals point inward.
const box = [
  plane([0, 0, 0], [1, 0, 0]),
  plane([1, 0, 0], [-1, 0, 0]),
  plane([0, 0, 0], [0, 1, 0]),
  plane([0, 1, 0], [0, -1, 0]),
  plane([0, 0, 0], [0, 0, 1]),
  plane([0, 0, 1], [0, 0, -1]),
];

const unescapeRegExp = (text: string) => text.replace(/\\(.)/g, '$1');

describe('getViewCropPlanes', () => {
  it('splits off the plane pair that is parallel to the view', () => {
    expect(getViewCropPlanes(box, [0, 0, 1])).toEqual({
      inPlane: box.slice(0, 4),
      depth: box.slice(4, 6),
    });
    expect(getViewCropPlanes(box, [1, 0, 0]).inPlane).toEqual(box.slice(2, 6));
    // A tilted view uses the pair that is closest to the view normal as depth.
    expect(getViewCropPlanes(box, [0.2, 0.9, 0.3]).depth).toEqual(
      box.slice(2, 4)
    );
  });
});

describe('setCropClippingPlanes', () => {
  it('keeps the slab planes, inverts the crop planes, and restores the mapper', () => {
    const mapper = vtkVolumeMapper.newInstance();
    const actor = vtkVolume.newInstance();
    actor.setMapper(mapper);
    const slab = [vtkPlane.newInstance(), vtkPlane.newInstance()];
    slab.forEach((p) => mapper.addClippingPlane(p));
    const foreign = { shaderType: 'Fragment', originalValue: 'x' };
    mapper.setViewSpecificProperties({
      OpenGL: { ShaderReplacements: [foreign] },
    });
    const { inPlane } = getViewCropPlanes(box, [0, 0, 1]);

    setCropClippingPlanes(actor, inPlane, { keepCount: 2, invert: true });
    const planes = mapper.getClippingPlanes();
    expect(planes.length).toBe(6);
    expect(planes.slice(0, 2)).toEqual(slab);
    expect(planes[3].getOrigin()).toEqual([1, 0, 0]);
    const [kept, ...replacements] =
      mapper.getViewSpecificProperties().OpenGL.ShaderReplacements;
    expect(kept).toBe(foreign);
    expect(replacements.length).toBe(3);
    // Each anchor must exist in the installed vtk.js shader template.
    replacements.forEach(({ originalValue }) =>
      expect(vtkVolumeFS).toContain(unescapeRegExp(originalValue))
    );

    setCropClippingPlanes(actor, null, { keepCount: 2 });
    expect(mapper.getClippingPlanes()).toEqual(slab);
    expect(
      mapper.getViewSpecificProperties().OpenGL.ShaderReplacements
    ).toEqual([foreign]);
  });

  it('moves the crop planes back after a camera slab update rewrites planes 0 and 1', () => {
    const mapper = vtkMapper.newInstance();
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    setCropClippingPlanes(actor, box, { invert: true });
    const replacements =
      mapper.getViewSpecificProperties().OpenGL.ShaderReplacements;
    replacements.forEach(({ originalValue }) =>
      expect(vtkPolyDataFS).toContain(originalValue)
    );
    mapper.getClippingPlanes()[0].setNormal(0, 1, 0);

    setCropClippingPlanes(actor, box, { invert: true });
    expect(mapper.getClippingPlanes()[0].getNormal()).toEqual([1, 0, 0]);
    // In place: the shader replacements stay the same object (no rebuild).
    expect(mapper.getViewSpecificProperties().OpenGL.ShaderReplacements).toBe(
      replacements
    );
  });
});
