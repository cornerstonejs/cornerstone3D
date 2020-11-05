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

    imageCache.loadVolume(ctVolumeUID, event => {
      console.log(event);
    });

    imageCache.loadVolume(ctVolumeUID, event => {
      console.log(event);
    });

    // const segVolumeBlank = imageCache.makeAndCacheDerivedVolume(ctVolumeUID);

    // const ctDimensions = ctVolume.dimensions;

    // const existingSegPixelArray = createUint8SharedArray(
    //   ctDimensions[0] * ctDimensions[1] * ctDimensions[2]
    // );

    // debugger;

    // const segVolumeExistingData = imageCache.makeAndCacheDerivedVolume(
    //   ctVolumeUID,
    //   {
    //     volumeScalarData: existingSegPixelArray,
    //   }
    // );

    // debugger;
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
