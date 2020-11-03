import React, { Component } from 'react';
import { api } from 'dicomweb-client';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';

window.cornerstoneWADOImageLoader = cornerstoneWADOImageLoader;

const url = 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs';
const studyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.2744.7002.373729467545468642229382466905';
const ctSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.2744.7002.182837959725425690842769990419';
const petSeriesInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.2744.7002.886851941687931416391879144903';
const searchInstanceOptions = {
  studyInstanceUID,
};

// function createActorMapper(imageData) {
//   const mapper = vtkVolumeMapper.newInstance();
//   mapper.setInputData(imageData);

//   const actor = vtkVolume.newInstance();
//   actor.setMapper(mapper);

//   return {
//     actor,
//     mapper,
//   };
// }

// function createCT2dPipeline(imageData) {
//   const { actor } = createActorMapper(imageData);
//   const cfun = vtkColorTransferFunction.newInstance();
//   /*
//   0: { description: 'Soft tissue', window: 400, level: 40 },
//   1: { description: 'Lung', window: 1500, level: -600 },
//   2: { description: 'Liver', window: 150, level: 90 },
//   3: { description: 'Bone', window: 2500, level: 480 },
//   4: { description: 'Brain', window: 80, level: 40 },*/
//   const preset = vtkColorMaps.getPresetByName('Grayscale');
//   cfun.applyColorMap(preset);
//   cfun.setMappingRange(-360, 440);

//   actor.getProperty().setRGBTransferFunction(0, cfun);

//   return actor;
// }

// function createPET2dPipeline(imageData, petColorMapId) {
//   const { actor, mapper } = createActorMapper(imageData);
//   mapper.setSampleDistance(1.0);

//   const cfun = vtkColorTransferFunction.newInstance();
//   const preset = vtkColorMaps.getPresetByName(petColorMapId);
//   cfun.applyColorMap(preset);
//   cfun.setMappingRange(0, 5);

//   actor.getProperty().setRGBTransferFunction(0, cfun);

//   // Create scalar opacity function
//   const ofun = vtkPiecewiseFunction.newInstance();
//   ofun.addPoint(0, 0.0);
//   ofun.addPoint(0.1, 0.9);
//   ofun.addPoint(5, 1.0);

//   actor.getProperty().setScalarOpacity(0, ofun);

//   return actor;
// }

// function getShiftRange(colorTransferArray) {
//   // Credit to paraview-glance
//   // https://github.com/Kitware/paraview-glance/blob/3fec8eeff31e9c19ad5b6bff8e7159bd745e2ba9/src/components/controls/ColorBy/script.js#L133

//   // shift range is original rgb/opacity range centered around 0
//   let min = Infinity;
//   let max = -Infinity;
//   for (let i = 0; i < colorTransferArray.length; i += 4) {
//     min = Math.min(min, colorTransferArray[i]);
//     max = Math.max(max, colorTransferArray[i]);
//   }

//   const center = (max - min) / 2;

//   return {
//     shiftRange: [-center, center],
//     min,
//     max,
//   };
// }

async function createStudyImageIds(baseUrl, studySearchOptions) {
  const SOP_INSTANCE_UID = '00080018';
  const SERIES_INSTANCE_UID = '0020000E';

  const client = new api.DICOMwebClient({ url });

  const instances = await client.retrieveStudyMetadata(studySearchOptions);

  const instancesToRetrieve = [];

  const imageIds = instances.map(instanceMetaData => {
    const seriesInstanceUID = instanceMetaData[SERIES_INSTANCE_UID].Value[0];
    const sopInstanceUID = instanceMetaData[SOP_INSTANCE_UID].Value[0];

    const imageId =
      `wadors:` +
      baseUrl +
      '/studies/' +
      studyInstanceUID +
      '/series/' +
      seriesInstanceUID +
      '/instances/' +
      sopInstanceUID +
      '/frames/1';

    cornerstoneWADOImageLoader.wadors.metaDataManager.add(
      imageId,
      instanceMetaData
    );

    if (
      seriesInstanceUID === ctSeriesInstanceUID ||
      seriesInstanceUID === petSeriesInstanceUID
    ) {
      instancesToRetrieve.push({
        studyInstanceUID,
        seriesInstanceUID,
        sopInstanceUID,
      });
    }

    return imageId;
  });

  return imageIds;
}

class VTKMPRExample extends Component {
  async componentDidMount() {
    const imageIdPromise = createStudyImageIds(url, searchInstanceOptions);

    this.components = [];

    const imageIds = await imageIdPromise;

    let ctImageIds = imageIds.filter(imageId =>
      imageId.includes(ctSeriesInstanceUID)
    );

    let petImageIds = imageIds.filter(imageId =>
      imageId.includes(petSeriesInstanceUID)
    );

    debugger;
  }

  render() {
    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h1>MPR Template Example </h1>
            <p>Flesh out description later</p>
          </div>
        </div>
      </div>
    );
  }
}

export default VTKMPRExample;
