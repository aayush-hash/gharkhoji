// Saved rooms (♥). The heart fills instantly ("optimistic update"); if the server
// call fails, it flips back. Guests are sent to login first.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { api } from './api';
import { useAuth } from './auth';
import type { ListingCard } from './types';

const IDS = ['favorite-ids'];

export function useSavedIds() {
  const loggedIn = useAuth((s) => Boolean(s.user));
  const query = useQuery({
    queryKey: IDS,
    queryFn: () => api<string[]>('/favorites/ids'),
    enabled: loggedIn,
    staleTime: 60_000,
  });
  return new Set(loggedIn ? (query.data ?? []) : []);
}

export function useSavedListings() {
  const loggedIn = useAuth((s) => Boolean(s.user));
  return useQuery({
    queryKey: ['favorites'],
    queryFn: () => api<ListingCard[]>('/favorites'),
    enabled: loggedIn,
  });
}

export function useToggleSaved() {
  const qc = useQueryClient();
  const loggedIn = useAuth((s) => Boolean(s.user));

  const mutation = useMutation({
    mutationFn: ({ id, save }: { id: string; save: boolean }) =>
      api(`/favorites/${id}`, { method: save ? 'PUT' : 'DELETE' }),
    onMutate: async ({ id, save }) => {
      await qc.cancelQueries({ queryKey: IDS });
      const previous = qc.getQueryData<string[]>(IDS) ?? [];
      qc.setQueryData<string[]>(IDS, save ? [...previous, id] : previous.filter((x) => x !== id));
      return { previous };
    },
    onError: (_err, _vars, ctx) => ctx && qc.setQueryData(IDS, ctx.previous),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: IDS });
      qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });

  return (id: string, currentlySaved: boolean) => {
    if (!loggedIn) {
      router.push('/auth/login');
      return;
    }
    mutation.mutate({ id, save: !currentlySaved });
  };
}
