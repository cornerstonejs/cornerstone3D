import type { PlanarViewport, VolumeViewport3D } from '@cornerstonejs/core';

function look(threeD: VolumeViewport3D, planar: PlanarViewport) {
  threeD.setDisplaySetPresentation({ preset: 'CT-Bone', sampleDistanceMultiplier: 2 });
  (planar as unknown as VolumeViewport3D).setDisplaySetPresentation({
    preset: 'MR-Default',
  });
  planar.setProperties({ preset: 'CT-Bone' });
}

console.log(look);
