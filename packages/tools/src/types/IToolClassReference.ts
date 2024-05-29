import { BaseTool } from '../tools/index.js';

type IToolClassReference = new <T extends BaseTool>(config: any) => T;

export default IToolClassReference;
