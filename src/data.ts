import type { Bank, BankType, BankStatus } from "./types.js";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface SearchParams {
  query: string;
  bank_type?: BankType;
  status?: BankStatus;
}

export function searchBanks(banks: Bank[], params: SearchParams): Bank[] {
  const { query, bank_type, status = "active" } = params;
  const normalizedQuery = normalize(query);

  const scored: { bank: Bank; score: number }[] = [];

  for (const bank of banks) {
    if (bank.status !== status) continue;
    if (bank_type && bank.bank_type !== bank_type) continue;

    const normName = normalize(bank.registration_name);
    const normTrade = bank.trade_name ? normalize(bank.trade_name) : "";

    let score = 0;

    if (normName === normalizedQuery || normTrade === normalizedQuery) {
      score = 3;
    } else if (normName.startsWith(normalizedQuery) || normTrade.startsWith(normalizedQuery)) {
      score = 2;
    } else if (normName.includes(normalizedQuery) || normTrade.includes(normalizedQuery)) {
      score = 1;
    }

    if (score > 0) {
      scored.push({ bank, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.bank.registration_name.localeCompare(b.bank.registration_name);
  });

  return scored.map((s) => s.bank);
}

export function getBankByCode(banks: Bank[], code: string): Bank | undefined {
  return banks.find((b) => b.institution_code === code);
}

interface ListByTypeParams {
  bank_type: BankType;
  status?: BankStatus;
}

export function listByType(banks: Bank[], params: ListByTypeParams): Bank[] {
  const { bank_type, status = "active" } = params;
  return banks.filter((b) => b.bank_type === bank_type && b.status === status);
}

interface ListByLocationParams {
  psgc_code: string;
  bank_type?: BankType;
}

export function listByLocation(banks: Bank[], params: ListByLocationParams): Bank[] {
  const { psgc_code, bank_type } = params;

  return banks.filter((b) => {
    if (b.status !== "active") return false;
    if (bank_type && b.bank_type !== bank_type) return false;

    const isRegionCode = psgc_code.endsWith("00000000");
    const isProvinceCode = !isRegionCode && psgc_code.endsWith("000000");

    if (isRegionCode) {
      return b.region_code === psgc_code;
    } else if (isProvinceCode) {
      return b.province_code === psgc_code;
    } else {
      return b.psgc_muni_code === psgc_code;
    }
  });
}

interface BankStats {
  total: number;
  total_active: number;
  total_closed: number;
  by_type: Record<string, number>;
  by_region: Record<string, number>;
  by_status: Record<string, number>;
}

export function getBankStats(banks: Bank[]): BankStats {
  const by_type: Record<string, number> = {};
  const by_region: Record<string, number> = {};
  const by_status: Record<string, number> = {};

  for (const bank of banks) {
    by_type[bank.bank_type] = (by_type[bank.bank_type] || 0) + 1;
    by_status[bank.status] = (by_status[bank.status] || 0) + 1;

    if (bank.region_code) {
      by_region[bank.region_code] = (by_region[bank.region_code] || 0) + 1;
    }
  }

  return {
    total: banks.length,
    total_active: banks.filter((b) => b.status === "active").length,
    total_closed: banks.filter((b) => b.status !== "active").length,
    by_type,
    by_region,
    by_status,
  };
}
