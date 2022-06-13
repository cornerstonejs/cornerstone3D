import MeasurementReport from "./MeasurementReport.js";
import TID300Polyline from "../../utilities/TID300/Polyline";

class Polyline {
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
        if (scoord3d.graphicType !== "POLYLINE") {
            throw new Error("We expected a POLYLINE graphicType");
        }

        const points = scoord3d.graphicData;
        const lengths = 1;

        return { points, lengths };
    }
}

Polyline.graphicType = "POLYLINE";
Polyline.toolType = "Polyline";
Polyline.utilityToolType = "Polyline";
Polyline.TID300Representation = TID300Polyline;

MeasurementReport.registerTool(Polyline);

export default Polyline;
