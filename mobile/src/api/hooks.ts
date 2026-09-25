// Data fetching with TanStack Query: caching, loading states and retries for free.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AuthMode } from '../lib/authFlow';
import type {
  Listing,
  ListingCard,
  ListingInput,
  ListingMeta,
  LoginResponse,
  Place,
  Role,
  SearchFilters,
  SearchResults,
  TokenPair,
  User,
} from '../lib/types';

// ---------------- browsing ----------------

export function usePlaces() {
  return useQuery({
    queryKey: ['places'],
    queryFn: () => api<Place[]>('/search/places', { auth: false }),
    staleTime: 60 * 60 * 1000, // places rarely change
  });
}

export function useListingMeta() {
  return useQuery({
    queryKey: ['listing-meta'],
    queryFn: () => api<ListingMeta>('/listings/meta', { auth: false }),
    staleTime: 60 * 60 * 1000,
  });
}

function searchQuery(filters: SearchFilters, page: number, pageSize: number) {
  const hasCenter = Boolean(filters.place) || (filters.lat != null && filters.lng != null);
  return api<SearchResults>('/search/listings', {
    auth: false,
    query: {
      q: filters.q,
      place: filters.place,
      lat: filters.lat,
      lng: filters.lng,
      radius_km: hasCenter ? (filters.radius_km ?? 3) : undefined,
      min_rent: filters.min_rent,
      max_rent: filters.max_rent,
      type: filters.types,
      amenity: filters.amenities,
      sort: filters.sort ?? 'freshness',
      page,
      page_size: pageSize,
    },
  });
}

export function useSearch(filters: SearchFilters, pageSize = 20) {
  return useInfiniteQuery({
    queryKey: ['search', filters, pageSize],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => searchQuery(filters, pageParam, pageSize),
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
  });
}

/** For the map: one page of up to 50 pins around the visible area. */
export function useMapSearch(center: { lat: number; lng: number; radius_km: number } | null) {
  return useQuery({
    queryKey: ['map-search', center],
    enabled: center != null,
    queryFn: () => searchQuery({ ...center!, sort: 'distance' }, 1, 50),
    placeholderData: keepPreviousData, // keep old pins while the map moves
  });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: () => api<Listing>(`/listings/${id}`),
  });
}

// ---------------- auth ----------------

// ---------------- accounts ----------------
// Sign up:          useRequestOtp('signup') → useVerifyOtp → useRegister
// Log in:           useLogin (phone + password, no SMS)
// Forgot password:  useRequestOtp('reset')  → useVerifyOtp → useResetPassword

export function useRequestOtp() {
  return useMutation({
    mutationFn: (v: { phone: string; purpose: AuthMode }) =>
      api<{ message: string; expires_in: number; resend_after: number }>('/auth/otp/request', {
        method: 'POST',
        body: v,
        auth: false,
      }),
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: (v: { phone: string; code: string; purpose: AuthMode }) =>
      api<{ verification_token: string; purpose: AuthMode; expires_in: number }>('/auth/otp/verify', {
        method: 'POST',
        body: v,
        auth: false,
      }),
  });
}

export function useRegister() {
  const signIn = useAuth((s) => s.signIn);
  return useMutation({
    mutationFn: (body: { verification_token: string; full_name: string; role: Role; password: string }) =>
      api<LoginResponse>('/auth/register', { method: 'POST', body, auth: false }),
    onSuccess: signIn,
  });
}

export function useLogin() {
  const signIn = useAuth((s) => s.signIn);
  return useMutation({
    mutationFn: (body: { phone: string; password: string }) =>
      api<LoginResponse>('/auth/login', { method: 'POST', body, auth: false }),
    onSuccess: signIn,
  });
}

export function useResetPassword() {
  const signIn = useAuth((s) => s.signIn);
  return useMutation({
    mutationFn: (body: { verification_token: string; password: string }) =>
      api<LoginResponse>('/auth/password/reset', { method: 'POST', body, auth: false }),
    onSuccess: signIn,
  });
}

export function useChangePassword() {
  const setTokens = useAuth((s) => s.setTokens);
  return useMutation({
    mutationFn: (body: { current_password: string; password: string }) =>
      api<TokenPair>('/auth/password/change', { method: 'POST', body }),
    onSuccess: setTokens,
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

// ---------------- owner: my listings ----------------

export function useMyListings(enabled = true) {
  return useQuery({
    queryKey: ['my-listings'],
    queryFn: () => api<ListingCard[]>('/listings/mine'),
    enabled,
  });
}

/** After any owner change, refresh everything that shows listings. */
function useRefreshListings() {
  const qc = useQueryClient();
  return (listing?: Listing) => {
    if (listing) qc.setQueryData(['listing', listing.id], listing);
    qc.invalidateQueries({ queryKey: ['my-listings'] });
    qc.invalidateQueries({ queryKey: ['search'] });
    qc.invalidateQueries({ queryKey: ['map-search'] });
  };
}

export function useCreateListing() {
  const refresh = useRefreshListings();
  return useMutation({
    mutationFn: (body: ListingInput) => api<Listing>('/listings', { method: 'POST', body }),
    onSuccess: (listing) => refresh(listing),
  });
}

export function useUpdateListing(id: string) {
  const refresh = useRefreshListings();
  return useMutation({
    mutationFn: (body: Partial<ListingInput>) => api<Listing>(`/listings/${id}`, { method: 'PATCH', body }),
    onSuccess: (listing) => refresh(listing),
  });
}

export type ListingAction = 'publish' | 'confirm-available' | 'mark-rented';

export function useListingAction() {
  const refresh = useRefreshListings();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ListingAction }) =>
      api<Listing>(`/listings/${id}/${action}`, { method: 'POST' }),
    onSuccess: (listing) => refresh(listing),
  });
}

export function useDeleteListing() {
  const refresh = useRefreshListings();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/listings/${id}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
  });
}

export function useDeletePhoto(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => api<void>(`/listings/${listingId}/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['listing', listingId] });
      qc.invalidateQueries({ queryKey: ['my-listings'] });
    },
  });
}

export function useReorderPhotos(listingId: string) {
  const refresh = useRefreshListings();
  return useMutation({
    mutationFn: (photoIds: string[]) =>
      api<Listing>(`/listings/${listingId}/photos/order`, { method: 'PUT', body: { photo_ids: photoIds } }),
    onSuccess: (listing) => refresh(listing),
  });
}
