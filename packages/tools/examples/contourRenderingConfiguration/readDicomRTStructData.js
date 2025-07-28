import { api } from 'dicomweb-client';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkTriangleFilter from '@kitware/vtk.js/Filters/General/TriangleFilter';
import { glMatrix } from 'gl-matrix';
export default async function readDicomRTStructData({
  StudyInstanceUID,
  SeriesInstanceUID,
  SOPInstanceUID = null,
  wadoRsRoot,
  client = null,
  convertMultiframe = true,
}) {
  const studySearchOptions = {
    studyInstanceUID: StudyInstanceUID,
    seriesInstanceUID: SeriesInstanceUID,
  };
  const MODALITY = '00080060';
  const ROI_CONTOUR_SEQUENCE = '30060039';
  const SQ_CONTOUR_SEQUENCE = '30060040';
  const ROI_COLOR = '3006002A';
  const TAG_CONTOUR_DATA = '30060050';
  const TAG_CONTOUR_TYPE = '30060042';
  const TAG__STRUCT_ROI_SQ = '30060020';
  const TAG_ROI_NUMBER = '30060022';
  const TAG_REF_ROI_NUMBER = '30060084';
  const TAG_CONTOUR_NAME = '30060026';
  const TAG_CONTOUR_DESCRIPTION = '30060028';
  const TAG_ROI_TYPE = '300600A4';
  const TAG_ROI_OBSERVATIONS = '30060080';
  client = client || new api.DICOMwebClient({ url: wadoRsRoot });
  let instances = await client.retrieveSeriesMetadata(studySearchOptions);
  const modality = instances[0][MODALITY].Value[0];
  if (modality == 'RTSTRUCT') {
    let contourItems = instances[0][ROI_CONTOUR_SEQUENCE].Value;
    let structRoiSQ = instances[0][TAG__STRUCT_ROI_SQ].Value;
    let roi_observations = instances[0][TAG_ROI_OBSERVATIONS].Value;
    let contureItemsLength = contourItems.length;

    let contourDataObject = { contourSets: [] };
    const validTypes = new Set([
      'EXTERNAL',
      'PTV',
      'CTV',
      'GTV',
      'TREATED_VOLUME',
      'IRRAD_VOLUME',
      'AVOIDANCE',
      'ORGAN',
      'CONTRAST_AGENT',
      'CAVITY',
      'SUPPORT',
      'CONTROL',
      '',
    ]);
    for (let index = 0; index < contureItemsLength; index++) {
      const roiTypeTag = roi_observations[index][TAG_ROI_TYPE];
      if (!roiTypeTag || !roiTypeTag.Value || !roiTypeTag.Value[0]) {
        continue; // skip if missing or null
      }

      const roiType = roiTypeTag.Value[0];
      if (roiType === roiType.toUpperCase() && validTypes.has(roiType)) {
        let contourSets = {
          data: [],
          frameOfReferenceUID: '',
          id: '',
          color: [],
          segmentIndex: 0,
        };
        let color = contourItems[index][ROI_COLOR].Value;
        contourSets.id = 'contour' + index;
        contourSets.color = [...color, 255];
        // contourSets.segmentIndex = index + 1;
        contourSets.name = structRoiSQ[index][TAG_CONTOUR_NAME]?.Value[0];
        contourSets.description =
          structRoiSQ[index][TAG_CONTOUR_DESCRIPTION]?.Value;
        contourSets.checked = true;
        contourSets.mode2D = '0';
        contourSets.mode3D = '2';
        contourSets.type = roiType;
        if (!contourItems[index][SQ_CONTOUR_SEQUENCE]) {
          continue;
        }
        let valueSQSequence = contourItems[index][SQ_CONTOUR_SEQUENCE].Value;
        let refRoiNumber = contourItems[index][TAG_REF_ROI_NUMBER].Value[0];
        let frameOfRef = getFrameOfRefUID(structRoiSQ, refRoiNumber);
        if (frameOfRef) {
          contourSets.frameOfReferenceUID = frameOfRef;
        }
        for (let index2 = 0; index2 < valueSQSequence.length; index2++) {
          let contourData = valueSQSequence[index2][TAG_CONTOUR_DATA].Value;
          const result = reduceColinearXYPoints(contourData);
          let contourType = valueSQSequence[index2][TAG_CONTOUR_TYPE].Value;
          let referenceSOPInstanceUID =
            valueSQSequence[index2]['30060016']?.Value[0]['00081155']?.Value[0];
          contourSets.data.push({
            points: result,
            type: contourType,
            color: [...color, 255],
            // segmentIndex: index + 1, // doesnt matter
            referenceSOPInstanceUID: referenceSOPInstanceUID,
          });
        }
        contourDataObject.contourSets.push(contourSets);
      }
    }
    contourDataObject.contourSets.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
    contourDataObject.contourSets.forEach((cs, i) => {
      cs.segmentIndex = i + 1;
    });
    return contourDataObject;
  }
  return {};
}

function getFrameOfRefUID(structRoiSQ, roiNumber) {
  const TAG_ROI_NUMBER = '30060022';
  const TAG__STRUCT_ROI_SQ = '30060024';
  for (let index = 0; index < structRoiSQ.length; index++) {
    const roiValue = structRoiSQ[index][TAG_ROI_NUMBER].Value[0];
    if (roiValue == roiNumber) {
      let data = structRoiSQ[index][TAG__STRUCT_ROI_SQ].Value;
      return data;
    }
  }
}

function reduceColinearXYPoints(contourData) {
  const result = [];

  // Extract points
  const points = [];
  for (let i = 0; i < contourData.length; i += 3) {
    points.push([contourData[i], contourData[i + 1], contourData[i + 2]]);
  }

  if (points.length < 3) {
    return points; // nothing to reduce
  }

  result.push(points[0]); // Always keep the first point

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const v1 = [curr[0] - prev[0], curr[1] - prev[1]]; // XY vector
    const v2 = [next[0] - curr[0], next[1] - curr[1]];

    const cross = v1[0] * v2[1] - v1[1] * v2[0]; // z-component of 2D cross product

    if (Math.abs(cross) > 1e-6) {
      result.push(curr); // Not colinear
    }
  }

  result.push(points[points.length - 1]); // Always keep the last point
  result.push(points[0]);
  return result;
}
