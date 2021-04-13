import React, { Component } from 'react';
// ~~
import * as cs from '@cornerstone'
import { RenderingEngine, ORIENTATION, VIEWPORT_TYPE, createAndCacheVolume } from '@cornerstone';
import { ToolGroupManager, ToolBindings } from '@cornerstone-tools';
import { registerWebImageLoader } from '@cornerstone-streaming-image-volume-loader'


class ColorExample extends Component {
    state = {
        viewportSizes: [
            [512, 512],
            [512, 512],
            [512, 512],
        ],
    };

    constructor(props) {
        super(props);

        this.axialContainer = React.createRef();
        this.sagittalContainer = React.createRef();
        this.coronalContainer = React.createRef();
    }

    componentWillUnmount() {
        this.renderingEngine.destroy();
    }

    async componentDidMount() {
        registerWebImageLoader(cs)
        const renderingEngineUID = 'ExampleRenderingEngineID';

        const imageIds = [
            "web:http://localhost:3000/examples/head/avf1240c.png",
            "web:http://localhost:3000/examples/head/avf1241a.png",
            "web:http://localhost:3000/examples/head/avf1241b.png",
            "web:http://localhost:3000/examples/head/avf1241c.png",
            "web:http://localhost:3000/examples/head/avf1242a.png",
            "web:http://localhost:3000/examples/head/avf1242b.png",
            "web:http://localhost:3000/examples/head/avf1242c.png",
            "web:http://localhost:3000/examples/head/avf1243a.png",
        ];

        function hardcodedMetaDataProvider(type, imageId) {
            const colonIndex = imageId.indexOf(':')
            const scheme = imageId.substring(0, colonIndex)
            if (scheme !== 'web') return

            if (type === 'imagePixelModule') {
                const imagePixelModule = {
                    pixelRepresentation: 0,
                    bitsAllocated: 24,
                    bitsStored: 24,
                    highBit: 24,
                    photometricInterpretation: 'RGB',
                    samplesPerPixel: 3,
                }

                return imagePixelModule;
            } else if (type === 'generalSeriesModule') {
                const generalSeriesModule = {
                    modality: 'SC'
                }

                return generalSeriesModule
            } else if (type === 'imagePlaneModule') {
                const index = imageIds.indexOf(imageId);
                console.warn(index);
                const imagePlaneModule = {
                  imageOrientationPatient: [1, 0, 0, 0, 1, 0],
                  imagePositionPatient: [0, 0, index * 5],
                  pixelSpacing: [1, 1],
                  columnPixelSpacing: 1,
                  rowPixelSpacing: 1,
                  frameOfReferenceUID: 'FORUID',
                  columns: 2048,
                  rows: 1216,
                  rowCosines: [1, 0, 0],
                  columnCosines: [0, 1, 0],
                }

                return imagePlaneModule
            } else if (type === 'voiLutModule') {
                return {
                    windowWidth: [255],
                    windowCenter: [127]
                }
            } else if (type === 'modalityLutModule') {
                return {
                    rescaleSlope: 1,
                    rescaleIntercept: 0
                }
            }

            console.warn(type);
            throw new Error('not available!')
        }

        cornerstone.metaData.addProvider(
            hardcodedMetaDataProvider,
            10000
        );

        const volumeUID = 'VOLUME';


        const volume = await createAndCacheVolume(volumeUID, {imageIds});

        // const volume = imageCache.makeAndCacheImageVolume(
        //     imageIds,
        //     volumeUID
        // );

        //const imageVolume = imageCache.getImageVolume(volumeUID)
        // imageCache.loadVolume(volumeUID);
        // const onLoad = () => this.setState({ progressText: 'Loaded.' });

        volume.load();

        const renderingEngine = new RenderingEngine(renderingEngineUID);

        this.renderingEngine = renderingEngine;

        const axialViewportID = 'AXIAL';
        const sagittalViewportID = 'SAGITTAL';
        const coronalViewportID = 'CORONAL';

        this.axialViewportID = axialViewportID;
        this.sagittalViewportID = sagittalViewportID;
        this.coronalViewportID = coronalViewportID;

        const ctSceneID = 'SCENE';

        renderingEngine.setViewports([
            {
                sceneUID: ctSceneID,
                viewportUID: axialViewportID,
                type: VIEWPORT_TYPE.ORTHOGRAPHIC,
                canvas: this.axialContainer.current,
                defaultOptions: {
                    orientation: ORIENTATION.AXIAL,
                },
            },
            {
                sceneUID: ctSceneID,
                viewportUID: sagittalViewportID,
                type: VIEWPORT_TYPE.ORTHOGRAPHIC,
                canvas: this.sagittalContainer.current,
                defaultOptions: {
                    orientation: ORIENTATION.SAGITTAL,
                },
            },
            {
                sceneUID: ctSceneID,
                viewportUID: coronalViewportID,
                type: VIEWPORT_TYPE.ORTHOGRAPHIC,
                canvas: this.coronalContainer.current,
                defaultOptions: {
                    orientation: ORIENTATION.CORONAL,
                },
            },
        ]);

        const ctScene = renderingEngine.getScene(ctSceneID);

        const ctSceneToolGroup = ToolGroupManager.createToolGroup('TOOLS');
        ctSceneToolGroup.addTool('WindowLevel', {})
        ctSceneToolGroup.addTool('Pan', {});
        ctSceneToolGroup.addTool('Zoom', {});
        ctSceneToolGroup.addTool('StackScrollMouseWheel', {});

        ctSceneToolGroup.setToolActive('StackScrollMouseWheel');
        ctSceneToolGroup.setToolActive('WindowLevel', {
            bindings: [ToolBindings.Mouse.Primary],
        });
        ctSceneToolGroup.setToolActive('Pan', {
            bindings: [ToolBindings.Mouse.Auxiliary],
        });
        ctSceneToolGroup.setToolActive('Zoom', {
            bindings: [ToolBindings.Mouse.Secondary],
        });

        ctScene.setVolumes([
            {
                volumeUID: volumeUID,
                callback: ({ volumeActor, volumeUID }) => {
                    volumeActor.getProperty().setIndependentComponents(false);
                    volumeActor.getProperty().setInterpolationTypeToNearest();
                }
            }
        ]);

        ctSceneToolGroup.addViewports(renderingEngineUID, ctSceneID, axialViewportID);
        ctSceneToolGroup.addViewports(renderingEngineUID, ctSceneID, sagittalViewportID);
        ctSceneToolGroup.addViewports(renderingEngineUID, ctSceneID, coronalViewportID);

        renderingEngine.render();
    }

    render() {
        const { viewportSizes } = this.state;

        const style0 = {
            width: `${viewportSizes[0][0]}px`,
            height: `${viewportSizes[0][1]}px`,
        };

        const style1 = {
            width: `${viewportSizes[1][0]}px`,
            height: `${viewportSizes[1][1]}px`,
        };

        const style2 = {
            width: `${viewportSizes[2][0]}px`,
            height: `${viewportSizes[2][1]}px`,
        };

        return (
            <div>
                <div className="row">
                    <div className="col-xs-12">
                        <h1>Color Example </h1>
                    </div>
                </div>
                <div className="row">
                    <div>
                        <canvas
                            ref={this.axialContainer}
                            width={viewportSizes[0][0]}
                            height={viewportSizes[0][1]}
                            style={style0}
                        />

                        <canvas
                            width={viewportSizes[1][0]}
                            height={viewportSizes[1][1]}
                            ref={this.sagittalContainer}
                            style={style1}
                        />

                        <canvas
                            width={viewportSizes[2][0]}
                            height={viewportSizes[2][1]}
                            ref={this.coronalContainer}
                            style={style2}
                        />
                    </div>
                </div>
            </div>
        );
    }
}

export default ColorExample;
