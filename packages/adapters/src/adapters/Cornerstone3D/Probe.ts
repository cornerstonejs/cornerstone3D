import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";

const { Point: TID300Point } = utilities.TID300;

class Probe extends BaseAdapter3D {
    static {
        this.init("Probe", TID300Point);
        this.registerLegacy();
    }

    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata,
        trackingIdentifier
    ) {
        const state = super.getMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            imageToWorldCoords,
            metadata,
            trackingIdentifier
        );

        const { defaultState, SCOORDGroup, SCOORD3DGroup } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                Probe.toolType
            );

        if (SCOORDGroup) {
            return this.getMeasurementDataFromScoord({
                state,
                defaultState,
                SCOORDGroup,
                imageToWorldCoords
            });
        } else if (SCOORD3DGroup) {
            return this.getMeasurementDataFromScoord3D({
                state,
                SCOORD3DGroup
            });
        } else {
            throw new Error(
                "Can't get measurement data with missing SCOORD and SCOORD3D groups."
            );
        }
    }

    static getMeasurementDataFromScoord({
        state,
        defaultState,
        SCOORDGroup,
        imageToWorldCoords
    }) {
        const referencedImageId =
            defaultState.annotation.metadata.referencedImageId;

        const { GraphicData } = SCOORDGroup;

        const worldCoords = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const point = imageToWorldCoords(referencedImageId, [
                GraphicData[i],
                GraphicData[i + 1]
            ]);
            worldCoords.push(point);
        }

        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                points: worldCoords,
                activeHandleIndex: null,
                textBox: {
                    hasMoved: false
                }
            }
        };

        return state;
    }

    static getMeasurementDataFromScoord3D({ state, SCOORD3DGroup }) {
        const { GraphicData } = SCOORD3DGroup;

        const worldCoords = [];
        for (let i = 0; i < GraphicData.length; i += 3) {
            const point = [
                GraphicData[i],
                GraphicData[i + 1],
                GraphicData[i + 2]
            ];
            worldCoords.push(point);
        }

        state.annotation.data = {
            ...state.annotation.data,
            handles: {
                points: worldCoords,
                activeHandleIndex: null,
                textBox: {
                    hasMoved: false
                }
            }
        };

        return state;
    }

    public static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, metadata } = tool;
        const { finding, findingSites } = tool;
        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            return this.getTID300RepresentationArgumentsSCOORD3D(tool);
        }

        const {
            handles: { points = [] }
        } = data;

        // Using image coordinates for 2D points
        const pointsImage = points.map(point => {
            const pointImage = worldToImageCoords(referencedImageId, point);
            return {
                x: pointImage[0],
                y: pointImage[1]
            };
        });

        return {
            points: pointsImage,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            findingSites: findingSites || [],
            finding,
            use3DSpatialCoordinates: false
        };
    }

    static getTID300RepresentationArgumentsSCOORD3D(tool) {
        const { data, finding, findingSites, metadata } = tool;
        const {
            handles: { points = [] }
        } = data;

        // Using world coordinates for 3D points
        const point = points[0];

        const pointXYZ = { x: point[0], y: point[1], z: point[2] };

        return {
            points: [pointXYZ],
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            ReferencedFrameOfReferenceUID: metadata.FrameOfReferenceUID,
            findingSites: findingSites || [],
            finding,
            use3DSpatialCoordinates: true
        };
    }
}

export default Probe;
