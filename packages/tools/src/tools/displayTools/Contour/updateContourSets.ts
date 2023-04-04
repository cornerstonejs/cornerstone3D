import { cache, Types } from '@cornerstonejs/core';
import vtkAppendPolyData from '@kitware/vtk.js/Filters/General/AppendPolyData';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';

import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificContourRepresentation,
} from '../../../types';
import { getConfigCache, setConfigCache } from './contourConfigCache';
import { getSegmentSpecificConfig } from './utils';

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

  const { contourSets, segmentSpecificConfigs } = geometryIds.reduce(
    (acc, geometryId) => {
      const geometry = cache.getGeometry(geometryId);
      const { data: contourSet } = geometry;
      const segmentIndex = (contourSet as Types.IContourSet).getSegmentIndex();
      const segmentSpecificConfig = getSegmentSpecificConfig(
        contourRepresentation,
        geometryId,
        segmentIndex
      );

      acc.contourSets.push(contourSet);
      acc.segmentSpecificConfigs[segmentIndex] = segmentSpecificConfig ?? {};

      return acc;
    },
    { contourSets: [], segmentSpecificConfigs: {} }
  );

  const affectedSegments = [
    ...mergedInvisibleSegments,
    ...segmentsToSetToVisible,
  ];

  const hasCustomSegmentSpecificConfig = Object.values(
    segmentSpecificConfigs
  ).some((config) => Object.keys(config).length > 0);

  let polyDataModified = false;

  if (affectedSegments.length || hasCustomSegmentSpecificConfig) {
    const appendPolyData = mapper.getInputData();
    const appendScalarData = appendPolyData
      .getPointData()
      .getScalars()
      .getData();
    // below we will only manipulate the polyData of the contourSets that are affected
    // by picking the correct offset in the scalarData array

    contourSets.forEach((contourSet, index) => {
      const segmentIndex = (contourSet as Types.IContourSet).getSegmentIndex();
      // const polyData = contourSet.getPolyData();
      const size = contourSet.getTotalNumberOfPoints();
      // const scalars = polyData.getPointData().getScalars();
      // const scalarData = scalars.getData();

      if (
        affectedSegments.includes(segmentIndex) ||
        segmentSpecificConfigs[segmentIndex]?.fillAlpha // Todo: add others
      ) {
        const color = contourSet.getColor();
        let visibility = mergedInvisibleSegments.includes(segmentIndex)
          ? 0
          : 255;

        const segmentConfig = segmentSpecificConfigs[segmentIndex];
        if (segmentConfig.fillAlpha !== undefined) {
          visibility = segmentConfig.fillAlpha * 255;
        }

        const offset = index * size * 4;

        for (let i = 0; i < size; ++i) {
          appendScalarData[offset + i * 4] = color[0];
          appendScalarData[offset + i * 4 + 1] = color[1];
          appendScalarData[offset + i * 4 + 2] = color[2];
          appendScalarData[offset + i * 4 + 3] = visibility;
        }

        polyDataModified = true;
      }
    });

    if (polyDataModified) {
      appendPolyData.modified();
      mapper.setInputData(appendPolyData);
      mapper.modified();
      actor.modified();
      // viewport.removeActors([contourActorUID]);
      viewport.render();
    }

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
