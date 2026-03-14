// ============================================================
// Lead Hunter Agents — Core Types
// Aligned with teammate's Google Places schema
// ============================================================

/** Trade categories — extensible string union for all trade types */
export type TradeCategory =
  | 'hvac'
  | 'electrical'
  | 'plumbing'
  | 'lawn care'
  | 'roofing'
  | 'painting'
  | 'carpet cleaning'
  | 'appliance repair'
  | 'tree service'
  | 'fencing'
  | 'concrete'
  | 'handyman'
  | 'pest control'
  | 'garage door repair'
  | string; // allow any trade for extensibility

/** Contact person associated with a lead */
export interface Contact {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
}

/**
 * Core lead schema — matches teammate's Google Places output.
 * This is the canonical shape used across all agents and storage.
 */
export interface Lead {
  id: string;                       // e.g. "google_places_ChIJ..."
  company_name: string;
  trade_category: TradeCategory;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  has_website: boolean;
  contacts: Contact[];
  google_place_id: string | null;
  business_status: string;          // "OPERATIONAL", "CLOSED", etc.
  collected_at: string;             // ISO timestamp
  metadata: {
    search_query: string;
    location: string;
    [key: string]: unknown;         // allow extra metadata
  };
}

/** Per-city file schema — matches teammate's JSON file structure */
export interface CityLeadsFile {
  city: string;
  leads: Lead[];
  updated_at: string;
}

/** Lead with qualification data attached */
export interface QualifiedLead extends Lead {
  qualification_score: number;      // 0-100
  qualification_reasons: string[];
}

/** Lead after enrichment — extra data gathered from website visits */
export interface EnrichedLead extends QualifiedLead {
  owner_name?: string;
  social_profiles?: {
    facebook?: string;
    instagram?: string;
    yelp?: string;
    google?: string;
  };
  services?: string[];
  years_in_business?: number;
  enriched_at: string;
}

/** Final lead in the database with pipeline status tracking */
export interface StoredLead extends EnrichedLead {
  status: 'new' | 'contacted' | 'replied' | 'qualified' | 'lost';
  created_at: string;
  updated_at: string;
  notes?: string;
}

/** Configuration for search queries */
export interface SearchConfig {
  trades: TradeCategory[];
  locations: string[];
  maxResultsPerQuery: number;
  minQualificationScore: number;
  rotateQueries: boolean;
}

/** Agent execution result */
export interface AgentResult<T = unknown> {
  agentName: string;
  success: boolean;
  data: T;
  itemsProcessed: number;
  errors: string[];
  durationMs: number;
}

/** Pipeline run summary */
export interface PipelineRun {
  runId: string;
  startedAt: string;
  completedAt?: string;
  config: SearchConfig;
  results: {
    searched: number;
    qualified: number;
    enriched: number;
    stored: number;
    duplicatesSkipped: number;
  };
  agentResults: AgentResult[];
}
