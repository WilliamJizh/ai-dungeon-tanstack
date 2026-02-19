import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // sessions are managed locally; no background refetch
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})
