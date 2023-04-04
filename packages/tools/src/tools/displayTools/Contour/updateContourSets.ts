import { cache, Types } from '@cornerstonejs/core';
import vtkAppendPolyData from '@kitware/vtk.js/Filters/General/AppendPolyData';
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

  if (cachedConfig?.outlineWidthActive !== newOutlineWithActive) {
    (actor as vtkActor).getProperty().setLineWidth(newOutlineWithActive);

    setConfigCache(
      segmentationRepresentationUID,
      Object.assign({}, cachedConfig, {
        outlineWidthActive: newOutlineWithActive,
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

  const mergedInvisibleSegments = Array.from(cachedConfig.segmentsHidden)
    .filter((segmentIndex) => !segmentsToSetToVisible.includes(segmentIndex))
    .concat(segmentsToSetToInvisible);

  if (mergedInvisibleSegments.length || segmentsToSetToVisible.length) {
    const appendPolyData = vtkAppendPolyData.newInstance();

    geometryIds.forEach((geometryId) => {
      const geometry = cache.getGeometry(geometryId);
      const { data: contourSet } = geometry;
      const segmentIndex = (contourSet as Types.IContourSet).getSegmentIndex();
      const polyData = contourSet.getPolyData();
      const size = polyData.getPoints().getNumberOfPoints();
      const scalars = polyData.getPointData().getScalars();
      const scalarData = scalars.getData();

      if (
        [...mergedInvisibleSegments, ...segmentsToSetToVisible].includes(
          segmentIndex
        )
      ) {
        const color = contourSet.getColor();
        const visibility = mergedInvisibleSegments.includes(segmentIndex)
          ? 0
          : 255;

        for (let i = 0; i < size; ++i) {
          scalarData[i * 4] = color[0];
          scalarData[i * 4 + 1] = color[1];
          scalarData[i * 4 + 2] = color[2];
          scalarData[i * 4 + 3] = visibility;
        }

        polyData.getPointData().setScalars(scalars);
      }

      segmentIndex === 0
        ? appendPolyData.setInputData(polyData)
        : appendPolyData.addInputData(polyData);
    });

    const polyDataOutput = appendPolyData.getOutputData();
    mapper.setInputData(polyDataOutput);

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
