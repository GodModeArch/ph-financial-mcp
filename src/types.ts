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
  bsp_type_id: number;
  bsp_type_id2: number;
  bsp_type_id3: number;
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
  num_offices?: number;
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
