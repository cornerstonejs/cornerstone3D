import { describe, it, expect, beforeEach } from "@jest/globals";
import { Cornerstone3DSR } from "../src/adapters/Cornerstone3D";

const { Probe } = Cornerstone3DSR;

describe("Probe", () => {
    beforeEach(() => {
        // Setup adapters
    });

    it("Must define tool type", () => {
        expect(Probe.toolType).toBe("Probe");
    });
});

//
