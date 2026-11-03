import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import { createTRPCContext, createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';

import type { AppRouter } from '../server/trpc/router';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

function buildWsUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:3459/trpc';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/trpc`;
}

const wsClient = createWSClient({ url: buildWsUrl() });

export const trpcClient = createTRPCClient<AppRouter>({
  links: [wsLink<AppRouter>({ client: wsClient, transformer: superjson })],
});

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export const trpc = createTRPCOptionsProxy<AppRouter>({ client: trpcClient, queryClient });
