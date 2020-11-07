import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import { imageCache, createUint8SharedArray } from '@vtk-viewport';

class VTKMPRExample extends Component {
  async componentDidMount() {
    const imageIds = await getImageIdsAndCacheMetadata();

    const { ptImageIds, ctImageIds } = imageIds;

    debugger;

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

    console.log('loading...');
    let t0 = performance.now();

    const segVolumeBlank = imageCache.makeAndCacheDerivedVolume(ptVolumeUID);

    debugger;

    // cornerstone
    //   .loadImage(ctImageIds[0], {
    //     targetBuffer: {
    //       arrayBuffer: ctVolume.scalarData.buffer,
    //       offset: 0,
    //       length: 512 * 512,
    //       type: 'Float32Array',
    //     },
    //     preScale: {
    //       scalingParameters: {
    //         rescaleSlope: -1024,
    //         rescaleIntercept: 1,
    //         modality: 'CT',
    //       },
    //     },
    //   })
    //   .then(image => {
    //     console.log(performance.now() - t0);
    //     console.log(image);
    //   });

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
