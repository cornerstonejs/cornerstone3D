import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import { CONSTANTS, imageCache, RenderingEngine } from '@vtk-viewport';

class VTKMPRExample extends Component {
  state = {
    initialized: false,
  };

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

    console.log(renderingEngine);

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
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: sagittalCTViewportID,
        type: 'orthogonal',
        canvas: this.sagittalCTContainer.current,
        defaultOptions: {
          orientation: 'SAGITTAL',
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: coronalCTViewportID,
        type: 'orthogonal',
        canvas: this.coronalCTContainer.current,
        defaultOptions: {
          orientation: 'CORONAL',
        },
      },
    ]);

    const ctScene = renderingEngine.getScene(ctSceneID);

    ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }]);

    // imageCache.loadVolume(ptVolumeUID, event => {
    //   if (event.framesLoaded === event.numFrames) {
    //     console.log(`loaded ${ptVolumeUID}`);
    //     const t = performance.now();

    //     console.log(t - t0);

    //     t0 = t;
    //   }
    // });

    imageCache.loadVolume(ctVolumeUID, event => {
      if (event.framesLoaded === event.numFrames) {
        console.log('loaded ct, render');
        ctScene.render();
      }
    });

    this.setState({ initialized: true });
  }

  render() {
    const activeStyle = {
      width: '256px',
      height: '256px',
      borderStyle: 'solid',
      borderColor: 'grey',
    };

    const inactiveStyle = {
      width: '256px',
      height: '256px',
      borderStyle: 'solid',
      borderColor: 'black',
    };

    // TODO: react to events and make correct stuff active.

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
            <div className="col-sm-4">
              <canvas ref={this.axialCTContainer} style={activeStyle} />
            </div>
            <div className="col-sm-4">
              <canvas ref={this.sagittalCTContainer} style={inactiveStyle} />
            </div>
            <div className="col-sm-4">
              <canvas ref={this.coronalCTContainer} style={inactiveStyle} />
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default VTKMPRExample;
