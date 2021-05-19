export declare type VolumeActor = {
    getProperty: () => any;
    getMapper: () => any;
};
export declare type ActorEntry = {
    uid: string;
    volumeActor: VolumeActor;
    slabThickness?: number;
};
