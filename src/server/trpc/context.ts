import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

import { type Registry, registry } from '../registry';

export interface Context {
  registry: Registry;
}

export function createContext(_opts: CreateWSSContextFnOptions): Context {
  return { registry };
}
