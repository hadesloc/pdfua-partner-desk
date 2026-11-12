/**
 * ClearStream Ledger — 100% Client-Side Whatnot CSV -> Xero/QBO Clearing Journal
 * & USPS 45-Day Carrier Adjustment Appeal Engine.
 *
 * Bookkeeping & carrier-dispute formatting assistance tool — not tax, accounting, or legal advice.
 * Zero server uploads; buyer PII columns are ignored and never included in exports.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ClearStreamEngine = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const APPEAL_WINDOW_DAYS = 45;

  const DEFAULT_ACCOUNTS = {
    xero: {
      clearing: { code: "1050", taxRate: "BAS Excluded" },
      grossSales: { code: "200", taxRate: "Tax Exempt (0%)" },
      shippingIncome: { code: "205", taxRate: "Tax Exempt (0%)" },
      otherIncome: { code: "206", taxRate: "Tax Exempt (0%)" },
      refunds: { code: "209", taxRate: "Tax Exempt (0%)" },
      commission: { code: "408", taxRate: "Tax Exempt (0%)" },
      processing: { code: "409", taxRate: "Tax Exempt (0%)" },
      vatOnFees: { code: "410", taxRate: "Tax Exempt (0%)" },
      sellerShipping: { code: "429", taxRate: "Tax Exempt (0%)" },
      carrierAdjustments: { code: "430", taxRate: "Tax Exempt (0%)" },
      settlementVariance: { code: "435", taxRate: "BAS Excluded" }
    },
    qbo: {
      clearing: "1050 Whatnot Clearing Account",
      grossSales: "Sales:Whatnot Gross Sales",
      shippingIncome: "Sales:Shipping & Handling Collected",
      otherIncome: "Sales:Tips & Marketplace Credits",
      refunds: "Sales:Refunds & Chargebacks",
      commission: "Cost of Sales:Whatnot Seller Commission",
      processing: "Merchant Fees:Payment Processing (2.9% + $0.30)",
      vatOnFees: "Taxes & Licenses:VAT on Marketplace Fees",
      sellerShipping: "Shipping & Delivery:Giveaway & Seller Labels",
      carrierAdjustments: "Shipping & Delivery:USPS Carrier Weight Adjustments",
      settlementVariance: "Ask My Accountant:Unclassified Ledger Variance"
    }
  };

  const FIELD_DEFINITIONS = [
    {
      key: "orderId",
      label: "Order / Shipment ID",
      aliases: ["order id", "order numeric id", "order_id", "shipment id", "transaction id", "ledger id", "id"]
    },
    {
      key: "transactionDate",
      label: "Transaction / Charge Date",
      aliases: [
        "transaction completed at utc",
        "order placed at utc",
        "charged date",
        "adjustment date",
        "processed date",
        "created at",
        "date",
        "transaction date"
      ]
    },
    {
      key: "transactionType",
      label: "Transaction Type",
      aliases: ["transaction type", "type", "entry type", "ledger type", "order style", "order status"]
    },
    {
      key: "payoutBatchId",
      label: "Payout Batch / Statement Week",
      aliases: ["payout id", "payout batch id", "settlement id", "batch id", "report start date", "week number", "statement period"]
    },
    {
      key: "payoutDate",
      label: "Payout / Settlement Date",
      aliases: ["payout date", "settlement date", "transfer date", "deposit date"]
    },
    {
      key: "category",
      label: "Product / Show Category",
      aliases: ["product category", "category", "show category", "sub category"]
    },
    {
      key: "grossSale",
      label: "Gross Item Sale ($)",
      aliases: ["sold price", "subtotal", "gross sales", "item price", "sale price", "order subtotal", "gross amount"]
    },
    {
      key: "buyerShipping",
      label: "Buyer-Paid Shipping ($)",
      aliases: ["shipping price", "buyer shipping", "shipping collected", "buyer paid shipping"]
    },
    {
      key: "salesTax",
      label: "Facilitated Sales Tax ($)",
      aliases: ["taxes", "sales tax", "tax", "tax collected"]
    },
    {
      key: "commissionFee",
      label: "Whatnot Commission ($)",
      aliases: ["commission", "seller fee", "commission fee", "whatnot commission", "platform fee", "marketplace commission"]
    },
    {
      key: "processingFee",
      label: "Payment Processing Fee ($)",
      aliases: ["payment processing fee", "processing fee", "transaction fee", "stripe fee", "payment fee"]
    },
    {
      key: "vatOnFees",
      label: "VAT on Fees (UK/EU)",
      aliases: ["vat on fees", "fee vat", "tax on fees", "vat"]
    },
    {
      key: "sellerShippingCost",
      label: "Seller / Giveaway Label Cost ($)",
      aliases: ["seller shipping", "giveaway shipping", "seller paid shipping", "label cost", "giveaway label cost"]
    },
    {
      key: "carrierAdjustment",
      label: "Carrier / USPS Adjustment ($)",
      aliases: [
        "carrier adjustment",
        "usps adjustment",
        "adjustment amount",
        "shipping adjustment",
        "additional shipping cost",
        "weight adjustment",
        "charged amount"
      ]
    },
    {
      key: "refundAmount",
      label: "Refund / Billback ($)",
      aliases: ["refund amount", "order refund", "refund", "billback", "chargeback"]
    },
    {
      key: "tipsAmount",
      label: "Tips / Seller Credits ($)",
      aliases: ["tip", "tips", "seller tip", "bonus", "credit"]
    },
    {
      key: "netAmount",
      label: "Net Ledger Impact ($)",
      aliases: ["net earnings", "net amount", "ledger amount", "net payout", "payout impact", "amount", "seller earnings"]
    },
    {
      key: "trackingNumber",
      label: "USPS / Carrier Tracking #",
      aliases: ["tracking number", "usps tracking", "tracking", "tracking code", "label tracking"]
    },
    {
      key: "labelWeightOz",
      label: "Label Billed Weight (oz)",
      aliases: ["label weight (oz)", "label weight oz", "label weight", "declared weight (oz)", "billed label weight", "profile weight oz"]
    },
    {
      key: "carrierWeightOz",
      label: "Carrier Measured Weight (oz)",
      aliases: [
        "carrier weight (oz)",
        "usps measured weight (oz)",
        "carrier weight oz",
        "scanned weight (oz)",
        "actual weight (oz)",
        "audited weight",
        "measured weight"
      ]
    },
    {
      key: "expectedWeightOz",
      label: "Expected SKU + Tare Weight (oz)",
      aliases: ["expected packed weight (oz)", "expected weight (oz)", "expected weight oz", "sku + tare oz", "packed weight oz"]
    },
    {
      key: "mailClass",
      label: "Mail Class / Packaging",
      aliases: ["mail class", "service", "shipping service", "package type", "carrier service"]
    },
    {
      key: "boxDims",
      label: "Package Dimensions (in)",
      aliases: ["package dimensions", "box dimensions", "dimensions", "box dims"]
    },
    {
      key: "adjustmentReason",
      label: "Carrier Adjustment Reason",
      aliases: ["adjustment reason", "carrier reason", "reason code", "discrepancy reason", "reason"]
    }
  ];

  // Forbidden platform-internal terms that USPS APV reviewers do not recognize
  const JARGON_PATTERNS = [
    { regex: /\bsmart\s*bundl(?:ing|e|ed)\b/gi, replacement: "consolidated single-parcel shipment" },
    { regex: /\bmax\s*bundle\s*size\b/gi, replacement: "parcel weight threshold" },
    { regex: /\bwhatnot\b/gi, replacement: "third-party shipping platform" },
    { regex: /\blivestream(?:s|ing)?\b/gi, replacement: "fulfillment batch" },
    { regex: /\blive\s*show\b/gi, replacement: "fulfillment batch" },
    { regex: /\bcase\s*break(?:s|er)?\b/gi, replacement: "merchandise unit" },
    { regex: /\bgiveaway\b|\bgivy\b|\bgivvy\b/gi, replacement: "promotional parcel" },
    { regex: /\bpremier\s*shop\b/gi, replacement: "shipper account" }
  ];

  function detectDelimiter(sampleLine) {
    const counts = {
      ",": (sampleLine.match(/,/g) || []).length,
      "\t": (sampleLine.match(/\t/g) || []).length,
      ";": (sampleLine.match(/;/g) || []).length
    };
    if (counts["\t"] > counts[","] && counts["\t"] >= counts[";"]) return "\t";
    if (counts[";"] > counts[","]) return ";";
    return ",";
  }

  /**
   * RFC-4180 compliant CSV parser (used directly in Node tests and as fallback if PapaParse is absent).
   */
  function parseCsvFallback(csvText) {
    const clean = String(csvText || "").replace(/^\uFEFF/, "");
    if (!clean.trim()) {
      return { headers: [], rows: [] };
    }
    const firstNewline = clean.indexOf("\n");
    const firstLine = firstNewline === -1 ? clean : clean.slice(0, firstNewline);
    const delim = detectDelimiter(firstLine);

    const matrix = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field);
        field = "";
      } else if (ch === "\r") {
        if (clean[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        if (row.some((cell) => cell.trim() !== "")) matrix.push(row);
        row = [];
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        if (row.some((cell) => cell.trim() !== "")) matrix.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) {
      matrix.push(row);
    }
    if (matrix.length === 0) {
      return { headers: [], rows: [] };
    }
    const headers = matrix[0].map((h) => h.trim());
    const rows = matrix.slice(1).map((cells) => {
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        if (headers[c]) {
          obj[headers[c]] = cells[c] !== undefined ? cells[c].trim() : "";
        }
      }
      return obj;
    });
    return { headers, rows };
  }

  function parseCsvText(csvText, papaInstance) {
    const clean = String(csvText || "").replace(/^\uFEFF/, "");
    if (!clean.trim()) {
      return { headers: [], rows: [] };
    }
    const papa = papaInstance || (typeof globalThis !== "undefined" ? globalThis.Papa : null);
    if (papa && typeof papa.parse === "function") {
      const parsed = papa.parse(clean, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: function (h) {
          return String(h || "").trim();
        }
      });
      const headers = (parsed.meta && Array.isArray(parsed.meta.fields) ? parsed.meta.fields : []).filter(Boolean);
      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      return { headers, rows };
    }
    return parseCsvFallback(clean);
  }

  function normalizeHeader(h) {
    return String(h || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function autoDetectColumnMap(headers) {
    const map = {};
    const usedHeaders = new Set();
    const normLookup = headers.map((raw) => ({ raw, norm: normalizeHeader(raw) }));

    // Pass 1: Exact alias match
    for (const def of FIELD_DEFINITIONS) {
      map[def.key] = "";
      for (const alias of def.aliases) {
        const match = normLookup.find((item) => !usedHeaders.has(item.raw) && item.norm === alias);
        if (match) {
          map[def.key] = match.raw;
          usedHeaders.add(match.raw);
          break;
        }
      }
    }

    // Pass 2: Substring match for remaining unmapped fields
    for (const def of FIELD_DEFINITIONS) {
      if (map[def.key]) continue;
      for (const alias of def.aliases) {
        if (alias.length < 4) continue;
        const match = normLookup.find((item) => !usedHeaders.has(item.raw) && item.norm.includes(alias));
        if (match) {
          map[def.key] = match.raw;
          usedHeaders.add(match.raw);
          break;
        }
      }
    }

    return map;
  }

  function parseMoneyToCents(raw) {
    if (raw === null || raw === undefined || raw === "") return 0;
    if (typeof raw === "number") {
      return Number.isFinite(raw) ? Math.round(raw * 100) : 0;
    }
    let str = String(raw).trim();
    if (!str) return 0;
    let negative = false;
    if (str.startsWith("(") && str.endsWith(")")) {
      negative = true;
      str = str.slice(1, -1);
    }
    if (str.includes("-")) {
      negative = true;
    }
    // Strip currency symbols and spaces
    str = str.replace(/[^0-9.,]/g, "");
    if (!str) return 0;
    // Handle EU comma decimal e.g. 12,50 vs US thousand separator 1,250.50
    if (str.includes(",") && !str.includes(".")) {
      const parts = str.split(",");
      if (parts[parts.length - 1].length <= 2) {
        str = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
      } else {
        str = str.replace(/,/g, "");
      }
    } else {
      str = str.replace(/,/g, "");
    }
    const num = Number.parseFloat(str);
    if (!Number.isFinite(num)) return 0;
    const cents = Math.round(Math.abs(num) * 100);
    return negative ? -cents : cents;
  }

  function parsePositiveCents(raw) {
    return Math.abs(parseMoneyToCents(raw));
  }

  function parseWeightOz(raw) {
    if (raw === null || raw === undefined || raw === "") return 0;
    const str = String(raw).trim().toLowerCase();
    if (!str) return 0;
    // Support "2.5 lb" / "2 lbs 4 oz" / "15.8 oz" / plain numeric oz
    const lbOzMatch = str.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:lb|lbs)\s*(?:([0-9]+(?:\.[0-9]+)?)\s*oz)?/);
    if (lbOzMatch) {
      const lbs = Number.parseFloat(lbOzMatch[1]) || 0;
      const oz = lbOzMatch[2] ? Number.parseFloat(lbOzMatch[2]) || 0 : 0;
      return Math.round((lbs * 16 + oz) * 100) / 100;
    }
    const numMatch = str.match(/-?[0-9]+(?:\.[0-9]+)?/);
    if (!numMatch) return 0;
    const val = Number.parseFloat(numMatch[0]);
    return Number.isFinite(val) && val > 0 ? Math.round(val * 100) / 100 : 0;
  }

  function parseIsoDate(raw) {
    if (!raw) return null;
    const str = String(raw).trim();
    if (!str) return null;
    // YYYY-MM-DD...
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const d = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    // MM/DD/YYYY
    const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (usMatch) {
      const d = new Date(Date.UTC(Number(usMatch[3]), Number(usMatch[1]) - 1, Number(usMatch[2])));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }

  function formatIsoDate(dateObj) {
    if (!dateObj || Number.isNaN(dateObj.getTime())) return "";
    return dateObj.toISOString().slice(0, 10);
  }

  function addUtcDays(dateObj, days) {
    const d = new Date(dateObj.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  function diffUtcDays(targetDate, fromDate) {
    const msPerDay = 86400000;
    return Math.floor((targetDate.getTime() - fromDate.getTime()) / msPerDay);
  }

  function centsToDollars(cents) {
    return (cents / 100).toFixed(2);
  }

  function sanitizeUspsJargon(text) {
    let cleaned = String(text || "");
    const replacedTerms = [];
    for (const rule of JARGON_PATTERNS) {
      if (rule.regex.test(cleaned)) {
        replacedTerms.push(rule.regex.source);
      }
      rule.regex.lastIndex = 0;
      cleaned = cleaned.replace(rule.regex, rule.replacement);
    }
    // Verify zero residual banned terms
    const remainingViolations = [];
    for (const rule of JARGON_PATTERNS) {
      rule.regex.lastIndex = 0;
      if (rule.regex.test(cleaned)) {
        remainingViolations.push(rule.regex.source);
      }
    }
    return {
      text: cleaned.replace(/\s{2,}/g, " ").trim(),
      replacedCount: replacedTerms.length,
      jargonViolations: remainingViolations
    };
  }

  function classifyAndDraftAdjustment(item) {
    const labelOz = item.labelWeightOz;
    const carrierOz = item.carrierWeightOz;
    const expectedOz = item.expectedWeightOz;
    const reasonLower = String(item.adjustmentReason || "").toLowerCase();
    const mailClass = sanitizeUspsJargon(item.mailClass || "USPS Ground Advantage").text;
    const boxDims = item.boxDims || "6 x 4 x 2 in corrugated/bubble mailer";
    const tracking = item.trackingNumber || "SEE-SELLER-HUB-TRACKING";

    let anomalyType = "SCALE_VARIANCE";
    let anomalyLabel = "APV Scale Variance";
    let eligibleForAppeal = true;
    let actionRecommendation = "";
    let draftBody = "";

    if (expectedOz > 0 && labelOz > 0 && expectedOz > labelOz + 0.1) {
      anomalyType = "TRUE_UNDERWEIGHT_PROFILE";
      anomalyLabel = "Underweight Shipping Profile (Do Not Appeal)";
      eligibleForAppeal = false;
      actionRecommendation =
        "Packed SKU + packaging tare (" +
        expectedOz +
        " oz) exceeds declared label weight (" +
        labelOz +
        " oz). Do not use your single carrier appeal; update your shipping profile weight to " +
        Math.ceil(expectedOz) +
        " oz.";
      draftBody =
        "[DO NOT SUBMIT APPEAL — INTERNAL DIAGNOSTIC NOTE] Verified packed weight (" +
        expectedOz +
        " oz) exceeds original label weight (" +
        labelOz +
        " oz). Adjust shipping profile to prevent future APV debits.";
    } else if (
      reasonLower.includes("flat rate") ||
      reasonLower.includes("priority") ||
      reasonLower.includes("packaging") ||
      (item.chargedCents >= 1400 && carrierOz > 0 && labelOz > 0 && Math.abs(carrierOz - labelOz) <= 2.0)
    ) {
      anomalyType = "PACKAGING_CLASS_MISMATCH";
      anomalyLabel = "Packaging Type / Service Class Flag";
      eligibleForAppeal = true;
      actionRecommendation =
        "Confirm plain unbranded corrugated box or poly mailer was used (not USPS Priority Mail / Flat Rate packaging), then submit 1-time USPS APV dispute.";
      draftBody =
        "USPS Automated Package Verification (APV) Dispute — Tracking #" +
        tracking +
        ". Parcel was tendered under " +
        mailClass +
        " (declared label weight: " +
        (labelOz || "N/A") +
        " oz; dimensions: " +
        boxDims +
        ") inside a plain, unbranded commercial mailer/carton, NOT USPS-branded Priority Mail or Flat Rate packaging. Actual packed weight on calibrated shipping scale prior to induction was " +
        (expectedOz || labelOz || "within paid tier") +
        " oz. Requesting manual APV image/packaging verification and reversal of the $" +
        centsToDollars(item.chargedCents) +
        " adjustment.";
    } else if (carrierOz > 0 && labelOz > 0 && carrierOz >= Math.max(labelOz * 1.85, labelOz + 8)) {
      anomalyType = "CONVEYOR_DOUBLE_READ";
      anomalyLabel = "Suspected APV Belt Double-Scan (" + (carrierOz / labelOz).toFixed(1) + "x jump)";
      eligibleForAppeal = true;
      actionRecommendation =
        "High-probability adjacent-parcel conveyor overlap (" +
        labelOz +
        " oz billed at " +
        carrierOz +
        " oz). Submit single USPS APV dispute before 45-day deadline.";
      draftBody =
        "USPS Automated Package Verification (APV) Weight Dispute — Tracking #" +
        tracking +
        ". Shipment tendered via " +
        mailClass +
        " in a " +
        boxDims +
        " parcel. Prepaid label weight was " +
        labelOz +
        " oz, and verified packed weight (merchandise plus outer packaging tare) on calibrated postal scale was " +
        (expectedOz || labelOz) +
        " oz. APV recorded " +
        carrierOz +
        " oz, which physically exceeds single-parcel capacity and indicates an adjacent-parcel belt overlap during automated sorting. Requesting APV weight audit and credit of $" +
        centsToDollars(item.chargedCents) +
        ".";
    } else {
      anomalyType = "SCALE_VARIANCE";
      anomalyLabel = "APV Weight Tier Discrepancy";
      eligibleForAppeal = true;
      actionRecommendation =
        "Verify calibrated packed weight (" +
        (expectedOz || labelOz || "check scale") +
        " oz) is within the prepaid USPS weight bracket before submitting your 1-time appeal.";
      draftBody =
        "USPS Automated Package Verification (APV) Weight Review — Tracking #" +
        tracking +
        ". Parcel shipped under " +
        mailClass +
        " (" +
        boxDims +
        ") with prepaid label weight of " +
        (labelOz || "prepaid tier") +
        " oz and calibrated pre-shipment packed weight of " +
        (expectedOz || labelOz || "prepaid tier") +
        " oz (item plus packaging tare). Carrier recorded " +
        (carrierOz || "higher") +
        " oz, resulting in a $" +
        centsToDollars(item.chargedCents) +
        " charge. Requesting review of induction scan weight and credit of $" +
        centsToDollars(item.chargedCents) +
        ".";
    }

    const sanitized = sanitizeUspsJargon(draftBody);
    return {
      anomalyType,
      anomalyLabel,
      eligibleForAppeal,
      actionRecommendation,
      appealText: sanitized.text,
      jargonViolations: sanitized.jargonViolations
    };
  }

  function analyzeWhatnotRows(rows, columnMap, options) {
    const opts = options || {};
    const map = columnMap || {};
    const asOfDate = opts.asOfDate ? parseIsoDate(opts.asOfDate) : parseIsoDate(new Date().toISOString().slice(0, 10));
    const accounts = opts.accounts || DEFAULT_ACCOUNTS;

    const getCell = (row, key) => {
      const col = map[key];
      if (!col || row[col] === undefined || row[col] === null) return "";
      return String(row[col]).trim();
    };

    const adjustments = [];
    const batchMap = new Map();
    let totalRowsProcessed = 0;
    let orderRowsCount = 0;
    let highValueOrdersOver1500 = 0;

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      if (!row || typeof row !== "object") continue;

      const orderId = getCell(row, "orderId") || "ROW-" + (idx + 1);
      const rawDate = getCell(row, "transactionDate") || getCell(row, "payoutDate");
      const txDateObj = parseIsoDate(rawDate);
      const txDateIso = txDateObj ? formatIsoDate(txDateObj) : "Unspecified-Date";
      const rawType = getCell(row, "transactionType");
      const typeLower = rawType.toLowerCase();

      const payoutDateRaw = getCell(row, "payoutDate") || txDateIso;
      const payoutDateObj = parseIsoDate(payoutDateRaw) || txDateObj;
      const payoutDateIso = payoutDateObj ? formatIsoDate(payoutDateObj) : txDateIso;

      const batchId =
        getCell(row, "payoutBatchId") ||
        (payoutDateIso !== "Unspecified-Date" ? "BATCH-" + payoutDateIso.slice(0, 7) : "BATCH-UNASSIGNED");

      // Skip explicit payout bank-transfer confirmation rows so we don't double-count clearing balance
      if (typeLower === "payout" || typeLower === "bank transfer" || typeLower === "withdrawal") {
        continue;
      }

      totalRowsProcessed++;

      const grossCents = parsePositiveCents(getCell(row, "grossSale"));
      const buyerShipCents = parsePositiveCents(getCell(row, "buyerShipping"));
      const salesTaxCents = parsePositiveCents(getCell(row, "salesTax"));
      const commissionCents = parsePositiveCents(getCell(row, "commissionFee"));
      const processingCents = parsePositiveCents(getCell(row, "processingFee"));
      const vatOnFeesCents = parsePositiveCents(getCell(row, "vatOnFees"));
      const sellerShipCents = parsePositiveCents(getCell(row, "sellerShippingCost"));
      let carrierAdjCents = parsePositiveCents(getCell(row, "carrierAdjustment"));
      let refundCents = parsePositiveCents(getCell(row, "refundAmount"));
      let tipsCents = parsePositiveCents(getCell(row, "tipsAmount"));
      const netSignedCents = parseMoneyToCents(getCell(row, "netAmount"));
      const hasExplicitNet = getCell(row, "netAmount") !== "";

      // Handle single-amount Ledger CSV rows typed by Transaction Type
      const isAdjustmentType =
        typeLower.includes("carrier adjustment") ||
        typeLower.includes("shipping adjustment") ||
        typeLower.includes("weight adjustment") ||
        typeLower.includes("label adjustment") ||
        typeLower.includes("apv");
      const isRefundType =
        typeLower.includes("refund") || typeLower.includes("billback") || typeLower.includes("chargeback");
      const isGiveawayType = typeLower.includes("giveaway");
      const isTipType = typeLower === "tip" || typeLower.includes("seller tip");

      if (isAdjustmentType && carrierAdjCents === 0 && netSignedCents !== 0) {
        carrierAdjCents = Math.abs(netSignedCents);
      }
      if (isRefundType && refundCents === 0) {
        if (grossCents > 0) {
          refundCents = grossCents;
        } else if (netSignedCents < 0) {
          refundCents = Math.abs(netSignedCents);
        }
      }
      let effectiveSellerShipCents = sellerShipCents;
      if (isGiveawayType && effectiveSellerShipCents === 0 && netSignedCents < 0) {
        effectiveSellerShipCents = Math.abs(netSignedCents);
      }
      if (isTipType && tipsCents === 0 && netSignedCents > 0) {
        tipsCents = netSignedCents;
      }

      const effectiveGrossCents = isRefundType ? 0 : grossCents;
      if (effectiveGrossCents > 0) {
        orderRowsCount++;
        if (effectiveGrossCents > 150000) {
          highValueOrdersOver1500++;
        }
      }

      if (!batchMap.has(batchId)) {
        batchMap.set(batchId, {
          batchId,
          payoutDate: payoutDateIso,
          rowCount: 0,
          grossSalesCents: 0,
          buyerShippingCents: 0,
          tipsCents: 0,
          facilitatedTaxInfoCents: 0,
          commissionCents: 0,
          processingFeeCents: 0,
          vatOnFeesCents: 0,
          sellerShippingCents: 0,
          carrierAdjustmentsCents: 0,
          refundsCents: 0,
          explicitNetSumCents: 0,
          explicitNetRows: 0
        });
      }

      const b = batchMap.get(batchId);
      b.rowCount++;
      if (payoutDateIso && payoutDateIso > b.payoutDate && b.payoutDate !== "Unspecified-Date") {
        b.payoutDate = payoutDateIso;
      }
      b.grossSalesCents += effectiveGrossCents;
      b.buyerShippingCents += isRefundType ? 0 : buyerShipCents;
      b.tipsCents += tipsCents;
      b.facilitatedTaxInfoCents += salesTaxCents;
      b.commissionCents += commissionCents;
      b.processingFeeCents += processingCents;
      b.vatOnFeesCents += vatOnFeesCents;
      b.sellerShippingCents += effectiveSellerShipCents;
      b.carrierAdjustmentsCents += carrierAdjCents;
      b.refundsCents += refundCents;
      if (hasExplicitNet) {
        b.explicitNetSumCents += netSignedCents;
        b.explicitNetRows++;
      }

      // Record USPS / Carrier Adjustment entry if present
      const labelWeightOz = parseWeightOz(getCell(row, "labelWeightOz"));
      const carrierWeightOz = parseWeightOz(getCell(row, "carrierWeightOz"));
      const expectedWeightOz = parseWeightOz(getCell(row, "expectedWeightOz"));
      if (carrierAdjCents > 0 || isAdjustmentType) {
        const chargedDateObj = txDateObj || asOfDate;
        const deadlineObj = addUtcDays(chargedDateObj, APPEAL_WINDOW_DAYS);
        const daysRemaining = diffUtcDays(deadlineObj, asOfDate);
        let windowStatus = "OPEN";
        if (daysRemaining < 0) {
          windowStatus = "EXPIRED";
        } else if (daysRemaining <= 7) {
          windowStatus = "URGENT";
        }

        const baseAdj = {
          id: orderId,
          batchId,
          chargedDate: formatIsoDate(chargedDateObj),
          appealDeadlineDate: formatIsoDate(deadlineObj),
          daysRemaining,
          windowStatus,
          chargedCents: carrierAdjCents,
          chargedUsd: centsToDollars(carrierAdjCents),
          trackingNumber: getCell(row, "trackingNumber") || "",
          labelWeightOz,
          carrierWeightOz,
          expectedWeightOz,
          mailClass: getCell(row, "mailClass") || "USPS Ground Advantage",
          boxDims: getCell(row, "boxDims") || "",
          adjustmentReason: getCell(row, "adjustmentReason") || rawType || "Weight / APV Adjustment"
        };

        const classified = classifyAndDraftAdjustment(baseAdj);
        adjustments.push(Object.assign(baseAdj, classified));
      }
    }

    // Finalize balanced double-entry clearing journals per batch
    const batches = Array.from(batchMap.values()).map((b) => {
      const debitsBeforeClearingCents =
        b.commissionCents +
        b.processingFeeCents +
        b.vatOnFeesCents +
        b.sellerShippingCents +
        b.carrierAdjustmentsCents +
        b.refundsCents;

      const hasCompleteExplicitNet = b.explicitNetRows === b.rowCount && b.rowCount > 0;
      const creditsWithShipCents = b.grossSalesCents + b.buyerShippingCents + b.tipsCents;
      const creditsNoShipCents = b.grossSalesCents + b.tipsCents;
      const netWithShipCents = creditsWithShipCents - debitsBeforeClearingCents;
      const netNoShipCents = creditsNoShipCents - debitsBeforeClearingCents;

      // On standard Whatnot prepaid labels, buyer-paid shipping is retained by Whatnot to purchase the label.
      // Detect automatically when explicit Net Earnings equals (Gross + Tips - Deductions) without buyer shipping.
      const buyerShippingPassThrough =
        hasCompleteExplicitNet &&
        b.buyerShippingCents > 0 &&
        Math.abs(b.explicitNetSumCents - netNoShipCents) < Math.abs(b.explicitNetSumCents - netWithShipCents);

      const recognizedBuyerShipCents = buyerShippingPassThrough ? 0 : b.buyerShippingCents;
      const computedNetCents = (buyerShippingPassThrough ? netNoShipCents : netWithShipCents);
      const targetNetDepositCents = hasCompleteExplicitNet ? b.explicitNetSumCents : computedNetCents;
      const varianceCents = targetNetDepositCents - computedNetCents;

      // Build balanced double-entry lines (Debits positive, Credits negative in signed representation)
      const lines = [];
      const pushLine = (key, label, debitCents, creditCents) => {
        if (debitCents === 0 && creditCents === 0) return;
        lines.push({
          key,
          label,
          xeroCode: accounts.xero[key].code,
          xeroTaxRate: accounts.xero[key].taxRate,
          qboAccount: accounts.qbo[key],
          debitCents,
          creditCents,
          signedAmountCents: debitCents - creditCents
        });
      };

      // Credit lines (revenue inflows)
      pushLine("grossSales", "Whatnot Gross Merchandise Sales (" + b.batchId + ")", 0, b.grossSalesCents);
      pushLine("shippingIncome", "Buyer-Paid Shipping Collected (" + b.batchId + ")", 0, recognizedBuyerShipCents);
      pushLine("otherIncome", "Tips & Marketplace Credits (" + b.batchId + ")", 0, b.tipsCents);

      // Debit lines (fees, shipping, adjustments, refunds)
      pushLine("commission", "Whatnot Seller Commission (" + b.batchId + ")", b.commissionCents, 0);
      pushLine("processing", "Payment Processing Fees (" + b.batchId + ")", b.processingFeeCents, 0);
      pushLine("vatOnFees", "VAT on Marketplace Fees (" + b.batchId + ")", b.vatOnFeesCents, 0);
      pushLine("sellerShipping", "Giveaway & Seller Shipping Labels (" + b.batchId + ")", b.sellerShippingCents, 0);
      pushLine("carrierAdjustments", "USPS / Carrier Weight Adjustments (" + b.batchId + ")", b.carrierAdjustmentsCents, 0);
      pushLine("refunds", "Order Refunds & Billbacks (" + b.batchId + ")", b.refundsCents, 0);

      // If CSV net column includes an unitemized adjustment/credit, isolate it so Clearing matches bank deposit to $0.01
      if (varianceCents > 0) {
        pushLine("settlementVariance", "Unitemized Ledger Credit / Adjustment (" + b.batchId + ")", 0, varianceCents);
      } else if (varianceCents < 0) {
        pushLine("settlementVariance", "Unitemized Ledger Deduction / Adjustment (" + b.batchId + ")", Math.abs(varianceCents), 0);
      }

      // Clearing account entry (positive net payout = Debit to Clearing Asset so bank feed deposit Credits Clearing to $0.00)
      if (targetNetDepositCents >= 0) {
        pushLine(
          "clearing",
          "Net Settlement Transfer to Bank — Match Bank Deposit (" + b.batchId + ")",
          targetNetDepositCents,
          0
        );
      } else {
        pushLine(
          "clearing",
          "Net Negative Settlement Balance (" + b.batchId + ")",
          0,
          Math.abs(targetNetDepositCents)
        );
      }

      const totalDebitsCents = lines.reduce((acc, l) => acc + l.debitCents, 0);
      const totalCreditsCents = lines.reduce((acc, l) => acc + l.creditCents, 0);
      const effectiveCommissionPct =
        b.grossSalesCents > 0 ? Number(((b.commissionCents / b.grossSalesCents) * 100).toFixed(2)) : 0;

      return Object.assign({}, b, {
        computedNetCents,
        netBankDepositCents: targetNetDepositCents,
        varianceCents,
        effectiveCommissionPct,
        totalDebitsCents,
        totalCreditsCents,
        isBalanced: totalDebitsCents === totalCreditsCents,
        lines
      });
    });

    adjustments.sort((a, b) => a.daysRemaining - b.daysRemaining);

    const openEligibleAdjustments = adjustments.filter(
      (a) => a.windowStatus !== "EXPIRED" && a.eligibleForAppeal
    );
    const urgentAdjustments = openEligibleAdjustments.filter((a) => a.windowStatus === "URGENT");
    const expiredAdjustments = adjustments.filter((a) => a.windowStatus === "EXPIRED");
    const underweightProfileWarnings = adjustments.filter((a) => !a.eligibleForAppeal);

    const totals = {
      rowsProcessed: totalRowsProcessed,
      ordersCount: orderRowsCount,
      highValueOrdersOver1500,
      batchesCount: batches.length,
      grossSalesCents: batches.reduce((s, b) => s + b.grossSalesCents, 0),
      buyerShippingCents: batches.reduce((s, b) => s + b.buyerShippingCents, 0),
      commissionCents: batches.reduce((s, b) => s + b.commissionCents, 0),
      processingFeeCents: batches.reduce((s, b) => s + b.processingFeeCents, 0),
      sellerShippingCents: batches.reduce((s, b) => s + b.sellerShippingCents, 0),
      carrierAdjustmentsCents: batches.reduce((s, b) => s + b.carrierAdjustmentsCents, 0),
      refundsCents: batches.reduce((s, b) => s + b.refundsCents, 0),
      netBankDepositCents: batches.reduce((s, b) => s + b.netBankDepositCents, 0),
      adjustmentsCount: adjustments.length,
      recoverableOpenCount: openEligibleAdjustments.length,
      recoverableOpenCents: openEligibleAdjustments.reduce((s, a) => s + a.chargedCents, 0),
      urgentCount: urgentAdjustments.length,
      expiredCount: expiredAdjustments.length,
      expiredCents: expiredAdjustments.reduce((s, a) => s + a.chargedCents, 0),
      underweightProfileCount: underweightProfileWarnings.length,
      allBatchesBalanced: batches.every((b) => b.isBalanced)
    };
    totals.effectiveCommissionPct =
      totals.grossSalesCents > 0
        ? Number(((totals.commissionCents / totals.grossSalesCents) * 100).toFixed(2))
        : 0;

    return {
      asOfDate: formatIsoDate(asOfDate),
      totals,
      batches,
      adjustments
    };
  }

  function escapeCsvCell(val) {
    let str = String(val === null || val === undefined ? "" : val);
    // Neutralize spreadsheet formula injection (=, +, -, @ at start of text cells)
    if (/^[=+\-@]/.test(str) && !/^-[0-9]+(\.[0-9]+)?$/.test(str)) {
      str = "'" + str;
    }
    if (/[",\r\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function exportXeroManualJournalCsv(batches, customAccounts) {
    const header = ["*Narration", "*Date", "Description", "*AccountCode", "*TaxRate", "*Amount"];
    const outRows = [header.join(",")];
    const accounts = customAccounts || DEFAULT_ACCOUNTS.xero;

    for (const batch of batches) {
      const narration = "Whatnot Settlement Clearing — " + batch.batchId;
      const dateStr = batch.payoutDate !== "Unspecified-Date" ? batch.payoutDate : new Date().toISOString().slice(0, 10);
      for (const line of batch.lines) {
        const acct = accounts[line.key] || { code: line.xeroCode, taxRate: line.xeroTaxRate };
        const signedDollars = (line.signedAmountCents / 100).toFixed(2);
        outRows.push(
          [
            escapeCsvCell(narration),
            escapeCsvCell(dateStr),
            escapeCsvCell(line.label),
            escapeCsvCell(acct.code),
            escapeCsvCell(acct.taxRate),
            escapeCsvCell(signedDollars)
          ].join(",")
        );
      }
    }
    return outRows.join("\r\n") + "\r\n";
  }

  function formatQboDate(isoDate) {
    const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "11/12/2026";
    return m[2] + "/" + m[3] + "/" + m[1];
  }

  function exportQboJournalCsv(batches, customQboAccounts) {
    const header = ["Journal No.", "Journal Date", "Account Name", "Debits", "Credits", "Description"];
    const outRows = [header.join(",")];
    const qboAccounts = customQboAccounts || DEFAULT_ACCOUNTS.qbo;

    batches.forEach((batch, index) => {
      const rawNo = "WN-" + String(batch.batchId).replace(/[^A-Za-z0-9-]/g, "").slice(-14);
      const journalNo = rawNo.length > 3 ? rawNo : "WN-BATCH-" + (index + 1);
      const qboDate = formatQboDate(batch.payoutDate);
      for (const line of batch.lines) {
        const acctName = qboAccounts[line.key] || line.qboAccount;
        const debitStr = line.debitCents > 0 ? centsToDollars(line.debitCents) : "";
        const creditStr = line.creditCents > 0 ? centsToDollars(line.creditCents) : "";
        outRows.push(
          [
            escapeCsvCell(journalNo),
            escapeCsvCell(qboDate),
            escapeCsvCell(acctName),
            escapeCsvCell(debitStr),
            escapeCsvCell(creditStr),
            escapeCsvCell(line.label)
          ].join(",")
        );
      }
    });
    return outRows.join("\r\n") + "\r\n";
  }

  function exportAppealsPacketTxt(adjustments) {
    const eligible = adjustments.filter((a) => a.windowStatus !== "EXPIRED" && a.eligibleForAppeal);
    const lines = [
      "CLEARSTREAM LEDGER — USPS APV 45-DAY DISPUTE PACKET (JARGON-FREE)",
      "Disclaimer: Formatting assistance tool only — not legal, postal, or accounting advice.",
      "Verify scale weight and plain packaging before submitting your single Seller Hub appeal per shipment.",
      "================================================================================",
      ""
    ];
    if (eligible.length === 0) {
      lines.push("No open eligible carrier adjustments found within the 45-day appeal window.");
      return lines.join("\r\n");
    }
    eligible.forEach((item, idx) => {
      lines.push(
        "[" +
          (idx + 1) +
          "] Order/Shipment: " +
          item.id +
          " | Tracking: " +
          (item.trackingNumber || "N/A") +
          " | Charged: $" +
          item.chargedUsd +
          " on " +
          item.chargedDate +
          " | Appeal Deadline: " +
          item.appealDeadlineDate +
          " (" +
          item.daysRemaining +
          "d left)"
      );
      lines.push("Classification: " + item.anomalyLabel);
      lines.push("Copy-Paste USPS Dispute Text:");
      lines.push(item.appealText);
      lines.push("--------------------------------------------------------------------------------");
    });
    return lines.join("\r\n");
  }

  return {
    APPEAL_WINDOW_DAYS,
    DEFAULT_ACCOUNTS,
    FIELD_DEFINITIONS,
    parseCsvText,
    parseCsvFallback,
    autoDetectColumnMap,
    parseMoneyToCents,
    parseWeightOz,
    sanitizeUspsJargon,
    analyzeWhatnotRows,
    exportXeroManualJournalCsv,
    exportQboJournalCsv,
    exportAppealsPacketTxt,
    centsToDollars
  };
});
