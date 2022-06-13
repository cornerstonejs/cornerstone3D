import MeasurementReport from "./MeasurementReport.js";
import TID300Point from "../../utilities/TID300/Point";

class Point {
    constructor() {}

    static getMeasurementData(measurementContent) {
        const measurement = measurementContent.map(item => item.GraphicData);
        return measurement.filter(
            (
                s => a =>
                    (j => !s.has(j) && s.add(j))(JSON.stringify(a))
            )(new Set())
        );
    }

    static getTID300RepresentationArguments(scoord3d) {
        if (scoord3d.graphicType !== "POINT") {
            throw new Error("We expected a POINT graphicType");
        }

        const points = [scoord3d.graphicData];
        const lengths = 1;

        return { points, lengths };
    }
}

Point.graphicType = "POINT";
Point.toolType = "Point";
Point.utilityToolType = "Point";
Point.TID300Representation = TID300Point;

MeasurementReport.registerTool(Point);

export default Point;
