/**
 * Types mirroring the Orthogonal API surface.
 * Source: https://docs.orthogonal.com/api-reference
 *
 * Orthogonal is a pay-per-call proxy over a catalog of third-party APIs.
 * It exposes four primitives we care about: search, list-endpoints, details, run.
 */

export interface OrthogonalEndpoint {
  id?: string;
  path: string;
  method?: string;
  description?: string;
  /** Price per call in USD. Docs show a string; live API returns a number. */
  price?: number | string;
  isPayable?: boolean;
  verified?: boolean;
  /** Semantic relevance score 0..1 (present on search results). */
  score?: number;
}

export interface OrthogonalApi {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  baseUrl?: string;
  payableBaseUrl?: string;
  verified?: boolean;
  endpoints: OrthogonalEndpoint[];
}

export interface SearchResponse {
  success: boolean;
  results: OrthogonalApi[];
  count: number;
  apisCount: number;
  prompt: string;
  searchType?: string;
  responseTime?: number;
}

export interface ListEndpointsResponse {
  success: boolean;
  apis: OrthogonalApi[];
  count: number;
  totalEndpoints: number;
  pagination: { limit: number; offset: number; hasMore: boolean };
}

/** A single documented parameter for an endpoint (from /v1/details). */
export interface EndpointParam {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
}

/**
 * Shape verified against the live API (2026-07): params are split into
 * pathParams/queryParams/bodyParams, price is a number, and a `usage` object
 * shows how to invoke via /v1/run.
 */
export interface DetailsEndpoint {
  path: string;
  method?: string;
  description?: string;
  isPayable?: boolean;
  price?: number;
  hasDynamicPricing?: boolean;
  docsUrl?: string | null;
  bodyType?: string;
  pathParams?: EndpointParam[];
  queryParams?: EndpointParam[];
  bodyParams?: EndpointParam[];
}

export interface DetailsResponse {
  success: boolean;
  api: Omit<OrthogonalApi, "endpoints">;
  endpoint: DetailsEndpoint;
  endpoints?: DetailsEndpoint[];
  usage?: { runApi?: string; x402?: string };
}

export interface RunResponse<T = unknown> {
  success: boolean;
  /** Amount charged for this call, in US cents. */
  priceCents?: number;
  data: T;
  requestId?: string;
}

/** Normalised error body per the docs: { success:false, error, code }. */
export interface OrthogonalErrorBody {
  success: false;
  error?: string;
  message?: string;
  code?: string;
  requestId?: string;
}
