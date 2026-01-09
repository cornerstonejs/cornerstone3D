import { utilities } from "dcmjs";
import { utilities as csUtilities } from "@cornerstonejs/core";

import MeasurementReport from "./MeasurementReport";
import BaseAdapter3D from "./BaseAdapter3D";
import { toScoord } from "../helpers";

const { ArrowAnnotate: TID300ArrowAnnotate } = utilities.TID300;
const { imageToWorldCoords } = csUtilities;

class ArrowAnnotate extends BaseAdapter3D {
    static {
        this.init("ArrowAnnotate", TID300ArrowAnnotate);
        this.registerLegacy();
    }

    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        metadata,
        _trackingIdentifier
    ) {
        const {
            state,
            SCOORDGroup,
            worldCoords,
            referencedImageId,
            ReferencedFrameNumber
        } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroup,
            sopInstanceUIDToImageIdMap,
            metadata,
            this.toolType
        );

        const text = state.annotation.data.label;

        // Since the arrowAnnotate measurement is just a point, to generate the tool state
        // we derive the second point based on the image size relative to the first point.
        if (worldCoords.length === 1 && SCOORDGroup) {
            const imagePixelModule = metadata.get(
                "imagePixelModule",
                referencedImageId
            );

            let xOffset = 10;
            let yOffset = 10;

            if (imagePixelModule) {
                const { columns, rows } = imagePixelModule;
                xOffset = columns / 10;
                yOffset = rows / 10;
            }

            const { GraphicData } = SCOORDGroup;
            const secondPoint = imageToWorldCoords(referencedImageId, [
                GraphicData[0] + xOffset,
                GraphicData[1] + yOffset
            ]);

            worldCoords.push(secondPoint);
        }

        state.annotation.data = {
            ...state.annotation.data,
            text,
            handles: {
                ...state.annotation.data.handles,
                arrowFirst: true,
                points: worldCoords
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(tool, is3DMeasurement = false) {
        const { data, metadata, findingSites } = tool;
        const { finding } = tool;
        const { referencedImageId } = metadata;
        const scoordProps = {
            is3DMeasurement,
            referencedImageId
        };

        const { points, arrowFirst } = data.handles;

        const point = arrowFirst ? points[0] : points[1];
        const point2 = arrowFirst ? points[1] : points[0];

        // Using image coordinates for 2D points
        const pointImage = toScoord(scoordProps, point);
        const pointImage2 = toScoord(scoordProps, point2);

        const TID300RepresentationArguments = {
            points: [pointImage, pointImage2],
            trackingIdentifierTextValue: this.trackingIdentifierTextValue,
            findingSites: findingSites || [],
            finding,
            ReferencedFrameOfReferenceUID: is3DMeasurement
                ? metadata.FrameOfReferenceUID
                : null,
            use3DSpatialCoordinates: is3DMeasurement
        };

        return TID300RepresentationArguments;
    }
}

export default ArrowAnnotate;
