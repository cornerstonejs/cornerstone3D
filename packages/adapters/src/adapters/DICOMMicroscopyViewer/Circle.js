import MeasurementReport from "./MeasurementReport.js";
import TID300Circle from "../../utilities/TID300/Circle";

class Circle {
    constructor() {}

    static getMeasurementData(measurementContent) {
        // removing duplication and Getting only the graphicData information
        const measurement = measurementContent
            .map(item => item.GraphicData)
            .filter(
                (
                    s => a =>
                        (j => !s.has(j) && s.add(j))(JSON.stringify(a))
                )(new Set())
            );

        // Chunking the array into size of three
        return measurement.map(measurement => {
            return measurement.reduce((all, one, i) => {
                const ch = Math.floor(i / 3);
                all[ch] = [].concat(all[ch] || [], one);
                return all;
            }, []);
        });
    }

    static getTID300RepresentationArguments(scoord3d) {
        if (scoord3d.graphicType !== "CIRCLE") {
            throw new Error("We expected a CIRCLE graphicType");
        }

        const points = scoord3d.graphicData;
        const lengths = 1;

        return { points, lengths };
    }
}

Circle.graphicType = "CIRCLE";
Circle.toolType = "Circle";
Circle.utilityToolType = "Circle";
Circle.TID300Representation = TID300Circle;

MeasurementReport.registerTool(Circle);

export default Circle;
