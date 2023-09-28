import MeasurementReport from "./MeasurementReport";
import { utilities } from "dcmjs";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import { vec3 } from "gl-matrix";

const { Polyline: TID300Polyline } = utilities.TID300;

const PLANARFREEHANDROI = "PlanarFreehandROI";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${PLANARFREEHANDROI}`;
const closedContourThreshold = 1e-5;

class PlanarFreehandROI {
    public static toolType = PLANARFREEHANDROI;
    public static utilityToolType = PLANARFREEHANDROI;
    public static TID300Representation = TID300Polyline;
    public static isValidCornerstoneTrackingIdentifier = TrackingIdentifier => {
        if (!TrackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        return toolType === PLANARFREEHANDROI;
    };

    static getMeasurementData(
        MeasurementGroup,
        sopInstanceUIDToImageIdMap,
        imageToWorldCoords,
        metadata
    ) {
        const { defaultState, SCOORDGroup, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroup,
                sopInstanceUIDToImageIdMap,
                metadata,
                PlanarFreehandROI.toolType
            );

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

        const distanceBetweenFirstAndLastPoint = vec3.distance(
            worldCoords[worldCoords.length - 1],
            worldCoords[0]
        );

        let isOpenContour = true;

        // If the contour is closed, this should have been encoded as exactly the same point, so check for a very small difference.
        if (distanceBetweenFirstAndLastPoint < closedContourThreshold) {
            worldCoords.pop(); // Remove the last element which is duplicated.

            isOpenContour = false;
        }

        const points = [];

        if (isOpenContour) {
            points.push(worldCoords[0], worldCoords[worldCoords.length - 1]);
        }

        const state = defaultState;

        state.annotation.data = {
            polyline: worldCoords,
            isOpenContour,
            handles: {
                points,
                activeHandleIndex: null,
                textBox: {
                    hasMoved: false
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(tool, worldToImageCoords) {
        const { data, finding, findingSites, metadata } = tool;
        const { isOpenContour, polyline } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error(
                "PlanarFreehandROI.getTID300RepresentationArguments: referencedImageId is not defined"
            );
        }

        const points = polyline.map(worldPos =>
            worldToImageCoords(referencedImageId, worldPos)
        );

        if (!isOpenContour) {
            // Need to repeat the first point at the end of to have an explicitly closed contour.
            const firstPoint = points[0];

            // Explicitly expand to avoid ciruclar references.
            points.push([firstPoint[0], firstPoint[1]]);
        }

        const area = 0; // TODO -> The tool doesn't have these stats yet.
        const perimeter = 0;

        return {
            points,
            area,
            perimeter,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }
}

MeasurementReport.registerTool(PlanarFreehandROI);

export default PlanarFreehandROI;
