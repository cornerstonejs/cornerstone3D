import { cache, Types } from '@cornerstonejs/core';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';

import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificContourRepresentation,
} from '../../../types';
import { getConfigCache, setConfigCache } from './contourConfigCache';

export function updateContourSets(
  viewport: Types.IVolumeViewport,
  geometryIds: string[],
  contourRepresentation: ToolGroupSpecificContourRepresentation,
  contourRepresentationConfig: SegmentationRepresentationConfig,
  contourActorUID: string
) {
  const { segmentationRepresentationUID, segmentsHidden } =
    contourRepresentation;
  const newContourConfig = contourRepresentationConfig.representations.CONTOUR;
  const cachedConfig = getConfigCache(segmentationRepresentationUID);

  const contourSetsActor = viewport.getActor(contourActorUID);

  if (!contourSetsActor) {
    console.warn(
      `No contour actor found for actorUID ${contourActorUID}. Skipping render.`
    );
    return;
  }

  const { actor } = contourSetsActor;

  const newOutlineWithActive = newContourConfig.outlineWidthActive;

  if (cachedConfig.outlineWidthActive !== newOutlineWithActive) {
    (actor as vtkActor).getProperty().setLineWidth(newOutlineWithActive);

    setConfigCache(
      segmentationRepresentationUID,
      Object.assign({}, cachedConfig, {
        outlineWidthActive: newOutlineWithActive,
      })
    );
  }

  const newVisibility = contourRepresentation.visibility;

  if (cachedConfig.visibility !== newVisibility) {
    (actor as vtkActor).setVisibility(newVisibility);

    setConfigCache(
      segmentationRepresentationUID,
      Object.assign({}, cachedConfig, {
        visibility: newVisibility,
      })
    );
  }

  const mapper = (actor as vtkActor).getMapper();
  const lut = mapper.getLookupTable();

  const segmentsToSetToInvisible = [];
  const segmentsToSetToVisible = [];

  for (const segmentIndex of segmentsHidden) {
    if (!cachedConfig.segmentsHidden.has(segmentIndex)) {
      segmentsToSetToInvisible.push(segmentIndex);
    }
  }

  // the other way around
  for (const segmentIndex of cachedConfig.segmentsHidden) {
    if (!segmentsHidden.has(segmentIndex)) {
      segmentsToSetToVisible.push(segmentIndex);
    }
  }

  if (segmentsToSetToInvisible.length || segmentsToSetToVisible.length) {
    const table = vtkDataArray.newInstance({
      numberOfComponents: 4,
      size: 4 * geometryIds.length,
      dataType: 'Uint8Array',
    });

    geometryIds.forEach((geometryId, index) => {
      const geometry = cache.getGeometry(geometryId);
      const color = geometry.data.getColor();
      const visibility = segmentsToSetToInvisible.includes(index) ? 0 : 255;
      table.setTuple(index, [...color, visibility]);
    });

    lut.setTable(table);

    setConfigCache(
      segmentationRepresentationUID,
      Object.assign({}, cachedConfig, {
        segmentsHidden: new Set(segmentsHidden),
      })
    );

    mapper.setLookupTable(lut);
  }

  viewport.render();
}
