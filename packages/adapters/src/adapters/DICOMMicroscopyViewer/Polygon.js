import MeasurementReport from "./MeasurementReport.js";
import TID300Polygon from "../../utilities/TID300/Polygon";

class Polygon {
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
        if (scoord3d.graphicType !== "POLYGON") {
            throw new Error("We expected a POLYGON graphicType");
        }

        const points = scoord3d.graphicData;
        const lengths = 1;

        return { points, lengths };
    }
}

Polygon.graphicType = "POLYGON";
Polygon.toolType = "Polygon";
Polygon.utilityToolType = "Polygon";
Polygon.TID300Representation = TID300Polygon;

MeasurementReport.registerTool(Polygon);

export default Polygon;
