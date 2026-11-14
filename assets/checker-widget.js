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
        wcag: "ISO 14289-1 §5 · Automated PDF/UA-1 Conformance Gate",
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
    if (formCount === 0 && !likelyScanned && pages <= 5) fixedUsd = 19.0;
    else if (formCount === 0 && !likelyScanned && tableCount === 0 && pages <= 12) fixedUsd = 65.0;
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
      engine: "In-Browser Structural PDF/UA-1 Inspector (Zero-Upload Local Scan)",
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
        upwork_catalog_url: fixedUsd <= 19 && cfg.checkout19 ? cfg.checkout19 : (fixedUsd <= 65 && cfg.checkout65 ? cfg.checkout65 : (fixedUsd <= 195 && cfg.checkout195 ? cfg.checkout195 : cfg.upworkUrl)),
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
      fiverrUrl: root.getAttribute("data-fiverr-url") || "https://www.fiverr.com/s/L34o2B0",
      freelancerUrl: root.getAttribute("data-freelancer-url") || "https://www.freelancer.com/service/pdf/ada-title-ii-wcag-aa-and-pdf-ua-remediation",
      checkout19: root.getAttribute("data-checkout19-url") || "https://pdfuapartnerdesk.gumroad.com/l/pdfua-express-5-pages?wanted=true",
      checkout65: root.getAttribute("data-checkout65-url") || "https://pdfuapartnerdesk.gumroad.com/l/pdfua-remediation-12-pages?wanted=true",
      checkout195: root.getAttribute("data-checkout195-url") || "https://pdfuapartnerdesk.gumroad.com/l/pdfua-remediation-30-pages?wanted=true",
      email: root.getAttribute("data-email") || "halocrypto101@gmail.com"
    };

    const dz = root.querySelector(".chk-dropzone");
    const inp = root.querySelector(".chk-file-input");
    const demoBtn = root.querySelector(".chk-demo-btn");
    const statusEl = root.querySelector(".chk-status");
    const errEl = root.querySelector(".chk-error");
    const resEl = root.querySelector(".chk-results");
    const leadMailtoEl = root.querySelector(".chk-lead-mailto");
    const leadCopyBtn = root.querySelector(".chk-lead-copy");
    const leadToastEl = root.querySelector(".chk-lead-toast");
    const leadContextEl = root.querySelector(".chk-lead-context");
    let currentLeadBrief = [
      "To: " + cfg.email,
      "Subject: Free Clause Report + 1 Remediated Sample Page ($0)",
      "",
      "Hi Loc,",
      "",
      "Please send a free veraPDF 1.30.3 clause report + 1 remediated sample page ($0 cost):",
      "- PDF Filename or Public URL: ",
      "- Organization / Agency: ",
      "- Target Deadline: "
    ].join("\n");

    if (leadCopyBtn) {
      leadCopyBtn.addEventListener("click", () => {
        const done = () => {
          if (leadToastEl) {
            leadToastEl.textContent = "Copied $0 sample & clause-report request (" + cfg.email + ") — paste into Gmail, Outlook Web, or Slack and attach your PDF.";
            leadToastEl.classList.add("visible");
          }
          const orig = leadCopyBtn.getAttribute("data-orig-label") || leadCopyBtn.textContent;
          leadCopyBtn.setAttribute("data-orig-label", orig);
          leadCopyBtn.textContent = "Copied $0 request & email!";
          setTimeout(() => { leadCopyBtn.textContent = orig; }, 2200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(currentLeadBrief).then(done).catch(done);
        } else {
          done();
        }
      });
    }

    if (!dz || !inp) return;

    if (cfg.apiUrl) {
      fetch(cfg.apiUrl.replace(/\/+$/, "") + "/api/health", { mode: "cors", cache: "no-store" }).catch(() => {});
    }

    if (demoBtn) {
      demoBtn.addEventListener("click", () => {
        errEl.style.display = "none";
        const demoSubject = "Fix PDF/UA-1 Issues — FY2026-Municipal-Fee-Schedule.pdf (14 pages)";
        const demoBody = [
          "Hi Loc,",
          "",
          "I ran 'FY2026-Municipal-Fee-Schedule.pdf' (14 pages) through the Free PDF/UA & ADA Title II Checker.",
          "- Detected Tier: Structured Data Tables & Reports",
          "- Failed Clauses: 6.2 / 7.1, 5, 7.5, 7.18.3",
          "- Partner Wholesale Quote: $42.00 (or Turnkey Package: $195.00)",
          "",
          "Please share turnaround details (or run a free 24h sample proof)."
        ].join("\n");
        renderData({
          filename: "FY2026-Municipal-Fee-Schedule.pdf",
          file_size_bytes: 418304,
          is_compliant: false,
          engine: "Sample Diagnostic Preview · veraPDF 1.30.3 (ISO 14289-1:2014)",
          failed_rules: 4,
          failed_checks: 96,
          elapsed_seconds: 0.42,
          structure: {
            pages: 14,
            is_tagged: false,
            has_pdfua_id: false,
            language: "en-US",
            has_title: false,
            display_doc_title: false,
            figures_missing_alt: 2,
            form_fields_total: 0,
            form_fields_missing_tu: 0,
            likely_scanned_ocr: false,
            is_cryptographically_signed: false
          },
          findings: [
            {
              clause: "6.2 / 7.1",
              severity: "CRITICAL",
              title: "Untagged PDF — Missing Logical Structure Tree (/StructTreeRoot)",
              wcag: "WCAG 2.1 SC 1.3.1 Info & Relationships · 1.3.2 Meaningful Sequence (Level A)",
              failed_checks: 68,
              impact: "Screen readers (NVDA, JAWS, VoiceOver) cannot distinguish headings, fee tables, or running headers/footers."
            },
            {
              clause: "7.5",
              severity: "CRITICAL",
              title: "Data Tables Missing Explicit Header Cell Scope (/Scope Column / Row)",
              wcag: "WCAG 2.1 SC 1.3.1 Info & Relationships — Data Tables",
              failed_checks: 24,
              impact: "Blind residents hear raw dollar figures without column or row context across multi-page municipal fee tables."
            },
            {
              clause: "5",
              severity: "HIGH",
              title: "Missing ISO 14289-1 (PDF/UA-1) XMP Conformance Metadata (pdfuaid:part=1)",
              wcag: "ISO 14289-1 §5 · Automated PDF/UA-1 Conformance Gate",
              failed_checks: 1,
              impact: "Automated ADA Title II and procurement validators flag the document as non-certified."
            },
            {
              clause: "7.3",
              severity: "CRITICAL",
              title: "Figures / Seals Missing Alternative Text (/Alt)",
              wcag: "WCAG 2.1 SC 1.1.1 Non-text Content (Level A)",
              failed_checks: 3,
              impact: "Department seal and rate chart graphics announce as unlabeled images."
            }
          ],
          quote: {
            pages: 14,
            tier_label: "Structured Data Tables & Reports",
            wholesale_total_usd: 42.0,
            retail_total_usd: 112.0,
            agency_net_margin_usd: 70.0,
            fixed_package_usd: 195.0
          },
          cta: {
            upwork_catalog_url: cfg.checkout195 || cfg.upworkUrl,
            google_form_url: cfg.formUrl,
            mailto_url: "mailto:" + encodeURIComponent(cfg.email) + "?subject=" + encodeURIComponent(demoSubject) + "&body=" + encodeURIComponent(demoBody)
          }
        });
      });
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
        errEl.innerHTML = "<strong>File exceeds 20 MB free checker cap.</strong> <a href='" + esc(cfg.formUrl) + "' target='_blank' rel='noopener'>Submit larger PDFs via our sample intake form &rarr;</a>";
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
        renderData(data);
      } catch (err) {
        errEl.textContent = "Validation error: " + (err && err.message ? err.message : String(err));
        errEl.style.display = "block";
      } finally {
        statusEl.style.display = "none";
      }
    }

    function renderData(d) {
      const q = d.quote || {};
      const st = d.structure || {};
      const effectivePkgUsd = (q.pages >= 1 && q.pages <= 5 && !st.likely_scanned_ocr && (st.form_fields_total || 0) === 0)
        ? 19.0
        : q.fixed_package_usd;
      let checkoutHref = (effectivePkgUsd <= 19 && cfg.checkout19)
        ? cfg.checkout19
        : ((effectivePkgUsd <= 65 && cfg.checkout65)
          ? cfg.checkout65
          : ((effectivePkgUsd <= 195 && cfg.checkout195) ? cfg.checkout195 : ((d.cta && d.cta.upwork_catalog_url) || cfg.upworkUrl)));
      if (checkoutHref && checkoutHref.indexOf("gumroad.com/l/") !== -1 && checkoutHref.indexOf("wanted=") === -1) {
        checkoutHref += (checkoutHref.indexOf("?") === -1 ? "?" : "&") + "wanted=true";
      }

      const checks = [
        [st.is_tagged, "Tagged structure (/StructTreeRoot)"],
        [st.has_pdfua_id, "PDF/UA-1 XMP ID (pdfuaid:part=1)"],
        [Boolean(st.language), "Natural language (" + (st.language || "Missing") + ")"],
        [st.has_title && st.display_doc_title, "Document title & DisplayDocTitle"],
        [(st.figures_missing_alt || 0) === 0, "Figures alt text (" + (st.figures_missing_alt || 0) + " missing /Alt)"],
        [(st.form_fields_missing_tu || 0) === 0, "Form tooltips (" + (st.form_fields_total || 0) + " fields, " + (st.form_fields_missing_tu || 0) + " missing /TU)"],
        [!st.likely_scanned_ocr, st.likely_scanned_ocr ? "Scanned image PDF (needs OCR)" : "Searchable text layer present"],
        [!st.is_cryptographically_signed, st.is_cryptographically_signed ? "Signature lock detected" : "Lossless remediation ready"]
      ];

      const clausesSummary = (d.findings || []).map((f) => f.clause).join(", ") || "None";
      const leadSubj = "Free Clause Report + 1 Remediated Sample Page ($0) — " + d.filename + " (" + d.failed_rules + " failed rules)";
      const leadBody = [
        "Hi Loc,",
        "",
        "Please send the full veraPDF 1.30.3 clause report + 1 remediated sample page ($0 cost) for:",
        "- Scanned File: " + d.filename + " (" + q.pages + " pages)",
        "- Diagnostic Result: " + d.failed_rules + " failed rules / " + Number(d.failed_checks || 0) + " failed checks (Clauses: " + clausesSummary + ")",
        "- Detected Tier: " + (q.tier_label || "Standard"),
        "",
        "I have attached the PDF (or public URL) to this email."
      ].join("\n");
      currentLeadBrief = "To: " + cfg.email + "\nSubject: " + leadSubj + "\n\n" + leadBody;
      if (leadMailtoEl) {
        leadMailtoEl.setAttribute("href", "mailto:" + encodeURIComponent(cfg.email) + "?subject=" + encodeURIComponent(leadSubj) + "&body=" + encodeURIComponent(leadBody));
      }
      if (leadContextEl) {
        leadContextEl.textContent = "Ready for '" + d.filename + "' (" + d.failed_rules + " failed rules across " + q.pages + "p): get a full clause breakdown + 1 remediated sample page at 0 failed rules ($0 cost) within 24h.";
      }

      const copyBriefText = [
        "To: " + cfg.email,
        "Subject: Fix PDF/UA-1 Issues — " + d.filename + " (" + q.pages + " pages)",
        "",
        "Hi Loc,",
        "",
        "Please lock in our remediation quote or run a complimentary 24-hour proof sample:",
        "- File: " + d.filename + " (" + q.pages + " pages)",
        "- Detected Tier: " + (q.tier_label || "Standard"),
        "- Failed Clauses: " + clausesSummary + " (" + d.failed_rules + " rules / " + Number(d.failed_checks || 0) + " checks)",
        "- Agency Wholesale Quote: " + fmt(q.wholesale_total_usd) + " (US Retail Value: " + fmt(q.retail_total_usd) + ")",
        "- Fixed Turnkey Option: " + fmt(effectivePkgUsd)
      ].join("\n");

      const issuesHtml = (!d.findings || d.findings.length === 0)
        ? "<div class='chk-issue' style='border-left-color:var(--pass-ink);'><strong style='color:var(--pass-ink);'>0 automated structural rule failures detected</strong><p style='margin-top:4px; font-size:0.875rem;'>Verify semantic alt-text accuracy and screen-reader reading order in NVDA prior to publication.</p></div>"
        : d.findings.map((f) =>
            "<div class='chk-issue'>" +
              "<div style='display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;'>" +
                "<strong style='color:var(--text); font-size:0.9375rem;'>Clause " + esc(f.clause) + " — " + esc(f.title) + "</strong>" +
                "<span class='status-pill " + (f.severity === "CRITICAL" ? "status-fail" : "status-neutral") + "'>" + esc(f.severity) + " &middot; " + Number(f.failed_checks || 1).toLocaleString("en-US") + " checks</span>" +
              "</div>" +
              "<div class='mono' style='color:var(--accent-ink); margin-top:4px; font-size:0.8125rem;'>" + esc(f.wcag) + "</div>" +
              "<p style='margin-top:6px; font-size:0.875rem;'><strong>Screen-reader impact:</strong> " + esc(f.impact) + "</p>" +
            "</div>"
          ).join("");

      resEl.innerHTML =
        "<div class='card' style='margin-top:20px;'>" +
          "<div style='display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center;'>" +
            "<div>" +
              "<span class='status-pill " + (d.is_compliant ? "status-pass" : "status-fail") + "'>" + (d.is_compliant ? "Pass · PDF/UA-1" : "Non-compliant · " + d.failed_rules + " failed rules") + "</span>" +
              "<h3 style='margin-top:8px;'>" + esc(d.filename) + " (" + q.pages + (q.pages === 1 ? " page" : " pages") + ")</h3>" +
              "<div class='mono' style='color:var(--text-muted); font-size:0.75rem; margin-top:2px;'>" + esc(d.engine) + "</div>" +
            "</div>" +
            "<button type='button' class='btn btn-secondary btn-sm chk-dl-btn'>Download HTML report</button>" +
          "</div>" +
          "<div class='kpi-grid'>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Failed rules</div><div class='kpi-val " + (d.is_compliant ? "pass" : "fail") + "'>" + d.failed_rules + "</div><div class='kpi-sub'>" + Number(d.failed_checks || 0).toLocaleString("en-US") + " failed checks</div></div>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Document tier</div><div class='kpi-val' style='font-size:1.05rem;'>" + esc(q.tier_label) + "</div><div class='kpi-sub'>" + q.pages + " total pages</div></div>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Turnkey package</div><div class='kpi-val accent'>" + fmt(effectivePkgUsd) + "</div><div class='kpi-sub'>veraPDF 1.30.3 + NVDA QA</div></div>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Agency wholesale</div><div class='kpi-val'>" + fmt(q.wholesale_total_usd) + "</div><div class='kpi-sub'>Typical US retail: " + fmt(q.retail_total_usd) + "</div></div>" +
          "</div>" +
          "<div class='chk-grid'>" + checks.map(([ok, lbl]) => "<div class='chk-badge'><strong style='color:" + (ok ? "var(--pass-ink)" : "var(--fail-ink)") + ";'>" + (ok ? "Pass:" : "Issue:") + "</strong> " + esc(lbl) + "</div>").join("") + "</div>" +
          "<div class='callout-panel' style='margin-top:16px;'>" +
            "<h4 style='font-size:1.0625rem; margin-bottom:6px;'>Remediate '" + esc(d.filename) + "' (" + q.pages + "p) — " + fmt(effectivePkgUsd) + " turnkey or " + fmt(q.wholesale_total_usd) + " wholesale</h4>" +
            "<p style='font-size:0.875rem; margin-bottom:14px;'>Delivered with pixel-identical visual layout, 0 failed ISO 14289-1 rules in veraPDF 1.30.3, NVDA reading-order QA, and SHA-256 manifest. $19 Express Fix available for 1–5p PDFs.</p>" +
            "<div class='cta-group'>" +
              "<a class='btn btn-primary' href='" + esc(checkoutHref) + "' target='_blank' rel='noopener'>Order remediation (" + fmt(effectivePkgUsd) + ")</a>" +
              "<a class='btn btn-secondary' href='" + esc(cfg.checkout19) + "' target='_blank' rel='noopener'>$19 Express (1–5p)</a>" +
              "<a class='btn btn-secondary' href='" + esc((d.cta && d.cta.mailto_url) || ("mailto:" + cfg.email)) + "'>Email wholesale quote</a>" +
              "<button type='button' class='btn btn-secondary chk-copy-quote-btn'>Copy quote brief &amp; email</button>" +
            "</div>" +
            "<div class='copy-toast chk-copy-toast' role='status' aria-live='polite'></div>" +
            (checkoutHref && checkoutHref.indexOf("gumroad.com") !== -1 ? "<div class='checkout-caption' style='text-align:left; margin-top:8px;'>Secure instant card checkout by Gumroad</div>" : "") +
            "<div class='escrow-strip'><span>Marketplace escrow rails:</span>" +
              "<a class='escrow-pill' href='" + esc(cfg.fiverrUrl) + "' target='_blank' rel='noopener'>Fiverr Escrow</a>" +
              "<a class='escrow-pill' href='" + esc(cfg.freelancerUrl) + "' target='_blank' rel='noopener'>Freelancer Escrow</a>" +
              "<a class='escrow-pill' href='" + esc(cfg.upworkUrl) + "' target='_blank' rel='noopener'>Upwork Catalog</a>" +
            "</div>" +
          "</div>" +
          "<h4 style='margin:20px 0 8px; font-size:0.9375rem;'>Diagnostic clause findings</h4>" +
          issuesHtml +
        "</div>";

      resEl.style.display = "block";
      const copyQuoteBtn = resEl.querySelector(".chk-copy-quote-btn");
      const copyToastEl = resEl.querySelector(".chk-copy-toast");
      if (copyQuoteBtn) {
        copyQuoteBtn.addEventListener("click", () => {
          const done = () => {
            if (copyToastEl) {
              copyToastEl.textContent = "Copied diagnostic quote & " + cfg.email + " — paste into Gmail, Outlook Web, or Slack.";
              copyToastEl.classList.add("visible");
            }
            copyQuoteBtn.textContent = "Copied quote & email!";
            setTimeout(() => { copyQuoteBtn.textContent = "Copy quote brief & email"; }, 2200);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(copyBriefText).then(done).catch(() => {});
          } else {
            done();
          }
        });
      }
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
