import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkVolumeFS from '@kitware/vtk.js/Rendering/OpenGL/glsl/vtkVolumeFS.glsl';
import vtkPolyDataFS from '@kitware/vtk.js/Rendering/OpenGL/glsl/vtkPolyDataFS.glsl';
import { vec3 } from 'gl-matrix';
import { utilities, type Types } from '@cornerstonejs/core';
import type { ClippingPlane } from './types';

const log = utilities.logger.toolsLog.getLogger('tools.volumeCropping');

type ClippingMapper = {
  getClippingPlanes?(): vtkPlane[];
  removeAllClippingPlanes(): void;
  addClippingPlane(plane: vtkPlane): void;
  getViewSpecificProperties(): { OpenGL?: { ShaderReplacements?: object[] } };
  setViewSpecificProperties(properties: object): boolean;
  isA(className: string): boolean;
};

type ShaderReplacement = {
  shaderType: string;
  originalValue: string;
  replacementValue: string;
  replaceFirst: boolean;
  replaceAll: boolean;
  // Marks the entries that this module owns, so that other entries stay.
  volumeCrop: true;
};

// Key of the applied crop state for each mapper: '' for normal clipping, or the inverted shader key.
const appliedCrop = new WeakMap<ClippingMapper, string>();
const missingAnchorsWarned = new Set<string>();

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds the vtk.js shader replacements that invert the clipping planes
 * `keepCount..planeCount-1`: the mapper draws only outside the convex region
 * that these planes bound. The planes before `keepCount` clip as usual.
 *
 * vtk.js clips to the intersection of the half-spaces of all planes. The
 * complement of a crop box is not such an intersection, so the plane API alone
 * cannot express it. The replacements reuse the clipping plane uniforms, so a
 * move of the planes needs no shader rebuild. They run before the vtk.js
 * substitutions and replace the clipping hooks of the shader templates, so
 * every anchor is a string of the installed vtk.js template. A missing anchor
 * logs one warning, because vtk.js then silently keeps its normal clipping.
 *
 * - Volume mapper: the ray interval, the gradient samples and the shadow rays
 *   use only the kept planes, and each sample inside the crop region reads as
 *   0 (the transparent background label).
 * - Polydata and image mappers: a fragment inside the crop region is discarded.
 */
function getInvertedClipReplacements(
  isVolume: boolean,
  keepCount: number,
  planeCount: number
): ShaderReplacement[] {
  const pre = {
    shaderType: 'Fragment',
    replaceFirst: true,
    replaceAll: false,
    volumeCrop: true as const,
  };
  const replacements: ShaderReplacement[] = isVolume
    ? [
        {
          ...pre,
          // Same ray interval code as vtk.js, for the kept planes only.
          originalValue: '//VTK::ClipPlane::Impl',
          replacementValue: [
            `for(int i = 0; i < ${keepCount}; i++) {`,
            '  float rayDirRatio = dot(rayDirVC, vClipPlaneNormals[i]);',
            '  float equationResult = dot(vertexVCVSOutput, vClipPlaneNormals[i]) + vClipPlaneDistances[i];',
            '  if (rayDirRatio == 0.0) {',
            '    if (equationResult < 0.0) dists.x = dists.y;',
            '    continue;',
            '  }',
            '  float result = -1.0 * equationResult / rayDirRatio;',
            '  if (rayDirRatio < 0.0) dists.y = min(dists.y, result);',
            '  else dists.x = max(dists.x, result);',
            '}',
          ].join('\n'),
        },
        {
          ...pre,
          replaceAll: true,
          originalValue: 'for (int i = 0; i < clip_numPlanes; ++i) {',
          replacementValue: `for (int i = 0; i < ${keepCount}; ++i) {`,
        },
        {
          ...pre,
          originalValue: 'vec4 getTextureValue(vec3 pos) {',
          // posIStoVC() is declared after getTextureValue(), so its expression is inlined.
          replacementValue: [
            'bool isInsideCropRegion(vec3 posVC) {',
            `  for (int i = ${keepCount}; i < ${planeCount}; i++) {`,
            '    if (dot(posVC - vClipPlaneOrigins[i], vClipPlaneNormals[i]) < 0.0) return false;',
            '  }',
            '  return true;',
            '}',
            'vec4 getTextureValue(vec3 pos) {',
            '  if (isInsideCropRegion(volume.vecISToVCMatrix * pos + volume.originVC)) return vec4(0.0);',
          ].join('\n'),
        },
      ]
    : [
        {
          ...pre,
          originalValue: '//VTK::Clip::Impl',
          replacementValue: [
            `for (int planeNum = 0; planeNum < ${keepCount}; planeNum++) {`,
            '  if (clipDistancesVSOutput[planeNum] < 0.0) discard;',
            '}',
            'bool insideCropRegion = true;',
            `for (int j = ${keepCount}; j < ${planeCount}; j++) {`,
            '  if (clipDistancesVSOutput[j] < 0.0) insideCropRegion = false;',
            '}',
            'if (insideCropRegion) discard;',
          ].join('\n'),
        },
      ];

  const template: string = isVolume ? vtkVolumeFS : vtkPolyDataFS;
  replacements.forEach(({ originalValue }) => {
    if (!template.includes(originalValue)) {
      if (!missingAnchorsWarned.has(originalValue)) {
        missingAnchorsWarned.add(originalValue);
        log.warn(
          `The vtk.js shader has no "${originalValue}": the segmentation is not hidden inside the crop box.`
        );
      }
    }
  });
  // vtk.js reads originalValue as a regular expression when replaceAll is true.
  return replacements.map((r) =>
    r.replaceAll ? { ...r, originalValue: escapeRegExp(r.originalValue) } : r
  );
}

/**
 * Sets crop planes on the mapper of an actor, after the first `keepCount`
 * planes of the mapper (for example the two slab planes of an orthographic
 * viewport). It does nothing when the mapper has fewer than `keepCount` planes
 * or has no clipping planes.
 *
 * With `invert`, the mapper draws only outside the crop region (see
 * {@link getInvertedClipReplacements}); without it, only inside. A `null`
 * planes value removes the crop planes and the shader replacements that this
 * function added, and leaves the kept planes and the shader replacements of
 * other code. It does nothing on a mapper that this function did not change.
 *
 * A call with the same plane count moves the planes in place. Call it again
 * after other code rewrites the planes, for example the camera slab update of
 * a viewport, which rewrites planes 0 and 1.
 *
 * At most 6 planes in total are supported, which is the vtk.js limit.
 */
export function setCropClippingPlanes(
  actor: Types.ActorEntry['actor'],
  planes: ClippingPlane[] | null,
  { keepCount = 0, invert = false } = {}
): void {
  const mapper = actor.getMapper?.() as unknown as ClippingMapper;
  const current = mapper?.getClippingPlanes?.();
  if (
    !current ||
    current.length < keepCount ||
    (!planes && !appliedCrop.has(mapper))
  ) {
    return;
  }
  const crop = planes ?? [];
  const planeCount = keepCount + crop.length;

  if (current.length === planeCount) {
    // Same plane count: move the planes in place, which avoids a shader rebuild.
    crop.forEach(({ origin, normal }, i) => {
      current[keepCount + i].setOrigin(origin);
      current[keepCount + i].setNormal(normal);
    });
  } else {
    const kept = current.slice(0, keepCount);
    mapper.removeAllClippingPlanes();
    kept.forEach((plane) => mapper.addClippingPlane(plane));
    crop.forEach(({ origin, normal }) =>
      mapper.addClippingPlane(
        vtkPlane.newInstance({
          origin: [...origin] as Types.Point3,
          normal: [...normal] as Types.Point3,
        })
      )
    );
  }

  const isVolume = mapper.isA('vtkVolumeMapper');
  const key = planes && invert ? `${isVolume}:${keepCount}:${planeCount}` : '';
  if (appliedCrop.get(mapper) !== key) {
    const properties = mapper.getViewSpecificProperties();
    const others = (properties.OpenGL?.ShaderReplacements ?? []).filter(
      (r) => !(r as ShaderReplacement).volumeCrop
    );
    const ShaderReplacements = key
      ? [
          ...others,
          ...getInvertedClipReplacements(isVolume, keepCount, planeCount),
        ]
      : others;
    const OpenGL: Record<string, unknown> = { ...properties.OpenGL };
    if (ShaderReplacements.length) {
      OpenGL.ShaderReplacements = ShaderReplacements;
    } else {
      delete OpenGL.ShaderReplacements;
    }
    mapper.setViewSpecificProperties({ ...properties, OpenGL });
  }

  if (planes) {
    appliedCrop.set(mapper, key);
  } else {
    appliedCrop.delete(mapper);
  }
}

/**
 * Splits the 6 crop planes for a planar view: `depth` is the plane pair whose
 * normal is closest to the view plane normal, and `inPlane` holds the four
 * other planes, which bound the crop rectangle on the view.
 *
 * @param planes - The 6 crop planes [XMIN, XMAX, YMIN, YMAX, ZMIN, ZMAX]
 * @param viewPlaneNormal - The view plane normal of the planar viewport
 */
export function getViewCropPlanes(
  planes: ClippingPlane[],
  viewPlaneNormal: Types.Point3
): { inPlane: ClippingPlane[]; depth: ClippingPlane[] } {
  let depthPair = 0;
  let maxAlignment = -1;
  for (let pair = 0; pair < 3; pair++) {
    const alignment = Math.abs(
      vec3.dot(planes[2 * pair].normal, viewPlaneNormal)
    );
    if (alignment > maxAlignment) {
      maxAlignment = alignment;
      depthPair = pair;
    }
  }
  const isDepth = (i: number) => Math.floor(i / 2) === depthPair;
  return {
    inPlane: planes.filter((_, i) => !isDepth(i)),
    depth: planes.filter((_, i) => isDepth(i)),
  };
}
