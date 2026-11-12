(function () {
  "use strict";

  const Engine = window.ClearStreamEngine;
  if (!Engine) return;

  const state = {
    filesLoaded: [],
    headers: [],
    rows: [],
    columnMap: {},
    analysis: null,
    checkoutConfig: {
      whatnotCatchup99Url: "https://buy.polar.sh/polar_cl_mUL2IDaGUfRafdHjUIV7XE3URTKUKdJV7KtmX0KXPIc",
      whatnotSellerPro45Url: "",
      whatnotCpa129Url: "",
      fallbackFormUrl: "https://docs.google.com/forms/d/e/1FAIpQLSfC50VFJdc55ug-sNpJON59JL9By6yIuRe8qysotQLX1cNtFA/viewform",
      contactEmail: "halocrypto101@gmail.com"
    }
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function formatUsd(cents) {
    const sign = cents < 0 ? "-" : "";
    return sign + "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function loadCheckoutConfig() {
    try {
      const resp = await fetch("./checkout-config.json", { cache: "no-store" });
      if (resp.ok) {
        const cfg = await resp.json();
        Object.assign(state.checkoutConfig, cfg);
      }
    } catch (_err) {
      // Static file:// or offline fallback uses built-in defaults
    }
    syncCheckoutButtons();
  }

  function buildMailtoHref(planLabel, priceLabel) {
    const email = state.checkoutConfig.contactEmail || "halocrypto101@gmail.com";
    const batches = state.analysis ? state.analysis.totals.batchesCount : 0;
    const rows = state.analysis ? state.analysis.totals.rowsProcessed : 0;
    const recoverable = state.analysis ? formatUsd(state.analysis.totals.recoverableOpenCents) : "$0.00";
    const subject = "ClearStream Ledger Unlock — " + planLabel + " (" + priceLabel + ")";
    const body = [
      "Hello ClearStream Ledger Desk,",
      "",
      "Please send the instant checkout / activation link for: " + planLabel + " (" + priceLabel + ").",
      rows > 0
        ? "Diagnostic summary from my browser scan: " + rows + " rows across " + batches + " settlement batches (" + recoverable + " open 45-day carrier adjustments)."
        : "",
      "Accounting software target: [Xero / QuickBooks Online]",
      "",
      "Thank you!"
    ]
      .filter(Boolean)
      .join("\n");
    return "mailto:" + email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  function syncCheckoutButtons() {
    const catchupBtn = byId("modal-checkout-catchup");
    const sellerBtn = byId("modal-checkout-seller");
    const cpaBtn = byId("modal-checkout-cpa");
    const formBtn = byId("modal-fallback-form");
    const noteEl = byId("modal-checkout-note");

    const hasDirectCheckout = Boolean(state.checkoutConfig.whatnotCatchup99Url);
    if (catchupBtn) {
      catchupBtn.href = state.checkoutConfig.whatnotCatchup99Url || buildMailtoHref("Whatnot 2026 Full-Year Catch-Up Journal", "$99 one-time");
      catchupBtn.textContent = hasDirectCheckout
        ? "Checkout Now — $99 Catch-Up Pass"
        : "Request $99 Catch-Up Pass Link (Instant Invoice)";
    }
    if (sellerBtn) {
      sellerBtn.href = state.checkoutConfig.whatnotSellerPro45Url || buildMailtoHref("Seller Pro Unlimited", "$45/mo");
    }
    if (cpaBtn) {
      cpaBtn.href = state.checkoutConfig.whatnotCpa129Url || buildMailtoHref("CPA / Bookkeeper Practice (15 Shops)", "$129/mo");
    }
    if (formBtn && state.checkoutConfig.fallbackFormUrl) {
      formBtn.href = state.checkoutConfig.fallbackFormUrl;
    }
    if (noteEl) {
      noteEl.textContent = hasDirectCheckout
        ? "Instant unlock via Merchant of Record checkout (Sales Tax / VAT handled automatically)."
        : "Direct self-serve Merchant of Record checkout is finalizing verification — request instant invoice/unlock link via Google Form or email below (no card required for 1-client CPA pilot).";
    }
  }

  function downloadBlob(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderColumnMapper() {
    const grid = byId("mapping-grid");
    if (!grid) return;
    grid.textContent = "";

    Engine.FIELD_DEFINITIONS.forEach((def) => {
      const wrap = document.createElement("div");
      wrap.className = "field-group";

      const lbl = document.createElement("label");
      lbl.setAttribute("for", "map-" + def.key);
      lbl.textContent = def.label;

      const sel = document.createElement("select");
      sel.id = "map-" + def.key;
      sel.dataset.fieldKey = def.key;

      const noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "-- Not mapped --";
      sel.appendChild(noneOpt);

      state.headers.forEach((h) => {
        const opt = document.createElement("option");
        opt.value = h;
        opt.textContent = h;
        if (state.columnMap[def.key] === h) {
          opt.selected = true;
        }
        sel.appendChild(opt);
      });

      sel.addEventListener("change", function () {
        state.columnMap[def.key] = sel.value;
        recalculateAndRender();
      });

      wrap.appendChild(lbl);
      wrap.appendChild(sel);
      grid.appendChild(wrap);
    });
  }

  function createPill(text, variant) {
    const span = document.createElement("span");
    span.className = "pill pill-" + variant;
    span.textContent = text;
    return span;
  }

  function renderAnalysis() {
    const resultsWrap = byId("results-workspace");
    if (!state.analysis || state.rows.length === 0) {
      resultsWrap.classList.add("hidden");
      return;
    }
    resultsWrap.classList.remove("hidden");

    const t = state.analysis.totals;
    byId("kpi-recoverable").textContent = formatUsd(t.recoverableOpenCents);
    byId("kpi-recoverable-sub").textContent =
      t.recoverableOpenCount + " eligible within 45-day window (" + t.urgentCount + " urgent <=7d)";
    byId("kpi-net-payout").textContent = formatUsd(t.netBankDepositCents);
    byId("kpi-net-sub").textContent =
      t.batchesCount + " clearing batch(es) • " + (t.allBatchesBalanced ? "$0.00 variance verified" : "Check mapping");
    byId("kpi-commission").textContent = formatUsd(t.commissionCents) + " (" + t.effectiveCommissionPct + "%)";
    byId("kpi-commission-sub").textContent =
      "Processing fees: " + formatUsd(t.processingFeeCents) + " • Gross sales: " + formatUsd(t.grossSalesCents);
    byId("kpi-rows").textContent = String(t.rowsProcessed);
    byId("kpi-rows-sub").textContent =
      state.filesLoaded.join(", ") + (t.expiredCount > 0 ? " • " + t.expiredCount + " expired (>45d)" : "");

    renderAdjustmentsTable(state.analysis.adjustments);
    renderBatchesTable(state.analysis.batches);
    syncCheckoutButtons();
  }

  function renderAdjustmentsTable(adjustments) {
    const tbody = byId("adjustments-tbody");
    const previewBox = byId("appeal-preview-box");
    const previewMeta = byId("appeal-preview-meta");
    tbody.textContent = "";

    if (adjustments.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = "No carrier/USPS weight adjustments detected in current CSVs (check Column Mapper if your adjustment column uses a custom header).";
      tr.appendChild(td);
      tbody.appendChild(tr);
      previewBox.textContent = "No eligible adjustment selected.";
      previewMeta.textContent = "";
      return;
    }

    adjustments.forEach((adj, idx) => {
      const tr = document.createElement("tr");

      const tdOrder = document.createElement("td");
      const strong = document.createElement("strong");
      strong.textContent = adj.id;
      tdOrder.appendChild(strong);
      const trackDiv = document.createElement("div");
      trackDiv.textContent = adj.trackingNumber || "Tracking in Seller Hub";
      tdOrder.appendChild(trackDiv);

      const tdDates = document.createElement("td");
      tdDates.textContent = "Charged: " + adj.chargedDate + " -> Due: " + adj.appealDeadlineDate;

      const tdWindow = document.createElement("td");
      if (adj.windowStatus === "EXPIRED") {
        tdWindow.appendChild(createPill("EXPIRED (" + Math.abs(adj.daysRemaining) + "d ago)", "danger"));
      } else if (adj.windowStatus === "URGENT") {
        tdWindow.appendChild(createPill(adj.daysRemaining + "d LEFT — URGENT", "warn"));
      } else {
        tdWindow.appendChild(createPill(adj.daysRemaining + "d left (45d window)", "ok"));
      }

      const tdWeights = document.createElement("td");
      tdWeights.textContent =
        "Label: " +
        (adj.labelWeightOz || "?") +
        " oz | Carrier: " +
        (adj.carrierWeightOz || "?") +
        " oz" +
        (adj.expectedWeightOz ? " | Expected: " + adj.expectedWeightOz + " oz" : "");

      const tdDiag = document.createElement("td");
      const diagTitle = document.createElement("div");
      diagTitle.appendChild(
        createPill(adj.anomalyLabel, adj.eligibleForAppeal ? "brand" : "warn")
      );
      const diagRec = document.createElement("div");
      diagRec.textContent = adj.actionRecommendation;
      tdDiag.appendChild(diagTitle);
      tdDiag.appendChild(diagRec);

      const tdCharge = document.createElement("td");
      tdCharge.className = "num";
      tdCharge.textContent = "$" + adj.chargedUsd;

      tr.appendChild(tdOrder);
      tr.appendChild(tdDates);
      tr.appendChild(tdWindow);
      tr.appendChild(tdWeights);
      tr.appendChild(tdDiag);
      tr.appendChild(tdCharge);
      tbody.appendChild(tr);

      // Free tier shows full copy-ready text for the first open eligible adjustment
      if (idx === 0 || (previewBox.dataset.bound !== "1" && adj.eligibleForAppeal && adj.windowStatus !== "EXPIRED")) {
        previewBox.dataset.bound = "1";
        previewMeta.textContent =
          "Free Diagnostic Preview — Shipment " +
          adj.id +
          " (Jargon Guard: " +
          (adj.jargonViolations.length === 0 ? "0 platform-slang terms" : "check terms") +
          ")";
        previewBox.textContent = adj.appealText;
      }
    });
    delete previewBox.dataset.bound;
  }

  function renderBatchesTable(batches) {
    const tbody = byId("batches-tbody");
    const linesTbody = byId("journal-preview-tbody");
    const previewLabel = byId("journal-preview-label");
    tbody.textContent = "";
    linesTbody.textContent = "";

    batches.forEach((b) => {
      const tr = document.createElement("tr");
      const cells = [
        { text: b.batchId, cls: "" },
        { text: b.payoutDate, cls: "" },
        { text: String(b.rowCount), cls: "num" },
        { text: formatUsd(b.grossSalesCents), cls: "num" },
        { text: formatUsd(b.commissionCents) + " (" + b.effectiveCommissionPct + "%)", cls: "num" },
        { text: formatUsd(b.processingFeeCents), cls: "num" },
        { text: formatUsd(b.sellerShippingCents + b.carrierAdjustmentsCents), cls: "num" },
        { text: formatUsd(b.refundsCents), cls: "num" },
        { text: formatUsd(b.netBankDepositCents), cls: "num" },
        { text: b.isBalanced ? "BALANCED ($0.00)" : "UNBALANCED", cls: "" }
      ];
      cells.forEach((c) => {
        const td = document.createElement("td");
        if (c.cls) td.className = c.cls;
        td.textContent = c.text;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    // Free preview of Batch #1 double-entry clearing lines
    const firstBatch = batches[0];
    if (firstBatch) {
      previewLabel.textContent =
        "Batch #1 Clearing Journal Preview (" +
        firstBatch.batchId +
        " • Payout Date " +
        firstBatch.payoutDate +
        " • Debits " +
        formatUsd(firstBatch.totalDebitsCents) +
        " = Credits " +
        formatUsd(firstBatch.totalCreditsCents) +
        ")";
      firstBatch.lines.forEach((line) => {
        const tr = document.createElement("tr");
        const cells = [
          { text: line.xeroCode, cls: "" },
          { text: line.qboAccount, cls: "" },
          { text: line.label, cls: "" },
          { text: line.debitCents > 0 ? formatUsd(line.debitCents) : "—", cls: "num" },
          { text: line.creditCents > 0 ? formatUsd(line.creditCents) : "—", cls: "num" }
        ];
        cells.forEach((c) => {
          const td = document.createElement("td");
          if (c.cls) td.className = c.cls;
          td.textContent = c.text;
          tr.appendChild(td);
        });
        linesTbody.appendChild(tr);
      });
    }
  }

  function recalculateAndRender() {
    if (state.rows.length === 0) return;
    state.analysis = Engine.analyzeWhatnotRows(state.rows, state.columnMap);
    renderAnalysis();
  }

  function ingestCsvStrings(namedCsvList) {
    let mergedHeaders = [];
    const headerSet = new Set();
    let mergedRows = [];
    const names = [];

    namedCsvList.forEach((entry) => {
      const parsed = Engine.parseCsvText(entry.text, window.Papa);
      if (parsed.rows.length > 0) {
        names.push(entry.name + " (" + parsed.rows.length + " rows)");
        parsed.headers.forEach((h) => {
          if (!headerSet.has(h)) {
            headerSet.add(h);
            mergedHeaders.push(h);
          }
        });
        mergedRows = mergedRows.concat(parsed.rows);
      }
    });

    if (mergedRows.length === 0) {
      byId("status-msg").textContent = "No data rows found in the selected CSV file(s).";
      return;
    }

    state.filesLoaded = names;
    state.headers = mergedHeaders;
    state.rows = mergedRows;
    state.columnMap = Engine.autoDetectColumnMap(mergedHeaders);

    byId("status-msg").textContent =
      "Processed locally in browser: " + names.join(" + ") + " — 0 bytes uploaded.";
    renderColumnMapper();
    recalculateAndRender();
  }

  async function handleFileList(fileList) {
    if (!fileList || fileList.length === 0) return;
    const payloads = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      const text = await f.text();
      payloads.push({ name: f.name, text });
    }
    ingestCsvStrings(payloads);
  }

  async function loadSampleCsv() {
    try {
      const resp = await fetch("./samples/whatnot-sample-2026-q4.csv", { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const text = await resp.text();
      ingestCsvStrings([{ name: "whatnot-sample-2026-q4.csv", text }]);
    } catch (_err) {
      byId("status-msg").textContent = "Could not fetch sample CSV; drop any local CSV file above to test.";
    }
  }

  function openCheckoutModal() {
    syncCheckoutButtons();
    byId("checkout-modal").classList.remove("hidden");
  }

  function closeCheckoutModal() {
    byId("checkout-modal").classList.add("hidden");
  }

  function initEvents() {
    const dropzone = byId("csv-dropzone");
    const fileInput = byId("csv-file-input");

    byId("btn-browse-csv").addEventListener("click", function (e) {
      e.stopPropagation();
      fileInput.click();
    });
    dropzone.addEventListener("click", function (e) {
      if (e.target.tagName !== "BUTTON" && e.target.tagName !== "A") {
        fileInput.click();
      }
    });
    fileInput.addEventListener("change", function () {
      handleFileList(fileInput.files);
    });

    ["dragenter", "dragover"].forEach((evtName) => {
      dropzone.addEventListener(evtName, function (e) {
        e.preventDefault();
        dropzone.classList.add("drag-active");
      });
    });
    ["dragleave", "drop"].forEach((evtName) => {
      dropzone.addEventListener(evtName, function (e) {
        e.preventDefault();
        dropzone.classList.remove("drag-active");
      });
    });
    dropzone.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files) {
        handleFileList(e.dataTransfer.files);
      }
    });

    byId("btn-load-sample").addEventListener("click", function (e) {
      e.stopPropagation();
      loadSampleCsv();
    });

    byId("btn-toggle-mapper").addEventListener("click", function () {
      const panel = byId("mapper-panel");
      panel.classList.toggle("hidden");
    });

    byId("btn-copy-sample-appeal").addEventListener("click", function () {
      const txt = byId("appeal-preview-box").textContent || "";
      if (navigator.clipboard && txt) {
        navigator.clipboard.writeText(txt);
        byId("btn-copy-sample-appeal").textContent = "Copied Appeal Text!";
        setTimeout(() => {
          byId("btn-copy-sample-appeal").textContent = "Copy Preview Appeal Text";
        }, 1800);
      }
    });

    // Free 1-batch preview download so CPAs can verify Xero/QBO import format immediately
    byId("btn-sample-xero-one").addEventListener("click", function () {
      if (!state.analysis || state.analysis.batches.length === 0) return;
      const csv = Engine.exportXeroManualJournalCsv([state.analysis.batches[0]]);
      downloadBlob("clearstream-xero-preview-batch1.csv", csv, "text/csv;charset=utf-8");
    });
    byId("btn-sample-qbo-one").addEventListener("click", function () {
      if (!state.analysis || state.analysis.batches.length === 0) return;
      const csv = Engine.exportQboJournalCsv([state.analysis.batches[0]]);
      downloadBlob("clearstream-qbo-preview-batch1.csv", csv, "text/csv;charset=utf-8");
    });

    // Gated full exports -> Polar.sh checkout drawer
    [
      "btn-full-xero",
      "btn-full-qbo",
      "btn-full-appeals",
      "btn-gate-cta",
      "btn-pricing-catchup",
      "btn-pricing-seller",
      "btn-pricing-cpa"
    ].forEach((id) => {
      const el = byId(id);
      if (el) el.addEventListener("click", openCheckoutModal);
    });

    byId("btn-close-modal").addEventListener("click", closeCheckoutModal);
    byId("checkout-modal").addEventListener("click", function (e) {
      if (e.target.id === "checkout-modal") closeCheckoutModal();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadCheckoutConfig();
    initEvents();
  });
})();
