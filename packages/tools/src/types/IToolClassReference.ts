import { BaseTool } from '../tools';

type IToolClassReference = new <T extends BaseTool>(config: any) => T;

export default IToolClassReference;
