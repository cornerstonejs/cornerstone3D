import { utilities } from "dcmjs";
import Probe from "./Probe";

const { Point: TID300Point } = utilities.TID300;

export default class KeyImage extends Probe {
    static {
        this.init("KeyImage", TID300Point, { parentType: Probe.toolType });
    }
}

export { KeyImage };
