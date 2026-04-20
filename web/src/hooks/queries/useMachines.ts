import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { Machine } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useMachines(api: ApiClient | null, enabled: boolean): {
    machines: Machine[]
    knownMachinesCount: number
    offlineMachinesCount: number
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
} {
    const query = useQuery({
        queryKey: queryKeys.machines,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getMachines()
        },
        enabled: Boolean(api && enabled),
    })

    return {
        machines: query.data?.machines ?? [],
        knownMachinesCount: query.data?.knownMachinesCount ?? query.data?.machines.length ?? 0,
        offlineMachinesCount: query.data?.offlineMachinesCount ?? 0,
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load machines' : null,
        refetch: query.refetch,
    }
}
