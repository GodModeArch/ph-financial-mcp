export type BankType =
  | "universal_commercial"
  | "thrift"
  | "rural"
  | "cooperative"
  | "digital"
  | "emi_bank"
  | "emi_nonbank"
  | "quasi_bank"
  | "non_bank_fi";

export type BankStatus = "active" | "closed" | "under_receivership" | "merged";

export interface Bank {
  /** BSP SharePoint list item ID. Stable across ETL runs. */
  institution_code: string;
  registration_name: string;
  trade_name?: string;
  bank_type: BankType;
  bsp_type_id: string;
  bsp_type_id2: string;
  bsp_type_id3: string;
  status: BankStatus;
  head_office_address: string;
  psgc_muni_code?: string;
  region_code?: string;
  province_code?: string;
  contact_person?: string;
  contact_title?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  fax?: string;
  num_offices?: string;
  merged_into?: string;
  date_sourced: string;
  source_document: string;
}

export interface ApiMeta {
  dataset_version: string;
  dataset_date: string;
  last_synced: string;
  source: string;
  source_url: string;
}

export interface PopulationEntry {
  name: string;
  level: string;
  population: number;
  region_code: string | null;
  province_code: string | null;
}

export type PopulationLookup = Record<string, PopulationEntry>;

export interface DensityResult {
  psgc_code: string;
  area_name: string;
  area_level: string;
  population: number;
  bank_count: number;
  population_per_bank: number | null;
  by_type: Record<string, number>;
  data_notes: string[];
}

export interface UnderbankedArea {
  psgc_code: string;
  area_name: string;
  area_level: string;
  population: number;
  bank_count: number;
  population_per_bank: number;
}

export interface Branch {
  id: string;
  institution_name: string;
  branch_name: string;
  industry: string;
  address: string;
  town: string;
  province: string;
  region: string;
  psgc_muni_code?: string;
  region_code?: string;
  province_code?: string;
  latitude: number | null;
  longitude: number | null;
  has_atm: boolean;
}

export interface CoverageResult {
  psgc_code: string;
  area_name: string;
  area_level: string;
  population: number;
  total_access_points: number;
  bank_branches: number;
  atm_only: number;
  nssla: number;
  unique_institutions: number;
  with_atm: number;
  population_per_access_point: number | null;
  data_notes: string[];
}

export interface InstitutionFootprint {
  institution_name: string;
  total_branches: number;
  by_region: Record<string, number>;
  by_province: Record<string, number>;
  with_atm: number;
  industries: Record<string, number>;
}
