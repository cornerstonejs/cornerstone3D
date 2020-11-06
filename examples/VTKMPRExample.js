import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import { imageCache, createUint8SharedArray } from '@vtk-viewport';

class VTKMPRExample extends Component {
  async componentDidMount() {
    const imageIds = await getImageIdsAndCacheMetadata();

    const { ptImageIds, ctImageIds } = imageIds;

    const ptVolumeUID = 'PET_VOLUME';
    const ctVolumeUID = 'CT_VOLUME';

    const ptVolume = imageCache.makeAndCacheImageVolume(
      ptImageIds,
      ptVolumeUID
    );
    const ctVolume = imageCache.makeAndCacheImageVolume(
      ctImageIds,
      ctVolumeUID
    );

    console.log(ctVolume);
    console.log(ptVolume);

    // Seg example
    // const ctDimensions = ctVolume.dimensions;
    // const existingSegPixelArray = createUint8SharedArray(
    //   ctDimensions[0] * ctDimensions[1] * ctDimensions[2]
    // );

    // const segVolumeExistingData = imageCache.makeAndCacheDerivedVolume(
    //   ctVolumeUID,
    //   {
    //     volumeScalarData: existingSegPixelArray,
    //   }
    // );

    let t0 = performance.now();

    imageCache.loadVolume(ptVolumeUID, event => {
      if (event.framesLoaded === event.numFrames) {
        console.log(`loaded ${ptVolumeUID}`);
        const t = performance.now();

        console.log(t - t0);

        t0 = t;
      }
    });

    imageCache.loadVolume(ctVolumeUID, event => {
      if (event.framesLoaded === event.numFrames) {
        console.log(`loaded ${ctVolumeUID}`);
        const t = performance.now();

        console.log(t - t0);

        t0 = t;
      }
    });

    // console.log('loading...');
    // let t0 = performance.now();

    // cornerstone
    //   .loadImage(
    //     'wadors:http://localhost:8080/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.3.6.1.4.1.14519.5.2.1.2744.7002.265747109734234332913845746990/series/1.3.6.1.4.1.14519.5.2.1.2744.7002.293058381121514278754483306116/instances/1.3.6.1.4.1.14519.5.2.1.2744.7002.148622969920358252177506791693/frames/1',
    //     {
    //       targetBuffer: {
    //         buffer: ctVolume.scalarData.buffer,
    //         offset: 0,
    //         length: 512 * 512,
    //         type: 'Float32Array',
    //       },
    //       preScale: {
    //         scalingParameters: {
    //           rescaleSlope: -1024,
    //           rescaleIntercept: 1,
    //           modality: 'CT',
    //         },
    //       },
    //     }
    //   )
    //   .then(image => {
    //     console.log(performance.now() - t0);
    //     console.log(image);
    //   });

    // const segVolumeBlank = imageCache.makeAndCacheDerivedVolume(ctVolumeUID);

    // imageCache.decacheVolume(segVolumeBlank.uid);

    // imageCache.decacheVolume(segVolumeExistingData.uid);

    // imageCache.purgeCache();
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
