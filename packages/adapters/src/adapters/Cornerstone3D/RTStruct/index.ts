import { utilities } from "@cornerstonejs/tools";
import {
    generateRTSSFromAnnotations,
    generateRTSSFromSegmentations
} from "./RTSS";

const { generateContourSetsFromLabelmap } = utilities.rtstruct;

export {
    generateContourSetsFromLabelmap,
    generateRTSSFromAnnotations,
    generateRTSSFromSegmentations
};
