// Types that mirror the backend's JSON responses (see backend/app/modules/*/schemas.py).

export type Role = 'tenant' | 'owner' | 'agent' | 'admin';
export type Language = 'en' | 'ne';
export type ListingType = 'room' | '1bhk' | '2bhk' | '3bhk' | 'flat';
export type Furnishing = 'unfurnished' | 'semi' | 'full';
export type SortOption = 'freshness' | 'price_low' | 'price_high' | 'distance' | 'newest';

export interface User {
  id: string;
  phone: string;
  full_name: string | null;
  role: Role;
  language: Language;
  onboarding_completed: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface LoginResponse extends TokenPair {
  user: User;
  is_new_user: boolean;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ListingCard {
  id: string;
  listing_type: ListingType;
  title: string;
  rent: number;
  total_monthly_cost: number;
  deposit: number;
  area: string;
  landmark: string | null;
  amenities: string[];
  cover_photo_url: string | null;
  photo_count: number;
  approx_location: LatLng;
  listed_by_role: Role;
  last_confirmed_at: string | null;
  distance_m: number | null;
}

export interface Listing {
  id: string;
  listing_type: ListingType;
  status: 'draft' | 'active' | 'rented' | 'expired' | 'removed';
  title: string;
  description: string | null;
  deposit: number;
  cost: {
    rent: number;
    water: number;
    waste: number;
    internet: number;
    parking: number;
    total_monthly: number;
  };
  agent_commission: number | null;
  amenities: string[];
  furnishing: Furnishing;
  floor: number | null;
  max_occupants: number | null;
  available_from: string | null;
  area: string;
  landmark: string | null;
  approx_location: LatLng;
  photos: { id: string; url: string; position: number }[];
  listed_by: { name: string | null; role: Role; phone_verified: boolean };
  last_confirmed_at: string | null;
  published_at: string | null;
  created_at: string;
}

export interface Place {
  slug: string;
  name: string;
  name_ne: string;
  kind: 'area' | 'landmark';
  lat: number;
  lng: number;
}

export interface SearchResults {
  items: ListingCard[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  center: { lat: number; lng: number; radius_km: number; place: string | null } | null;
}

export interface SearchFilters {
  place?: string;
  radius_km?: number;
  min_rent?: number;
  max_rent?: number;
  types?: ListingType[];
  amenities?: string[];
  sort?: SortOption;
}
