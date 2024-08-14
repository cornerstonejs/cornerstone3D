import type { BaseTool } from '../tools';

type IToolClassReference = new <T extends BaseTool>(config: any) => T;

export type { IToolClassReference as default };
