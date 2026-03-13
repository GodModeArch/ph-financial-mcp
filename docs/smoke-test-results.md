# Smoke Test Results

Run: 2026-03-13T08:58:31.264Z
Banks: 587 | Branches: 37834 | Population entries: 1756

14 tools, 1 call each.

---

### search_banks
```json
// Params: {"query":"BDO"}
{
  "total": 6,
  "first_3": [
    {
      "code": "166107",
      "name": "BDO Capital & Investment Corporation",
      "type": "non_bank_fi"
    },
    {
      "code": "166102",
      "name": "BDO Finance Corporation",
      "type": "non_bank_fi"
    },
    {
      "code": "165698",
      "name": "BDO Network Bank, Inc.",
      "type": "thrift"
    }
  ]
}
```

### get_bank
```json
// Params: {"institution_code":"165713"}
{
  "code": "165713",
  "name": "Banco Cooperativa De Zamboanga",
  "type": "cooperative",
  "status": "active"
}
```

### list_banks_by_type
```json
// Params: {"bank_type":"digital"}
{
  "total": 6,
  "banks": [
    {
      "code": "166076",
      "name": "GoTyme Bank Corporation"
    },
    {
      "code": "166073",
      "name": "Maya Bank, Inc."
    },
    {
      "code": "166071",
      "name": "Overseas Filipino Bank, Inc., A Digital Bank of LANDBANK"
    },
    {
      "code": "166072",
      "name": "Tonik Digital Bank, Inc."
    },
    {
      "code": "166075",
      "name": "UnionDigital Bank, Inc."
    },
    {
      "code": "166074",
      "name": "UNObank, Inc."
    }
  ]
}
```

### list_banks_by_location
```json
// Params: {"psgc_code":"1300000000 (NCR)"}
{
  "total": 201,
  "first_5": [
    "Network Consolidated Cooperative Bank",
    "One Cooperative Bank",
    "GoTyme Bank Corporation",
    "Maya Bank, Inc.",
    "Overseas Filipino Bank, Inc., A Digital Bank of LANDBANK"
  ]
}
```

### get_bank_stats
```json
// Params: {}
{
  "total": 587,
  "total_active": 587,
  "total_inactive": 0,
  "by_type": {
    "cooperative": 21,
    "digital": 6,
    "non_bank_fi": 109,
    "quasi_bank": 5,
    "rural": 351,
    "thrift": 42,
    "universal_commercial": 53
  },
  "by_region": {
    "1000000000": 18,
    "1100000000": 10,
    "1200000000": 6,
    "1300000000": 201,
    "1400000000": 27,
    "1600000000": 5,
    "1700000000": 15,
    "1800000000": 18,
    "0900000000": 14,
    "0200000000": 26,
    "0700000000": 22,
    "0100000000": 36,
    "0400000000": 70,
    "0300000000": 68,
    "0600000000": 26,
    "0500000000": 15,
    "0800000000": 9
  },
  "by_status": {
    "active": 587
  }
}
```

### get_banking_density
```json
// Params: {"psgc_code":"1300000000 (NCR)"}
{
  "psgc_code": "1300000000",
  "area_name": "National Capital Region (NCR)",
  "area_level": "Region",
  "population": 14001751,
  "bank_count": 201,
  "population_per_bank": 69660,
  "by_type": {
    "cooperative": 2,
    "digital": 6,
    "non_bank_fi": 96,
    "quasi_bank": 4,
    "rural": 24,
    "thrift": 17,
    "universal_commercial": 52
  },
  "data_notes": [
    "Population: 2024 Census of Population (PSA). This is a point-in-time count and may not reflect current population.",
    "Bank count: based on BSP-registered head office locations only. Branch/office locations are not included.",
    "A municipality with 0 banks may still be served by branches of banks headquartered elsewhere."
  ]
}
```

### find_underbanked_areas
```json
// Params: {"level":"region","limit":5}
[
  {
    "psgc_code": "1900000000",
    "area_name": "Bangsamoro Autonomous Region In Muslim Mindanao (BARMM)",
    "area_level": "Region",
    "population": 4545486,
    "bank_count": 0,
    "population_per_bank": 4545486
  },
  {
    "psgc_code": "1200000000",
    "area_name": "Region XII (SOCCSKSARGEN)",
    "area_level": "Region",
    "population": 4462776,
    "bank_count": 6,
    "population_per_bank": 743796
  },
  {
    "psgc_code": "1600000000",
    "area_name": "Region XIII (Caraga)",
    "area_level": "Region",
    "population": 2865196,
    "bank_count": 5,
    "population_per_bank": 573039
  },
  {
    "psgc_code": "1100000000",
    "area_name": "Region XI (Davao Region)",
    "area_level": "Region",
    "population": 5389422,
    "bank_count": 10,
    "population_per_bank": 538942
  },
  {
    "psgc_code": "0800000000",
    "area_name": "Region VIII (Eastern Visayas)",
    "area_level": "Region",
    "population": 4625929,
    "bank_count": 9,
    "population_per_bank": 513992
  }
]
```

### search_branches
```json
// Params: {"query":"BDO","industry":"ATM ONLY"}
{
  "total": 2282,
  "first_3": [
    {
      "id": "17135",
      "institution": "BDO UNIBANK INC",
      "branch": "SM MEGA B",
      "town": "MANDALUYONG CITY"
    },
    {
      "id": "17136",
      "institution": "BDO UNIBANK INC",
      "branch": "SM CUBAO",
      "town": "QUEZON CITY"
    },
    {
      "id": "17137",
      "institution": "BDO UNIBANK INC",
      "branch": "SM QUIAPO",
      "town": "QUIAPO (CITY DIST.)"
    }
  ]
}
```

### get_branch
```json
// Params: {"id":"1"}
{
  "id": "1",
  "institution_name": "CTBC BANK (PHILIPPINES) CORP",
  "branch_name": "HEAD OFFICE",
  "industry": "BANK",
  "address": "16th to 19th Floors, Fort Legend Towers, 31st Street cor. 3rd Ave., Bonifacio Global City, Taguig City",
  "town": "TAGUIG CITY",
  "province": "4TH DISTRICT METRO MANILA",
  "region": "NATIONAL CAPITAL REGION",
  "latitude": 14.5539393,
  "longitude": 121.0468744,
  "has_atm": false,
  "psgc_muni_code": "1381500000",
  "region_code": "1300000000",
  "province_code": "1381000000"
}
```

### get_coverage
```json
// Params: {"psgc_code":"1300000000 (NCR)"}
{
  "psgc_code": "1300000000",
  "area_name": "National Capital Region (NCR)",
  "area_level": "Region",
  "population": 14001751,
  "total_access_points": 11826,
  "bank_branches": 8330,
  "atm_only": 3438,
  "nssla": 58,
  "unique_institutions": 2966,
  "with_atm": 8076,
  "population_per_access_point": 1184,
  "data_notes": [
    "Population: 2024 Census of Population (PSA). Point-in-time count.",
    "Branch data: BSP-supervised financial institution offices (banks, NSSLAs, ATM-only locations).",
    "Coverage counts include all access point types: bank branches, ATM-only, and NSSLAs."
  ]
}
```

### find_unbanked_areas
```json
// Params: {"region_code":"1900000000 (BARMM)","limit":10}
{
  "total": 10,
  "areas": [
    {
      "psgc_code": "1900705000",
      "area_name": "Sumisip",
      "population": 55778
    },
    {
      "psgc_code": "1907001000",
      "area_name": "Panglima Sugala",
      "population": 52657
    },
    {
      "psgc_code": "1903611000",
      "area_name": "Lumba-Bayabao",
      "population": 50959
    },
    {
      "psgc_code": "1908822000",
      "area_name": "South Upi",
      "population": 50018
    },
    {
      "psgc_code": "1908816000",
      "area_name": "Pagalungan",
      "population": 49326
    },
    {
      "psgc_code": "1900703000",
      "area_name": "Lantawan",
      "population": 48777
    },
    {
      "psgc_code": "1903616000",
      "area_name": "Marantao",
      "population": 46233
    },
    {
      "psgc_code": "1908702000",
      "area_name": "Buldon",
      "population": 45676
    },
    {
      "psgc_code": "1908701000",
      "area_name": "Barira",
      "population": 43301
    },
    {
      "psgc_code": "1908815000",
      "area_name": "Pagagawan",
      "population": 42181
    }
  ]
}
```

### find_underserved_areas
```json
// Params: {"level":"province","limit":10}
[
  {
    "psgc_code": "1900700000",
    "area_name": "Basilan",
    "area_level": "Province",
    "population": 541947,
    "access_point_count": 8,
    "population_per_access_point": 67743
  },
  {
    "psgc_code": "0906600000",
    "area_name": "Sulu",
    "area_level": "Province",
    "population": 1146097,
    "access_point_count": 18,
    "population_per_access_point": 63672
  },
  {
    "psgc_code": "1907000000",
    "area_name": "Tawi-Tawi",
    "area_level": "Province",
    "population": 482645,
    "access_point_count": 9,
    "population_per_access_point": 53627
  },
  {
    "psgc_code": "1903600000",
    "area_name": "Lanao del Sur",
    "area_level": "Province",
    "population": 1368137,
    "access_point_count": 38,
    "population_per_access_point": 36004
  },
  {
    "psgc_code": "1208000000",
    "area_name": "Sarangani",
    "area_level": "Province",
    "population": 580915,
    "access_point_count": 53,
    "population_per_access_point": 10961
  },
  {
    "psgc_code": "1908700000",
    "area_name": "Maguindanao del Norte",
    "area_level": "Province",
    "population": 1124811,
    "access_point_count": 103,
    "population_per_access_point": 10920
  },
  {
  ... (32 more lines truncated)
```

### get_institution_footprint
```json
// Params: {"institution_name":"LANDBANK"}
{
  "institution_name": "OVERSEAS FILIPINO BANK INC A DIGITAL BANK OF LANDBANK",
  "total_branches": 1,
  "by_region": {
    "NATIONAL CAPITAL REGION": 1
  },
  "by_province": {
    "1ST DIST M.M. (CITY OF MANILA)": 1
  },
  "with_atm": 0,
  "industries": {
    "BANK": 1
  }
}
```

### compare_coverage
```json
// Params: {"psgc_code_a":"1300000000 (NCR)","psgc_code_b":"1900000000 (BARMM)"}
{
  "area_a": {
    "psgc_code": "1300000000",
    "area_name": "National Capital Region (NCR)",
    "area_level": "Region",
    "population": 14001751,
    "total_access_points": 11826,
    "bank_branches": 8330,
    "atm_only": 3438,
    "nssla": 58,
    "unique_institutions": 2966,
    "with_atm": 8076,
    "population_per_access_point": 1184,
    "data_notes": [
      "Population: 2024 Census of Population (PSA). Point-in-time count.",
      "Branch data: BSP-supervised financial institution offices (banks, NSSLAs, ATM-only locations).",
      "Coverage counts include all access point types: bank branches, ATM-only, and NSSLAs."
    ]
  },
  "area_b": {
    "psgc_code": "1900000000",
    "area_name": "Bangsamoro Autonomous Region In Muslim Mindanao (BARMM)",
    "area_level": "Region",
    "population": 4545486,
    "total_access_points": 158,
    "bank_branches": 106,
    "atm_only": 50,
    "nssla": 2,
    "unique_institutions": 49,
    "with_atm": 110,
    "population_per_access_point": 28769,
    "data_notes": [
      "Population: 2024 Census of Population (PSA). Point-in-time count.",
      "Branch data: BSP-supervised financial institution offices (banks, NSSLAs, ATM-only locations).",
      "Coverage counts include all access point types: bank branches, ATM-only, and NSSLAs."
    ]
  }
}
```
