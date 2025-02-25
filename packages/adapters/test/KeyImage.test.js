import { describe, it, expect, beforeEach } from "@jest/globals";
import { Cornerstone3DSR } from "../src/adapters/Cornerstone3D";

const { KeyImage, Probe } = Cornerstone3DSR;

describe("KeyImage", () => {
    beforeEach(() => {
        // Setup adapters
    });

    it("Must define tool type", () => {
        expect(KeyImage.toolType).toBe("KeyImage");
        // Even after registering a sub-type of Probe, the Probe type should be correct
        expect(Probe.toolType).toBe("Probe");
    });

    it("Must define tracking identifiers", () => {
        expect(KeyImage.trackingIdentifierTextValue).toBe(
            "Cornerstone3DTools@^0.1.0:KeyImage"
        );
        // Even after registering a sub-type of Probe, the Probe tracking identifier should be unchanged
        expect(Probe.trackingIdentifierTextValue).toBe(
            "Cornerstone3DTools@^0.1.0:Probe"
        );
    });
});

//
