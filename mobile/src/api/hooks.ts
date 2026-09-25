// Data fetching with TanStack Query: caching, loading states and retries for free.
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Listing, LoginResponse, Place, SearchFilters, SearchResults, User } from '../lib/types';

export function usePlaces() {
  return useQuery({
    queryKey: ['places'],
    queryFn: () => api<Place[]>('/search/places', { auth: false }),
    staleTime: 60 * 60 * 1000, // places rarely change
  });
}

export function useSearch(filters: SearchFilters, pageSize = 20) {
  return useInfiniteQuery({
    queryKey: ['search', filters, pageSize],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api<SearchResults>('/search/listings', {
        auth: false,
        query: {
          place: filters.place,
          radius_km: filters.place ? (filters.radius_km ?? 3) : undefined,
          min_rent: filters.min_rent,
          max_rent: filters.max_rent,
          type: filters.types,
          amenity: filters.amenities,
          sort: filters.sort ?? 'freshness',
          page: pageParam,
          page_size: pageSize,
        },
      }),
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
  });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: () => api<Listing>(`/listings/${id}`),
  });
}

export function useRequestOtp() {
  return useMutation({
    mutationFn: (phone: string) =>
      api<{ message: string; expires_in: number; resend_after: number }>('/auth/otp/request', {
        method: 'POST',
        body: { phone },
        auth: false,
      }),
  });
}

export function useVerifyOtp() {
  const signIn = useAuth((s) => s.signIn);
  return useMutation({
    mutationFn: (v: { phone: string; code: string }) =>
      api<LoginResponse>('/auth/otp/verify', { method: 'POST', body: v, auth: false }),
    onSuccess: signIn,
  });
}

export function useUpdateProfile() {
  const setUser = useAuth((s) => s.setUser);
  return useMutation({
    mutationFn: (body: Partial<Pick<User, 'full_name' | 'role' | 'language'>>) =>
      api<User>('/users/me', { method: 'PATCH', body }),
    onSuccess: setUser,
  });
}
