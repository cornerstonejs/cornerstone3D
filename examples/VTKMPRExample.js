import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import { CONSTANTS, imageCache, RenderingEngine } from '@vtk-viewport';

const { ORIENTATION, VIEWPORT_TYPE } = CONSTANTS;

class VTKMPRExample extends Component {
  constructor(props) {
    super(props);

    this.axialCTContainer = React.createRef();
    this.sagittalCTContainer = React.createRef();
    this.coronalCTContainer = React.createRef();
  }

  componentWillUnmount() {
    imageCache.decacheVolume(this.ctVolumeUID);
    imageCache.decacheVolume(this.ptVolumeUID);

    this.renderingEngine.destroy();
  }

  async componentDidMount() {
    const imageIds = await getImageIdsAndCacheMetadata();
    const renderingEngineUID = 'PETCTRenderingEngine';
    const ptVolumeUID = 'PET_VOLUME';
    const ctVolumeUID = 'CT_VOLUME';

    this.ctVolumeUID = ctVolumeUID;
    this.ptVolumeUID = ptVolumeUID;

    const renderingEngine = new RenderingEngine(renderingEngineUID);

    this.renderingEngine = renderingEngine;

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

    renderingEngine.setViewports([
      {
        sceneUID: ctSceneID,
        viewportUID: axialCTViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.axialCTContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
          background: [1, 0, 0],
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: sagittalCTViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.sagittalCTContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
          background: [0, 1, 0],
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: coronalCTViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.coronalCTContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
          background: [0, 0, 1],
        },
      },
    ]);

    const ctScene = renderingEngine.getScene(ctSceneID);

    ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }]);

    const numberOfFrames = ctImageIds.length;

    const reRenderFraction = numberOfFrames / 20;
    let reRenderTarget = reRenderFraction;

    imageCache.loadVolume(ctVolumeUID, event => {
      // TEST - Render every frame => Only call on modified every 5%.

      debugger;

      if (
        event.framesProcessed > reRenderTarget ||
        event.framesProcessed === event.numFrames
      ) {
        ctVolume.vtkImageData.modified();
        console.log(`ctVolumeModified`);

        reRenderTarget += reRenderFraction;
      }

      if (!renderingEngine.hasBeenDestroyed) {
        const t0 = performance.now();
        renderingEngine.render();
        const t1 = performance.now();

        console.log(t1 - t0);
      }
    });

    // When we set volumes we should default the camera into the middle of the first volume?
    // We need to set up orientation based on the options.

    // imageCache.loadVolume(ptVolumeUID, event => {
    //   const t0 = performance.now();

    //   ptVolume.vtkImageData.modified();

    //   if (!renderingEngine.hasBeenDestroyed) {
    //     renderingEngine.render();
    //   }

    //   const t1 = performance.now();

    //   console.log(`PT: framesLoaded: ${event.framesLoaded} time: ${t1 - t0}`);
    // });
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
