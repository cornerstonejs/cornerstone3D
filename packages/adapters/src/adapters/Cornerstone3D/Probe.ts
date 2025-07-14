import { utilities } from "dcmjs";
import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";
import { toScoords } from "../helpers";

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

        const { defaultState, SCOORDGroup, SCOORD3DGroup, TextBoxGroup } =
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
                imageToWorldCoords,
                TextBoxGroup
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
        imageToWorldCoords,
        TextBoxGroup
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

        return this.addTextBoxDataToState({
            state,
            referencedImageId,
            imageToWorldCoords,
            TextBoxGroup
        });
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

    public static getTID300RepresentationArguments(
        tool,
        worldToImageCoords,
        is3DMeasurement = false
    ) {
        const { data, metadata } = tool;
        const { finding, findingSites } = tool;
        const { referencedImageId } = metadata;
        const scoordProps = {
            worldToImageCoords,
            is3DMeasurement,
            referencedImageId
        };

        const {
            handles: { points = [] }
        } = data;

        // Using image coordinates for 2D points
        const pointsImage = toScoords(scoordProps, points);

        return {
            points: pointsImage,
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            findingSites: findingSites || [],
            finding,
            ReferencedFrameOfReferenceUID: is3DMeasurement
                ? metadata.FrameOfReferenceUID
                : null,
            use3DSpatialCoordinates: is3DMeasurement
        };
    }
}

export default Probe;
