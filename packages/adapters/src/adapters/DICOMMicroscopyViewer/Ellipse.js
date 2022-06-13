import MeasurementReport from "./MeasurementReport.js";
import TID300Ellipse from "../../utilities/TID300/Ellipse";

class Ellipse {
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
        if (scoord3d.graphicType !== "Ellipse") {
            throw new Error("We expected a Ellipse graphicType");
        }

        const points = scoord3d.graphicData;
        const lengths = 1;

        return { points, lengths };
    }
}

Ellipse.graphicType = "ELLIPSE";
Ellipse.toolType = "Ellipse";
Ellipse.utilityToolType = "Ellipse";
Ellipse.TID300Representation = TID300Ellipse;

MeasurementReport.registerTool(Ellipse);

export default Ellipse;
