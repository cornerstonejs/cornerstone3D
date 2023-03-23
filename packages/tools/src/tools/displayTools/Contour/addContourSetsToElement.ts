import { cache, Types } from '@cornerstonejs/core';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkLookupTable from '@kitware/vtk.js/Common/Core/LookupTable';
import vtkAppendPolyData from '@kitware/vtk.js/Filters/General/AppendPolyData';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

import {
  getPolyData,
  getSegmentSpecificConfig,
  setScalarsForPolyData,
  validateGeometry,
} from './utils';

import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificContourRepresentation,
} from '../../../types';
import { getConfigCache, setConfigCache } from './contourConfigCache';

export function addContourSetsToElement(
  viewport: Types.IVolumeViewport,
  geometryIds: string[],
  contourRepresentation: ToolGroupSpecificContourRepresentation,
  contourRepresentationConfig: SegmentationRepresentationConfig,
  contourActorUID: string
) {
  const { segmentationRepresentationUID, segmentsHidden, visibility } =
    contourRepresentation;
  const appendPolyData = vtkAppendPolyData.newInstance();

  const scalarToColorMap = new Map();
  const segmentSpecificMap = new Map();

  geometryIds.forEach((geometryId, index) => {
    const geometry = cache.getGeometry(geometryId);

    if (!geometry) {
      console.warn(
        `No geometry found for geometryId ${geometryId}. Skipping render.`
      );
      return;
    }

    validateGeometry(geometry);

    const segmentSpecificConfig = getSegmentSpecificConfig(
      contourRepresentation,
      geometryId,
      index + 1 // +1 because the first segment is the background
    );

    const contourSet = geometry.data;
    const polyData = getPolyData(contourSet);
    setScalarsForPolyData(polyData, index);

    if (segmentSpecificConfig) {
      segmentSpecificMap.set(index, segmentSpecificConfig);
    }

    const color = contourSet.getColor();

    scalarToColorMap.set(index, [
      ...color,
      segmentsHidden.has(index) ? 0 : 255,
    ]);

    index === 0
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

  const lut = vtkLookupTable.newInstance();

  const numberOfColors = scalarToColorMap.size;
  const table = vtkDataArray.newInstance({
    numberOfComponents: 4,
    size: 4 * numberOfColors,
    dataType: 'Uint8Array',
  });
  scalarToColorMap.forEach((color, index) => {
    table.setTuple(index, color);
  });

  lut.setTable(table);
  // lut.setRange(0, numberOfColors - 1);
  mapper.setLookupTable(lut);

  // set the config cache for later update of the contour
  setConfigCache(
    segmentationRepresentationUID,
    Object.assign({}, getConfigCache(segmentationRepresentationUID), {
      segmentsHidden: new Set(segmentsHidden),
      segmentSpecificMap,
      outlineWidthActive,
      visibility,
    })
  );

  actor.setForceOpaque(true);

  viewport.addActor({ uid: contourActorUID, actor });
  viewport.resetCamera();
  viewport.render();
}
