import CORNERSTONE_3D_TAG from "./cornerstone3DTag";

export default function isValidCornerstoneTrackingIdentifier(
    trackingIdentifier: string
): boolean {
    if (!trackingIdentifier.includes(":")) {
        return false;
    }

    const [cornerstone3DTag, toolType] = trackingIdentifier.split(":");

    if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
        return false;
    }

    // The following is needed since the new cornerstone3D has changed
    // case names such as EllipticalRoi to EllipticalROI
    return toolType.toLowerCase() === this.toolType.toLowerCase();
}
