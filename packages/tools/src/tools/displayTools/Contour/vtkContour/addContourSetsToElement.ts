import { cache, Types } from '@cornerstonejs/core';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkAppendPolyData from '@kitware/vtk.js/Filters/General/AppendPolyData';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

import {
  getPolyData,
  getSegmentSpecificConfig,
  validateGeometry,
} from './utils';

import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificContourRepresentation,
} from '../../../../types';
import { getConfigCache, setConfigCache } from './contourConfigCache';

export function addContourSetsToElement(
  viewport: Types.IVolumeViewport,
  geometryIds: string[],
  contourRepresentation: ToolGroupSpecificContourRepresentation,
  contourRepresentationConfig: SegmentationRepresentationConfig,
  contourActorUID: string
) {
  const { segmentationRepresentationUID, segmentsHidden } =
    contourRepresentation;
  const appendPolyData = vtkAppendPolyData.newInstance();

  const scalarToColorMap = new Map();
  const segmentSpecificMap = new Map();

  geometryIds.forEach((geometryId) => {
    const geometry = cache.getGeometry(geometryId);

    if (!geometry) {
      console.warn(
        `No geometry found for geometryId ${geometryId}. Skipping render.`
      );
      return;
    }

    const segmentIndex = (geometry.data as Types.IContourSet).getSegmentIndex();

    validateGeometry(geometry);

    const segmentSpecificConfig = getSegmentSpecificConfig(
      contourRepresentation,
      geometryId,
      segmentIndex
    );

    const contourSet = geometry.data;
    const polyData = getPolyData(contourSet as Types.IContourSet);
    const color = contourSet.getColor();

    const size = polyData.getPoints().getNumberOfPoints();

    const scalars = vtkDataArray.newInstance({
      size: size * 4,
      numberOfComponents: 4,
      dataType: 'Uint8Array',
    });
    for (let i = 0; i < size; ++i) {
      scalars.setTuple(i, [...color, 255]);
    }
    polyData.getPointData().setScalars(scalars);

    if (segmentSpecificConfig) {
      segmentSpecificMap.set(segmentIndex, segmentSpecificConfig);
    }

    scalarToColorMap.set(segmentIndex, [
      ...color,
      segmentsHidden.has(segmentIndex) ? 0 : 255,
    ]);

    segmentIndex === 0
      ? appendPolyData.setInputData(polyData)
      : appendPolyData.addInputData(polyData);
  });

  const polyDataOutput = appendPolyData.getOutputData();

  const outlineWidthActive =
    contourRepresentationConfig.representations.CONTOUR.outlineWidthActive;

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polyDataOutput);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setLineWidth(outlineWidthActive);

  // set the config cache for later update of the contour
  setConfigCache(
    segmentationRepresentationUID,
    Object.assign({}, getConfigCache(segmentationRepresentationUID), {
      segmentsHidden: new Set(segmentsHidden),
      segmentSpecificMap,
      outlineWidthActive,
    })
  );

  actor.setForceOpaque(true);

  viewport.addActor({
    uid: contourActorUID,
    actor: actor as unknown as Types.Actor,
  });
  viewport.resetCamera();
  viewport.render();
}
