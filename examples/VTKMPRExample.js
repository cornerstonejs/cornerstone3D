import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import { CONSTANTS, imageCache, RenderingEngine } from '@vtk-viewport';

class VTKMPRExample extends Component {
  constructor(props) {
    super(props);

    this.axialCTContainer = React.createRef();
    this.sagittalCTContainer = React.createRef();
    this.coronalCTContainer = React.createRef();
  }

  async componentDidMount() {
    const imageIds = await getImageIdsAndCacheMetadata();
    const renderingEngineUID = 'PETCTRenderingEngine';
    const ptVolumeUID = 'PET_VOLUME';
    const ctVolumeUID = 'CT_VOLUME';

    const renderingEngine = new RenderingEngine(renderingEngineUID);

    const axialCTViewportID = 'AXIAL_CT';
    const sagittalCTViewportID = 'SAGITTAL_CT';
    const coronalCTViewportID = 'CORONAL_CT';

    const ctSceneID = 'SCENE_CT';

    const { ptImageIds, ctImageIds } = imageIds;

    const ptVolume = imageCache.makeAndCacheImageVolume(
      ptImageIds,
      ptVolumeUID
    );
    const ctVolume = imageCache.makeAndCacheImageVolume(
      ctImageIds,
      ctVolumeUID
    );

    console.log(ctVolume);

    function setCTWWWC({ volumeActor, volumeUID }) {
      const { windowWidth, windowCenter } = ctVolume.metadata.voiLut[0];

      const lower = windowCenter - windowWidth / 2.0;
      const upper = windowCenter + windowWidth / 2.0;

      volumeActor
        .getProperty()
        .getRGBTransferFunction(0)
        .setRange(lower, upper);
    }

    function setPetTransferFunction({ volumeActor, volumeUID }) {
      // Something
    }

    const orientationConstants = CONSTANTS.ORIENTATION;

    renderingEngine.setViewports([
      {
        sceneUID: ctSceneID,
        viewportUID: axialCTViewportID,
        type: 'orthogonal',
        canvas: this.axialCTContainer.current,
        defaultOptions: {
          orientation: 'AXIAL',
          background: [1, 0, 0],
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: sagittalCTViewportID,
        type: 'orthogonal',
        canvas: this.sagittalCTContainer.current,
        defaultOptions: {
          orientation: 'SAGITTAL',
          background: [0, 1, 0],
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: coronalCTViewportID,
        type: 'orthogonal',
        canvas: this.coronalCTContainer.current,
        defaultOptions: {
          orientation: 'CORONAL',
          background: [0, 0, 1],
        },
      },
    ]);

    const ctScene = renderingEngine.getScene(ctSceneID);

    ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }]);

    imageCache.loadVolume(ptVolumeUID, event => {
      const t0 = performance.now();

      ptVolume.vtkImageData.modified();

      renderingEngine.render();

      const t1 = performance.now();

      console.log(`PT: framesLoaded: ${event.framesLoaded} time: ${t1 - t0}`);
    });

    imageCache.loadVolume(ctVolumeUID, event => {
      const t0 = performance.now();

      ctVolume.vtkImageData.modified();

      renderingEngine.render();

      const t1 = performance.now();

      console.log(`CT: framesLoaded: ${event.framesLoaded} time: ${t1 - t0}`);
    });

    this.setState({ initialized: true });
  }

  render() {
    const activeStyle = {
      width: '512px',
      height: '512px',
    };

    const inactiveStyle = {
      width: '512px',
      height: '512px',
    };

    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h1>MPR Template Example </h1>
            <p>Flesh out description later</p>
          </div>
        </div>
        <div className="row">
          <div>
            <canvas
              ref={this.axialCTContainer}
              width={512}
              height={512}
              style={activeStyle}
            />

            <canvas
              width={512}
              height={512}
              ref={this.sagittalCTContainer}
              style={inactiveStyle}
            />

            <canvas
              width={512}
              height={512}
              ref={this.coronalCTContainer}
              style={inactiveStyle}
            />
          </div>
        </div>
      </div>
    );
  }
}

export default VTKMPRExample;
