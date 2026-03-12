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
  institution_code: string;
  registration_name: string;
  trade_name?: string;
  bank_type: BankType;
  status: BankStatus;
  head_office_address: string;
  psgc_muni_code?: string;
  region_code?: string;
  province_code?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  merged_into?: string;
  date_sourced: string;
  source_document: string;
}

export interface Env {
  DATASET_VERSION: string;
  DATASET_DATE: string;
  LAST_SYNCED: string;
}

export interface ApiMeta {
  dataset_version: string;
  dataset_date: string;
  last_synced: string;
  source: string;
  source_url: string;
}
