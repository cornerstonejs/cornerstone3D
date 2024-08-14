import type { BaseTool } from '../tools';

type IToolClassReference = new <T extends BaseTool>(config: unknown) => T;

export type { IToolClassReference as default };
