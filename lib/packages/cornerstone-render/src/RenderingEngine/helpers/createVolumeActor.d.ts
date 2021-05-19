import { VolumeActor } from './../../types/IActor';
interface createVolumeActorInterface {
    volumeUID: string;
    callback?: ({ volumeActor: any, volumeUID: string }: {
        volumeActor: any;
        volumeUID: any;
    }) => void;
    blendMode?: string;
}
declare function createVolumeActor(props: createVolumeActorInterface): Promise<VolumeActor>;
export default createVolumeActor;
