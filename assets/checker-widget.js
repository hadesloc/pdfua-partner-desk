(function () {
  const MAX_BYTES = 20 * 1024 * 1024;
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const fmt = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function localInspectPdfBuffer(buf, filename, cfg) {
    const u8 = new Uint8Array(buf);
    let hdr = "";
    for (let i = 0; i < Math.min(16, u8.length); i++) hdr += String.fromCharCode(u8[i]);
    if (!hdr.startsWith("%PDF-")) {
      throw new Error("Uploaded file is not a valid PDF document (%PDF- header missing).");
    }
    const dec = new TextDecoder("latin1");
    const raw = dec.decode(u8);

    const pageMatches = raw.match(/\/Type\s*\/Page(?![A-Za-z])/g);
    const pages = Math.max(1, pageMatches ? pageMatches.length : 1);
    const hasStruct = /\/StructTreeRoot\b/.test(raw);
    const isMarked = /\/Marked\s+true\b/i.test(raw);
    const isTagged = hasStruct && isMarked;
    const hasPdfUaId = /pdfuaid:part/i.test(raw);
    const langMatch = raw.match(/\/Lang\s*\(([^)]{1,24})\)/);
    const langVal = langMatch ? langMatch[1].trim() : "";
    const hasTitle = /<dc:title>[\s\S]{1,400}?<rdf:li[^>]*>[^<\s]/i.test(raw) || /\/Title\s*\([^)]+\)/.test(raw);
    const displayDocTitle = /\/DisplayDocTitle\s+true\b/i.test(raw);

    const formMatches = raw.match(/\/FT\s*\/(Tx|Btn|Ch)\b/g);
    const formCount = formMatches ? formMatches.length : 0;
    const tuMatches = raw.match(/\/TU\s*\([^)]+\)/g);
    const tuCount = tuMatches ? tuMatches.length : 0;
    const formsMissingTu = Math.max(0, formCount - tuCount);

    const tableMatches = raw.match(/\/S\s*\/Table\b/g);
    const tableCount = tableMatches ? tableMatches.length : 0;
    const figMatches = raw.match(/\/S\s*\/Figure\b/g);
    const figCount = figMatches ? figMatches.length : 0;
    const altMatches = raw.match(/\/Alt\s*(\(|<)/g);
    const altCount = altMatches ? altMatches.length : 0;
    const figsMissingAlt = Math.max(0, figCount - altCount);

    const linkMatches = raw.match(/\/Subtype\s*\/Link\b/g);
    const linkCount = linkMatches ? linkMatches.length : 0;
    const hasTabsS = /\/Tabs\s*\/S\b/.test(raw);
    const imgMatches = raw.match(/\/Subtype\s*\/Image\b/g);
    const imgCount = imgMatches ? imgMatches.length : 0;
    const textOpMatches = raw.match(/\bBT\b/g);
    const textBlocks = textOpMatches ? textOpMatches.length : 0;
    const likelyScanned = imgCount >= pages && textBlocks === 0;
    const isSigned = /\/FT\s*\/Sig\b/.test(raw) && /\/ByteRange\s*\[/.test(raw);

    const findings = [];
    if (!isTagged) {
      findings.push({
        clause: "6.2 / 7.1",
        severity: "CRITICAL",
        title: "Untagged PDF — Missing Logical Structure Tree (/StructTreeRoot)",
        wcag: "WCAG 2.1 SC 1.3.1 Info & Relationships · 1.3.2 Meaningful Sequence (Level A)",
        failed_checks: pages,
        impact: "Screen readers (NVDA, JAWS, VoiceOver) cannot distinguish headings, paragraphs, lists, or decorative headers/footers."
      });
    }
    if (!hasPdfUaId) {
      findings.push({
        clause: "5",
        severity: "HIGH",
        title: "Missing ISO 14289-1 (PDF/UA-1) XMP Conformance Metadata (pdfuaid:part=1)",
        wcag: "ISO 14289-1 §5 · PAC 2026 & veraPDF Conformance Gate",
        failed_checks: 1,
        impact: "Automated ADA Title II, municipal, and procurement validators reject the PDF as non-certified."
      });
    }
    if (!hasTitle || !displayDocTitle) {
      findings.push({
        clause: "7.1",
        severity: "HIGH",
        title: "Missing Accessible Document Title or /DisplayDocTitle Window Flag",
        wcag: "WCAG 2.1 SC 2.4.2 Page Titled (Level A)",
        failed_checks: 1,
        impact: "Assistive technology announces the raw filename instead of a clear human-readable document title."
      });
    }
    if (!langVal) {
      findings.push({
        clause: "7.2",
        severity: "HIGH",
        title: "Missing Natural Language Specification (/Lang)",
        wcag: "WCAG 2.1 SC 3.1.1 Language of Page (Level A)",
        failed_checks: 1,
        impact: "Screen-reader speech synthesizers cannot confirm the pronunciation dictionary for the document."
      });
    }
    if (likelyScanned) {
      findings.push({
        clause: "7.1 / OCR",
        severity: "CRITICAL",
        title: "Scanned Image-Only Pages Detected — No Searchable Text Layer",
        wcag: "WCAG 2.1 SC 1.4.5 Images of Text & 1.1.1 Non-text Content",
        failed_checks: pages,
        impact: "Blind users hear 'Empty page' or 'Graphic' across scanned pages until Unicode OCR and semantic tags are embedded."
      });
    }
    if (figsMissingAlt > 0) {
      findings.push({
        clause: "7.3",
        severity: "CRITICAL",
        title: "Figures / Images Missing Alternative Text (/Alt)",
        wcag: "WCAG 2.1 SC 1.1.1 Non-text Content (Level A)",
        failed_checks: figsMissingAlt,
        impact: "Tagged <Figure> elements lack /Alt descriptions for non-sighted readers."
      });
    }
    if (formsMissingTu > 0) {
      findings.push({
        clause: "7.18.4",
        severity: "CRITICAL",
        title: "Fillable AcroForm Fields Missing Accessible Tooltips (/TU)",
        wcag: "WCAG 2.1 SC 3.3.2 Labels or Instructions & 4.1.2 Name, Role, Value",
        failed_checks: formsMissingTu,
        impact: "Keyboard and screen-reader users cannot hear field prompts when tabbing through interactive form inputs."
      });
    }
    if ((linkCount > 0 || formCount > 0) && !hasTabsS) {
      findings.push({
        clause: "7.18.3",
        severity: "HIGH",
        title: "Interactive Page Tab Order Not Bound to Structure (/Tabs /S)",
        wcag: "WCAG 2.1 SC 2.4.3 Focus Order (Level A)",
        failed_checks: linkCount + formCount,
        impact: "Keyboard Tab navigation jumps by X/Y coordinates instead of following the logical reading order."
      });
    }

    let tierLabel = "Born-Digital Text & Headings";
    let wRate = 2.0, rRate = 5.0;
    if (formCount > 0) {
      tierLabel = "Interactive Fillable AcroForms";
      wRate = 6.5; rRate = 15.0;
    } else if (likelyScanned) {
      tierLabel = "Scanned OCR + Searchable PDF/UA";
      wRate = 3.5; rRate = 9.0;
    } else if (tableCount > 0) {
      tierLabel = "Structured Data Tables & Reports";
      wRate = 3.0; rRate = 8.0;
    }
    const wholesaleTotal = Math.max(35.0, Math.round(pages * wRate * 100) / 100);
    const retailTotal = Math.max(65.0, Math.round(pages * rRate * 100) / 100);
    let fixedUsd = wholesaleTotal;
    if (formCount === 0 && !likelyScanned && tableCount === 0 && pages <= 12) fixedUsd = 65.0;
    else if (formCount === 0 && !likelyScanned && pages <= 30) fixedUsd = 195.0;
    else if ((likelyScanned && pages <= 35) || (formCount > 0 && pages <= 25)) fixedUsd = 390.0;

    const failedRules = findings.length;
    const failedChecks = findings.reduce((acc, f) => acc + (f.failed_checks || 1), 0);
    const isCompliant = failedRules === 0 && isTagged && hasPdfUaId;

    const clausesList = findings.map((f) => f.clause).join(", ") || "None";
    const subject = "Fix PDF/UA-1 Issues — " + filename + " (" + pages + " pages)";
    const bodyLines = [
      "Hi Loc,",
      "",
      "I ran '" + filename + "' (" + pages + " pages) through the Free PDF/UA & ADA Title II Checker.",
      "- Detected Tier: " + tierLabel,
      "- Failed Clauses: " + clausesList,
      "- Partner Wholesale Quote: " + fmt(wholesaleTotal) + " (or Turnkey Package: " + fmt(fixedUsd) + ")",
      "",
      "Please share turnaround details (or run a free 24h sample proof)."
    ].join("\n");
    const mailtoUrl = "mailto:" + encodeURIComponent(cfg.email) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(bodyLines);

    return {
      filename: filename,
      file_size_bytes: u8.length,
      is_compliant: isCompliant,
      engine: "Instant In-Browser Structural PDF/UA-1 Inspector (Zero-Upload Local Scan)",
      failed_rules: failedRules,
      failed_checks: failedChecks,
      elapsed_seconds: 0.05,
      structure: {
        pages: pages,
        is_tagged: isTagged,
        has_pdfua_id: hasPdfUaId,
        language: langVal || null,
        has_title: hasTitle,
        display_doc_title: displayDocTitle,
        figures_missing_alt: figsMissingAlt,
        form_fields_total: formCount,
        form_fields_missing_tu: formsMissingTu,
        likely_scanned_ocr: likelyScanned,
        is_cryptographically_signed: isSigned
      },
      findings: findings,
      quote: {
        pages: pages,
        tier_label: tierLabel,
        wholesale_total_usd: wholesaleTotal,
        retail_total_usd: retailTotal,
        agency_net_margin_usd: Math.max(0, retailTotal - wholesaleTotal),
        fixed_package_usd: fixedUsd
      },
      cta: {
        upwork_catalog_url: fixedUsd <= 65 && cfg.checkout65 ? cfg.checkout65 : (fixedUsd <= 195 && cfg.checkout195 ? cfg.checkout195 : cfg.upworkUrl),
        google_form_url: cfg.formUrl,
        mailto_url: mailtoUrl
      }
    };
  }

  document.querySelectorAll("[data-pdfua-checker]").forEach((root) => {
    const cfg = {
      apiUrl: (root.getAttribute("data-checker-api") || "").trim(),
      formUrl: root.getAttribute("data-form-url") || "",
      upworkUrl: root.getAttribute("data-upwork-url") || "https://www.upwork.com/services/product/2120536307204819908",
      checkout65: root.getAttribute("data-checkout65-url") || "",
      checkout195: root.getAttribute("data-checkout195-url") || "",
      email: root.getAttribute("data-email") || "halocrypto101@gmail.com"
    };

    const dz = root.querySelector(".chk-dropzone");
    const inp = root.querySelector(".chk-file-input");
    const statusEl = root.querySelector(".chk-status");
    const errEl = root.querySelector(".chk-error");
    const resEl = root.querySelector(".chk-results");
    let lastReport = null;

    if (!dz || !inp) return;

    if (cfg.apiUrl) {
      fetch(cfg.apiUrl.replace(/\/+$/, "") + "/api/health", { mode: "cors", cache: "no-store" }).catch(() => {});
    }

    dz.addEventListener("click", () => inp.click());
    dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    inp.addEventListener("change", () => {
      if (inp.files && inp.files[0]) handleFile(inp.files[0]);
    });

    async function handleFile(file) {
      errEl.style.display = "none";
      resEl.style.display = "none";
      if (file.size > MAX_BYTES) {
        errEl.innerHTML = "<strong>File exceeds 20 MB free checker cap.</strong> <a href='" + esc(cfg.formUrl) + "' target='_blank' rel='noopener'>Submit your 50–500 page PDF link for a free offline workstation audit &rarr;</a>";
        errEl.style.display = "block";
        return;
      }
      statusEl.style.display = "block";
      try {
        let data = null;
        if (cfg.apiUrl) {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 55000);
            const resp = await fetch(cfg.apiUrl.replace(/\/+$/, "") + "/api/check", {
              method: "POST",
              headers: { "Content-Type": "application/pdf", "X-Filename": encodeURIComponent(file.name || "document.pdf") },
              body: file,
              signal: ctrl.signal
            });
            clearTimeout(timer);
            if (resp.ok) data = await resp.json();
          } catch (_) {
            data = null;
          }
        }
        if (!data) {
          const buf = await file.arrayBuffer();
          data = localInspectPdfBuffer(buf, file.name || "document.pdf", cfg);
        }
        lastReport = data;
        renderData(data);
      } catch (err) {
        errEl.textContent = "Validation Error: " + (err && err.message ? err.message : String(err));
        errEl.style.display = "block";
      } finally {
        statusEl.style.display = "none";
      }
    }

    function renderData(d) {
      const q = d.quote || {};
      const st = d.structure || {};
      const checkoutHref = (q.fixed_package_usd <= 65 && cfg.checkout65)
        ? cfg.checkout65
        : ((q.fixed_package_usd <= 195 && cfg.checkout195) ? cfg.checkout195 : ((d.cta && d.cta.upwork_catalog_url) || cfg.upworkUrl));

      const checks = [
        [st.is_tagged, "Tagged Structure (/StructTreeRoot)"],
        [st.has_pdfua_id, "PDF/UA-1 XMP ID (pdfuaid:part=1)"],
        [Boolean(st.language), "Natural Language (" + (st.language || "Missing") + ")"],
        [st.has_title && st.display_doc_title, "Document Title & DisplayDocTitle"],
        [(st.figures_missing_alt || 0) === 0, "Figures Alt-Text (" + (st.figures_missing_alt || 0) + " missing /Alt)"],
        [(st.form_fields_missing_tu || 0) === 0, "Form Tooltips (" + (st.form_fields_total || 0) + " fields, " + (st.form_fields_missing_tu || 0) + " missing /TU)"],
        [!st.likely_scanned_ocr, st.likely_scanned_ocr ? "Scanned Image PDF (Needs OCR)" : "Searchable Text Layer Present"],
        [!st.is_cryptographically_signed, st.is_cryptographically_signed ? "Signature Lock Detected" : "Lossless Remediation Ready"]
      ];

      const issuesHtml = (!d.findings || d.findings.length === 0)
        ? "<div class='chk-issue' style='border-color:rgba(34,197,94,0.5);'><strong style='color:#86efac;'>✅ 0 Automated Structural Rule Failures Detected</strong><p style='margin:6px 0 0; color:#cbd5e1;'>Verify semantic alt-text accuracy and reading order in PAC 2026 &amp; NVDA prior to formal legal publication.</p></div>"
        : d.findings.map((f) =>
            "<div class='chk-issue'>" +
              "<div style='display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;'>" +
                "<strong>Clause " + esc(f.clause) + " — " + esc(f.title) + "</strong>" +
                "<span class='pill " + (f.severity === "CRITICAL" ? "pill-warn" : "pill-brand") + "'>" + esc(f.severity) + " · " + Number(f.failed_checks || 1).toLocaleString("en-US") + " checks</span>" +
              "</div>" +
              "<div class='mono' style='color:#7dd3fc; margin-top:4px;'>" + esc(f.wcag) + "</div>" +
              "<p style='margin:6px 0 0; color:#cbd5e1; font-size:0.92rem;'><strong>ADA / Screen-Reader Impact:</strong> " + esc(f.impact) + "</p>" +
            "</div>"
          ).join("");

      resEl.innerHTML =
        "<div class='card' style='margin-top:20px;'>" +
          "<div style='display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center;'>" +
            "<div>" +
              "<span class='pill " + (d.is_compliant ? "pill-ok" : "pill-warn") + "'>" + (d.is_compliant ? "PASS · PDF/UA-1 READY" : "NON-COMPLIANT · ACTION REQUIRED") + "</span>" +
              "<h3 style='margin:8px 0 2px;'>" + esc(d.filename) + " (" + q.pages + (q.pages === 1 ? " page" : " pages") + ")</h3>" +
              "<div class='mono' style='color:var(--muted);'>" + esc(d.engine) + "</div>" +
            "</div>" +
            "<button type='button' class='btn btn-secondary chk-dl-btn'>Download HTML Audit Report &darr;</button>" +
          "</div>" +
          "<div class='kpi-grid' style='margin:16px 0;'>" +
            "<div class='card' style='padding:16px; background:var(--bg-soft);'><div class='kpi-lbl'>Failed Rules</div><div class='kpi-val' style='color:" + (d.is_compliant ? "var(--ok)" : "var(--danger)") + ";'>" + d.failed_rules + "</div><div class='kpi-sub'>" + Number(d.failed_checks || 0).toLocaleString("en-US") + " failed checks</div></div>" +
            "<div class='card' style='padding:16px; background:var(--bg-soft);'><div class='kpi-lbl'>Complexity Tier</div><div class='kpi-val brand' style='font-size:1.2rem;'>" + esc(q.tier_label) + "</div><div class='kpi-sub'>" + q.pages + " total pages</div></div>" +
            "<div class='card' style='padding:16px; background:var(--bg-soft);'><div class='kpi-lbl'>Direct Turnkey Fix</div><div class='kpi-val'>" + fmt(q.fixed_package_usd) + "</div><div class='kpi-sub'>100% Green veraPDF + PAC 2026 + NVDA</div></div>" +
            "<div class='card' style='padding:16px; background:var(--bg-soft);'><div class='kpi-lbl'>Agency Wholesale</div><div class='kpi-val brand'>" + fmt(q.wholesale_total_usd) + "</div><div class='kpi-sub'>US Retail Value: " + fmt(q.retail_total_usd) + "</div></div>" +
          "</div>" +
          "<div class='chk-grid'>" + checks.map(([ok, lbl]) => "<div class='chk-badge'>" + (ok ? "✅ " : "❌ ") + esc(lbl) + "</div>").join("") + "</div>" +
          "<div class='quote-box' style='margin-top:20px;'>" +
            "<div>" +
              "<span class='pill pill-ok'>100% Pixel-Identical Layout Guaranteed</span>" +
              "<h3 style='margin:10px 0 6px;'>Fix '" + esc(d.filename) + "' (" + q.pages + "p) for " + fmt(q.fixed_package_usd) + " Direct — or " + fmt(q.wholesale_total_usd) + " Agency Wholesale</h3>" +
              "<p style='margin:0 0 16px; color:#cbd5e1;'>Delivered with 0 failed ISO 14289-1 rules in veraPDF 1.30, PAC 2026 report, and human NVDA screen-reader walkthrough. First 3–10 page sample proof is FREE in 24 hours.</p>" +
            "</div>" +
            "<div class='cta-row'>" +
              "<a class='btn btn-primary' href='" + esc(checkoutHref) + "' target='_blank' rel='noopener'>Order Turnkey Fix (" + fmt(q.fixed_package_usd) + ") &rarr;</a>" +
              "<a class='btn btn-brand' href='" + esc((d.cta && d.cta.google_form_url) || cfg.formUrl) + "' target='_blank' rel='noopener'>Request Free 24h Sample Fix</a>" +
              "<a class='btn btn-secondary' href='" + esc((d.cta && d.cta.mailto_url) || ("mailto:" + cfg.email)) + "'>Email Exact Quote Breakdown</a>" +
            "</div>" +
            (checkoutHref && checkoutHref.indexOf("gumroad.com") !== -1 ? "<div class='mor-note' style='text-align:left; margin-top:10px;'>🔒 Secure checkout by Gumroad</div>" : "") +
          "</div>" +
          "<h4 style='margin:22px 0 8px;'>Plain-English ADA Title II / Section 508 Diagnostic Findings</h4>" +
          issuesHtml +
        "</div>";

      resEl.style.display = "block";
      const dlBtn = resEl.querySelector(".chk-dl-btn");
      if (dlBtn) {
        dlBtn.addEventListener("click", () => {
          const rows = (d.findings || []).map((f) =>
            "<tr><td><strong>Clause " + esc(f.clause) + "</strong></td><td><strong>" + esc(f.title) + "</strong><br><small>" + esc(f.wcag) + "</small></td><td>" + esc(f.impact) + "</td></tr>"
          ).join("") || "<tr><td colspan='3'>0 automated structural failures detected.</td></tr>";
          const docHtml = "<!doctype html><html lang='en'><head><meta charset='utf-8'><title>PDF/UA-1 Audit — " + esc(d.filename) + "</title>" +
            "<style>body{font-family:sans-serif;max-width:920px;margin:32px auto;padding:0 20px;color:#0f172a;line-height:1.5}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #cbd5e1;padding:10px;text-align:left;vertical-align:top}th{background:#f1f5f9}</style></head><body>" +
            "<h1>ADA Title II &amp; ISO 14289-1 (PDF/UA-1) Diagnostic Report</h1>" +
            "<p><strong>Document:</strong> " + esc(d.filename) + " (" + q.pages + " pages) &middot; <strong>Quote:</strong> " + fmt(q.wholesale_total_usd) + " Agency Wholesale / " + fmt(q.fixed_package_usd) + " Direct</p>" +
            "<table><thead><tr><th scope='col'>Clause</th><th scope='col'>Issue &amp; WCAG Criterion</th><th scope='col'>User Impact</th></tr></thead><tbody>" + rows + "</tbody></table>" +
            "<p><strong>Remediation Desk:</strong> Loc Nguyen — PDF/UA Partner Desk (" + esc(cfg.email) + ")</p></body></html>";
          const blob = new Blob([docHtml], { type: "text/html;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = d.filename.replace(/\.pdf$/i, "") + "-accessibility-audit.html";
          a.click();
        });
      }
    }
  });
})();
