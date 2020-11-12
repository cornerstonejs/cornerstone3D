import React, { Component } from 'react';
import getImageIdsAndCacheMetadata from './helpers/getImageIdsAndCacheMetadata';
import { CONSTANTS, imageCache, RenderingEngine } from '@vtk-viewport';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorMaps from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps';

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

    // Initialise all CT values to -1024 so we don't get a grey box?

    const { scalarData } = ctVolume;
    const ctLength = scalarData.length;

    for (let i = 0; i < ctLength; i++) {
      scalarData[i] = -1024;
    }

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

      // TODO -> How do we invert?

      volumeActor
        .getProperty()
        .getRGBTransferFunction(0)
        .setRange(0, 5);
    }

    function setPetColorMapTransferFunction({ volumeActor }) {
      const mapper = volumeActor.getMapper();
      mapper.setSampleDistance(1.0);

      const cfun = vtkColorTransferFunction.newInstance();
      const preset = vtkColorMaps.getPresetByName('hsv');
      cfun.applyColorMap(preset);
      cfun.setMappingRange(0, 5);

      volumeActor.getProperty().setRGBTransferFunction(0, cfun);

      // Create scalar opacity function
      const ofun = vtkPiecewiseFunction.newInstance();
      ofun.addPoint(0, 0.0);
      ofun.addPoint(0.1, 0.9);
      ofun.addPoint(5, 1.0);

      volumeActor.getProperty().setScalarOpacity(0, ofun);
    }

    renderingEngine.setViewports([
      {
        sceneUID: ctSceneID,
        viewportUID: axialCTViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.axialCTContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.AXIAL,
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: sagittalCTViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.sagittalCTContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.SAGITTAL,
        },
      },
      {
        sceneUID: ctSceneID,
        viewportUID: coronalCTViewportID,
        type: VIEWPORT_TYPE.ORTHOGRAPHIC,
        canvas: this.coronalCTContainer.current,
        defaultOptions: {
          orientation: ORIENTATION.CORONAL,
        },
      },
    ]);

    const ctScene = renderingEngine.getScene(ctSceneID);

    //ctScene.setVolumes([{ volumeUID: ctVolumeUID, callback: setCTWWWC }]);
    ctScene.setVolumes([
      { volumeUID: ctVolumeUID, callback: setCTWWWC },
      { volumeUID: ptVolumeUID, callback: setPetColorMapTransferFunction },
    ]);

    // When we set volumes we should default the camera into the middle of the first volume?
    // We need to set up orientation based on the options.

    const numberOfFrames = ptImageIds.length;

    const reRenderFraction = numberOfFrames / 20;
    let reRenderTarget = reRenderFraction;

    imageCache.loadVolume(ptVolumeUID, event => {
      const t0 = performance.now();

      if (
        event.framesProcessed > reRenderTarget ||
        event.framesProcessed === event.numFrames
      ) {
        ptVolume.vtkImageData.modified();
        console.log(`ptVolumeModified`);

        reRenderTarget += reRenderFraction;
      }

      if (!renderingEngine.hasBeenDestroyed) {
        renderingEngine.render();
      }

      const t1 = performance.now();

      console.log(`PT: framesLoaded: ${event.framesLoaded} time: ${t1 - t0}`);
    });

    const numberOfCtFrames = ctImageIds.length;

    const reRenderFractionCt = numberOfCtFrames / 20;
    let reRenderTargetCt = reRenderFractionCt;

    imageCache.loadVolume(ctVolumeUID, event => {
      // TEST - Render every frame => Only call on modified every 5%.

      if (
        event.framesProcessed > reRenderTargetCt ||
        event.framesProcessed === event.numFrames
      ) {
        ctVolume.vtkImageData.modified();
        console.log(`ctVolumeModified`);

        reRenderTargetCt += reRenderFractionCt;
      }

      if (!renderingEngine.hasBeenDestroyed) {
        const t0 = performance.now();
        renderingEngine.render();
        const t1 = performance.now();

        console.log(t1 - t0);
      }
    });
  }

  render() {
    const activeStyle = {
      width: '256px',
      height: '256px',
    };

    const inactiveStyle = {
      width: '256px',
      height: '256px',
    };

    return (
      <div>
        <div className="row">
          <div className="col-xs-12">
            <h5>MPR Template Example </h5>
          </div>
        </div>
        <div className="row">
          <div>
            <canvas
              ref={this.axialCTContainer}
              width={256}
              height={256}
              style={activeStyle}
            />

            <canvas
              width={256}
              height={256}
              ref={this.sagittalCTContainer}
              style={inactiveStyle}
            />

            <canvas
              width={256}
              height={256}
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
