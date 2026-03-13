#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-data/raw}"
mkdir -p "$TARGET_DIR"

URLS=(
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/1/ukb.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/2/thrift.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/3/rural.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/4/coop.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/5/digital.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/7/emi.pdf"
  "https://www.bsp.gov.ph/Lists/Directories/Attachments/6/quasi.pdf"
)

NAMES=(
  "ukb.pdf"
  "thrift.pdf"
  "rural.pdf"
  "cooperative.pdf"
  "digital.pdf"
  "emi.pdf"
  "quasi.pdf"
)

for i in "${!URLS[@]}"; do
  echo "Downloading ${NAMES[$i]}..."
  curl -sL -o "$TARGET_DIR/${NAMES[$i]}" "${URLS[$i]}" || echo "WARN: Failed to download ${NAMES[$i]}"
done

# AMLC covered persons list
echo "Downloading AMLC covered persons list..."
curl -sL -o "$TARGET_DIR/amlc-covered-persons.pdf" \
  "https://www.amlc.gov.ph/images/PDFs/LISTS%20OF%20BSP%20COVERED%20PERSONS.pdf" \
  || echo "WARN: Failed to download AMLC list"

echo "Done. Check $TARGET_DIR/ for downloaded files."
