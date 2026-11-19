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
    let rRate = 5.0;
    if (formCount > 0) {
      tierLabel = "Interactive Fillable AcroForms";
      rRate = 15.0;
    } else if (likelyScanned) {
      tierLabel = "Scanned OCR + Searchable PDF/UA";
      rRate = 9.0;
    } else if (tableCount > 0) {
      tierLabel = "Structured Data Tables & Reports";
      rRate = 8.0;
    }
    const retailTotal = Math.max(60.0, Math.round(pages * rRate * 100) / 100);
    let licenseUsd = 9.50;
    if (pages > 150) licenseUsd = 97.50;
    else if (pages > 15) licenseUsd = 32.50;

    const failedRules = findings.length;
    const failedChecks = findings.reduce((acc, f) => acc + (f.failed_checks || 1), 0);
    const isCompliant = failedRules === 0 && isTagged && hasPdfUaId;

    const clausesList = findings.map((f) => f.clause).join(", ") || "None";
    const subject = "PDF Accessibility Studio v1.6.1 Question — " + filename + " (" + pages + " pages)";
    const bodyLines = [
      "Hello PDF/UA Partner Desk,",
      "",
      "I inspected '" + filename + "' (" + pages + " pages) in the Free PDF/UA & ADA Title II Checker:",
      "- Detected Tier: " + tierLabel,
      "- Failed Clauses: " + clausesList,
      "- Self-Serve Studio License (EARLY50 50% off): " + fmt(licenseUsd) + " (vs. " + fmt(retailTotal) + " est. manual vendor cost)",
      "",
      "Pre-sales software / CI question: "
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
        software_license_usd: licenseUsd,
        retail_total_usd: retailTotal,
        in_house_savings_usd: Math.max(0, retailTotal - licenseUsd)
      },
      cta: {
        upwork_catalog_url: licenseUsd <= 9.50 && cfg.checkout19 ? cfg.checkout19 : (licenseUsd <= 32.50 && cfg.checkout65 ? cfg.checkout65 : (cfg.checkout195 || cfg.upworkUrl)),
        google_form_url: cfg.formUrl,
        mailto_url: mailtoUrl
      }
    };
  }

  document.querySelectorAll("[data-pdfua-checker]").forEach((root) => {
    const cfg = {
      apiUrl: (root.getAttribute("data-checker-api") || "https://pdfua-ada-checker.onrender.com").trim(),
      formUrl: root.getAttribute("data-form-url") || "",
      upworkUrl: root.getAttribute("data-upwork-url") || "https://www.upwork.com/services/product/2120536307204819908",
      fiverrUrl: root.getAttribute("data-fiverr-url") || "https://www.fiverr.com/s/L34o2B0",
      fiverrDfyUrl: root.getAttribute("data-fiverr-dfy-url") || "https://www.fiverr.com/pdfua_partner/remediate-pdf-documents-for-ada-title-ii-wcag-aa-and-pdf-ua-accessibility",
      freelancerUrl: root.getAttribute("data-freelancer-url") || "https://www.freelancer.com/service/pdf/ada-title-ii-wcag-aa-and-pdf-ua-remediation",
      checkout19: root.getAttribute("data-checkout19-url") || "https://pdfuapartnerdesk.gumroad.com/l/pdfua-express-5-pages/EARLY50?wanted=true",
      checkout65: root.getAttribute("data-checkout65-url") || "https://pdfuapartnerdesk.gumroad.com/l/pdfua-remediation-12-pages/EARLY50?wanted=true",
      checkout195: root.getAttribute("data-checkout195-url") || "https://pdfuapartnerdesk.gumroad.com/l/pdfua-remediation-30-pages/EARLY50?wanted=true",
      trialInstallerUrl: root.getAttribute("data-trial-installer-url") || "https://github.com/hadesloc/pdfua-partner-desk/releases/latest",
      email: root.getAttribute("data-email") || "halocrypto101@gmail.com",
      pilotEmail: root.getAttribute("data-pilot-email") || "drtheloc@gmail.com"
    };

    const dz = root.querySelector(".chk-dropzone");
    const inp = root.querySelector(".chk-file-input");
    const demoBtn = root.querySelector(".chk-demo-btn");
    const previewFixBtn = root.querySelector(".chk-preview-fix-btn");
    const statusEl = root.querySelector(".chk-status");
    const errEl = root.querySelector(".chk-error");
    const resEl = root.querySelector(".chk-results");
    const previewResEl = root.querySelector(".chk-preview-results");
    const leadMailtoEl = root.querySelector(".chk-lead-mailto");
    const leadCopyBtn = root.querySelector(".chk-lead-copy");
    const leadToastEl = root.querySelector(".chk-lead-toast");
    const leadContextEl = root.querySelector(".chk-lead-context");
    let pendingAction = (root.getAttribute("data-default-mode") || "check").trim();
    let lastSelectedFile = null;
    let healthPinged = false;
    const apiBase = (cfg.apiUrl || "https://pdfua-ada-checker.onrender.com").replace(/\/+$/, "");

    function warmCloudEngine() {
      if (!apiBase || healthPinged) return;
      healthPinged = true;
      fetch(apiBase + "/api/health", { mode: "cors", cache: "no-store" }).catch(() => {});
    }
    let currentLeadBrief = [
      "To: " + cfg.email,
      "Subject: PDF Accessibility Studio v1.6.1 — Technical / CI Integration Question",
      "",
      "Hello PDF/UA Partner Desk,",
      "",
      "We tested our PDF in the free online checker and have a quick question about running PDF Accessibility Studio v1.6.1 locally:",
      "- PDF Type / Page Count: ",
      "- Organization / Team: "
    ].join("\n");

    if (leadCopyBtn) {
      leadCopyBtn.addEventListener("click", () => {
        const done = () => {
          if (leadToastEl) {
            leadToastEl.textContent = "Copied pre-sales software brief (" + cfg.email + ") — paste into Gmail, Outlook Web, or Slack.";
            leadToastEl.classList.add("visible");
          }
          const orig = leadCopyBtn.getAttribute("data-orig-label") || leadCopyBtn.textContent;
          leadCopyBtn.setAttribute("data-orig-label", orig);
          leadCopyBtn.textContent = "Copied inquiry & email!";
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

    root.addEventListener("focusin", warmCloudEngine, { once: true });
    root.addEventListener("mouseenter", warmCloudEngine, { once: true });
    dz.addEventListener("dragenter", warmCloudEngine, { once: true });

    if (previewFixBtn) {
      previewFixBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        warmCloudEngine();
        if (lastSelectedFile) {
          runPreviewFix(lastSelectedFile);
        } else {
          pendingAction = "preview-fix";
          inp.value = "";
          inp.click();
        }
      });
    }

    if (demoBtn) {
      demoBtn.addEventListener("click", () => {
        errEl.style.display = "none";
        const demoSubject = "PDF Accessibility Studio v1.6.1 — FY2026-Municipal-Fee-Schedule.pdf (14 pages)";
        const demoBody = [
          "Hello PDF/UA Partner Desk,",
          "",
          "I inspected 'FY2026-Municipal-Fee-Schedule.pdf' (14 pages) in the Free PDF/UA & ADA Title II Checker.",
          "- Detected Tier: Structured Data Tables & Reports",
          "- Failed Clauses: 6.2 / 7.1, 5, 7.5, 7.3",
          "- Self-Serve License (EARLY50 50% off): $9.50 Solo / $32.50 Agency (vs. $112.00 est. manual outsourcing)",
          "",
          "Pre-sales software question: "
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
              impact: "Screen readers cannot distinguish headings, fee tables, or running headers/footers."
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
            software_license_usd: 9.50,
            retail_total_usd: 112.0,
            in_house_savings_usd: 102.50
          },
          cta: {
            upwork_catalog_url: cfg.checkout19 || cfg.upworkUrl,
            google_form_url: cfg.formUrl,
            mailto_url: "mailto:" + encodeURIComponent(cfg.email) + "?subject=" + encodeURIComponent(demoSubject) + "&body=" + encodeURIComponent(demoBody)
          }
        });
      });
    }

    dz.addEventListener("click", () => {
      warmCloudEngine();
      pendingAction = (root.getAttribute("data-default-mode") || "check").trim();
      inp.value = "";
      inp.click();
    });
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        warmCloudEngine();
        pendingAction = (root.getAttribute("data-default-mode") || "check").trim();
        inp.value = "";
        inp.click();
      }
    });
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
      warmCloudEngine();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        const dropped = e.dataTransfer.files[0];
        lastSelectedFile = dropped;
        if ((root.getAttribute("data-default-mode") || "check").trim() === "preview-fix") {
          runPreviewFix(dropped);
        } else {
          handleFile(dropped);
        }
      }
    });
    inp.addEventListener("change", () => {
      warmCloudEngine();
      if (inp.files && inp.files[0]) {
        const chosen = inp.files[0];
        lastSelectedFile = chosen;
        if (pendingAction === "preview-fix") {
          runPreviewFix(chosen);
        } else {
          handleFile(chosen);
        }
      }
    });

    async function runPreviewFix(file) {
      errEl.style.display = "none";
      if (previewResEl) previewResEl.style.display = "none";
      if (file.size > MAX_BYTES) {
        errEl.innerHTML = "<strong>File exceeds 20 MB browser upload cap.</strong> <a href='" + esc(cfg.trialInstallerUrl) + "' target='_blank' rel='noopener'>Try the Free Windows Trial (&le;5 pages free)</a> or email <a href='mailto:" + esc(cfg.pilotEmail) + "'>" + esc(cfg.pilotEmail) + "</a>.";
        errEl.style.display = "block";
        return;
      }
      warmCloudEngine();
      statusEl.textContent = "Waking veraPDF 1.30.3 cloud engine (~20-35s on cold start) & running 2-page PDF/UA-1 Auto-Fix Preview…";
      statusEl.style.display = "block";
      let coldHintTimer = setTimeout(() => {
        statusEl.textContent = "Waking veraPDF 1.30.3 cloud engine (~20-35s on cold start) — applying structural repairs & verifying Before -> After counts…";
      }, 9000);
      try {
        const form = new FormData();
        form.append("file", file, file.name || "document.pdf");
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 65000);
        const resp = await fetch(apiBase + "/api/preview-fix", {
          method: "POST",
          headers: { "X-Filename": encodeURIComponent(file.name || "document.pdf") },
          body: form,
          signal: ctrl.signal
        });
        clearTimeout(timer);
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || ("Preview repair failed (" + resp.status + ")"));
        }
        renderPreviewFix(data);
      } catch (err) {
        const msg = err && err.name === "AbortError"
          ? "Cloud engine timed out waking from idle (>65s). Click 'Auto-Fix First 2 Pages Free' once more now that Render is warm, or run locally at 0s latency with our Free Windows Trial."
          : (err && err.message ? err.message : String(err));
        errEl.innerHTML = "<strong>2-Page Preview Auto-Fix Notice:</strong> " + esc(msg);
        errEl.style.display = "block";
      } finally {
        clearTimeout(coldHintTimer);
        statusEl.style.display = "none";
      }
    }

    function renderPreviewFix(d) {
      if (!previewResEl) return;
      const u = d.upgrade_ctas || {};
      const soloHref = u.solo_early50_url || cfg.checkout19;
      const agencyHref = u.agency_early50_url || cfg.checkout65;
      const fiverrHref = u.fiverr_dfy_url || cfg.fiverrDfyUrl;
      const pilotEmail = u.contact_email || cfg.pilotEmail;
      const mailtoHref = u.mailto_url || ("mailto:" + encodeURIComponent(pilotEmail) + "?subject=" + encodeURIComponent("Full PDF/UA-1 Remediation Pilot — " + (d.download_filename || "document.pdf")));
      const dlName = d.download_filename || "document-2p-preview-accessible.pdf";
      const fixes = Array.isArray(d.fixes_applied) ? d.fixes_applied : [];
      const fixesHtml = fixes.length
        ? "<ul class='feature-list' style='margin-top:10px;'>" + fixes.map((fx) => "<li>" + esc(fx) + "</li>").join("") + "</ul>"
        : "<p style='margin-top:8px; font-size:0.875rem;'>Document structure was already compliant on the preview pages.</p>";
      const badgeCls = d.verapdf_compliant ? "status-pass" : (d.after_failed_rules < d.before_failed_rules ? "status-neutral" : "status-fail");
      const badgeTxt = d.verapdf_compliant
        ? "Pass · 0 failed veraPDF 1.30.3 rules (2-page preview)"
        : "Live Preview Repaired · " + d.before_failed_rules + " -> " + d.after_failed_rules + " failed rules";

      previewResEl.innerHTML =
        "<div class='card' style='margin-top:20px; border-color:var(--pass-border);'>" +
          "<div style='display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center;'>" +
            "<div>" +
              "<span class='status-pill " + badgeCls + "'>" + esc(badgeTxt) + "</span>" +
              "<h3 style='margin-top:8px;'>" + esc(dlName) + "</h3>" +
              "<div class='mono' style='color:var(--text-muted); font-size:0.75rem; margin-top:2px;'>" + (d.verapdf_ready ? "Live veraPDF 1.30.3 Before -> After Proof" : "Structural Preview Proof") + " &middot; Files retained: " + (d.files_retained || 0) + "</div>" +
            "</div>" +
            "<button type='button' class='btn btn-primary chk-dl-preview-pdf'>Download Fixed 2-Page Preview PDF</button>" +
          "</div>" +
          "<div class='kpi-grid'>" +
            "<div class='audit-metric'><div class='kpi-lbl'>veraPDF Failed Rules</div><div class='kpi-val " + (d.verapdf_compliant ? "pass" : "accent") + "'>" + d.before_failed_rules + " &rarr; " + d.after_failed_rules + "</div><div class='kpi-sub'>" + (d.verapdf_compliant ? "100% PDF/UA-1 compliant preview" : "Reduced live in veraPDF 1.30.3") + "</div></div>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Failed Clause Checks</div><div class='kpi-val " + (d.after_failed_checks === 0 ? "pass" : "accent") + "'>" + Number(d.before_failed_checks || 0).toLocaleString("en-US") + " &rarr; " + Number(d.after_failed_checks || 0).toLocaleString("en-US") + "</div><div class='kpi-sub'>ISO 14289-1 machine checks</div></div>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Pages Repaired</div><div class='kpi-val'>" + d.pages_processed + " / " + d.total_source_pages + "</div><div class='kpi-sub'>" + (d.truncated_to_preview ? "Truncated to 2-page free preview" : "Full document within 2p preview") + "</div></div>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Zero Retention</div><div class='kpi-val pass'>0 Retained</div><div class='kpi-sub'>Deleted immediately on server</div></div>" +
          "</div>" +
          "<h4 style='margin:16px 0 4px; font-size:0.9375rem;'>Structural fixes applied to your 2-page preview</h4>" +
          fixesHtml +
          "<div class='callout-panel' style='margin-top:16px;'>" +
            "<h4 style='font-size:1.0625rem; margin-bottom:6px;'>Need all " + d.total_source_pages + " page(s) fixed (plus RapidOCR, Tables, AcroForms &amp; Batch CLI)?</h4>" +
            "<p style='font-size:0.875rem; margin-bottom:14px;'>Unlock <strong>PDF Accessibility Studio v1.6.1</strong> offline on Windows at <strong>50% off w/ EARLY50</strong> (Solo <strong>$9.50</strong> vs. $19 list &middot; Agency <strong>$32.50</strong> vs. $65 list &middot; Commercial <strong>$97.50</strong> vs. $195 list), or book Done-For-You remediation.</p>" +
            "<div class='cta-group'>" +
              "<a class='btn btn-primary' href='" + esc(soloHref) + "' target='_blank' rel='noopener'>Studio Solo ($9.50 w/ EARLY50)</a>" +
              "<a class='btn btn-secondary' href='" + esc(agencyHref) + "' target='_blank' rel='noopener'>Studio Agency ($32.50 w/ EARLY50)</a>" +
              "<a class='btn btn-secondary' href='" + esc(fiverrHref) + "' target='_blank' rel='noopener'>Done-For-You Fiverr ($45 / 15p)</a>" +
              "<a class='btn btn-secondary' href='" + esc(mailtoHref) + "'>Direct B2B Pilot (" + esc(pilotEmail) + ")</a>" +
            "</div>" +
          "</div>" +
        "</div>";

      previewResEl.style.display = "block";
      const dlPdfBtn = previewResEl.querySelector(".chk-dl-preview-pdf");
      if (dlPdfBtn && d.preview_pdf_base64) {
        dlPdfBtn.addEventListener("click", () => {
          const binStr = atob(d.preview_pdf_base64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/pdf" });
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = dlName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        });
      }
      previewResEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function handleFile(file) {
      errEl.style.display = "none";
      resEl.style.display = "none";
      if (file.size > MAX_BYTES) {
        errEl.innerHTML = "<strong>File exceeds 20 MB browser upload cap.</strong> <a href='" + esc(cfg.trialInstallerUrl) + "' target='_blank' rel='noopener'>Try the Free Windows Trial (&le;5 pages free)</a> or <a href='" + esc(cfg.checkout19) + "' target='_blank' rel='noopener'>unlock Studio Solo v1.6.1 ($9.50 w/ EARLY50) &rarr;</a>";
        errEl.style.display = "block";
        return;
      }
      statusEl.textContent = "Waking veraPDF 1.30.3 cloud engine (~20-35s on cold start) & analyzing your PDF…";
      statusEl.style.display = "block";
      let coldHintTimer = null;
      try {
        let data = null;
        let usedLocalFallback = false;
        if (cfg.apiUrl) {
          coldHintTimer = setTimeout(() => {
            statusEl.textContent = "Waking veraPDF 1.30.3 cloud engine (~20-35s on cold start) — finishing ISO 14289-1 checks (instant local browser fallback if unreachable)…";
          }, 8000);
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 60000);
            const resp = await fetch(apiBase + "/api/check", {
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
          if (coldHintTimer) clearTimeout(coldHintTimer);
        }
        if (!data) {
          usedLocalFallback = true;
          const buf = await file.arrayBuffer();
          data = localInspectPdfBuffer(buf, file.name || "document.pdf", cfg);
          if (cfg.apiUrl) {
            data.engine = "In-Browser Structural PDF/UA-1 Inspector (Cloud veraPDF timed out — zero-upload local scan)";
          }
        }
        renderData(data, usedLocalFallback);
      } catch (err) {
        if (coldHintTimer) clearTimeout(coldHintTimer);
        errEl.textContent = "Validation error: " + (err && err.message ? err.message : String(err));
        errEl.style.display = "block";
      } finally {
        statusEl.style.display = "none";
      }
    }

    function renderData(d, usedLocalFallback) {
      const q = d.quote || {};
      const st = d.structure || {};
      const pagesCount = Number(q.pages || st.pages || 1);
      const effectiveLicUsd = pagesCount <= 15 ? 9.50 : (pagesCount <= 150 ? 32.50 : 97.50);
      const estManualUsd = Number(q.retail_total_usd || Math.max(60.0, pagesCount * 8.0));
      let checkoutHref = effectiveLicUsd <= 9.50
        ? cfg.checkout19
        : (effectiveLicUsd <= 32.50 ? cfg.checkout65 : cfg.checkout195);
      if (checkoutHref && checkoutHref.indexOf("gumroad.com/l/") !== -1) {
        if (checkoutHref.indexOf("compliance-starter-kit") === -1 && checkoutHref.indexOf("/EARLY50") === -1) {
          const parts = checkoutHref.split("?");
          checkoutHref = parts[0].replace(/\/+$/, "") + "/EARLY50" + (parts[1] ? "?" + parts[1] : "");
        }
        if (checkoutHref.indexOf("wanted=") === -1) {
          checkoutHref += (checkoutHref.indexOf("?") === -1 ? "?" : "&") + "wanted=true";
        }
      }

      const checks = [
        [st.is_tagged, "Tagged structure (/StructTreeRoot)"],
        [st.has_pdfua_id, "PDF/UA-1 XMP ID (pdfuaid:part=1)"],
        [Boolean(st.language), "Natural language (" + (st.language || "Missing") + ")"],
        [st.has_title && st.display_doc_title, "Document title & DisplayDocTitle"],
        [(st.figures_missing_alt || 0) === 0, "Figures alt text (" + (st.figures_missing_alt || 0) + " missing /Alt)"],
        [(st.form_fields_missing_tu || 0) === 0, "Form tooltips (" + (st.form_fields_total || 0) + " fields, " + (st.form_fields_missing_tu || 0) + " missing /TU)"],
        [!st.likely_scanned_ocr, st.likely_scanned_ocr ? "Scanned image PDF (needs RapidOCR 3 Tr)" : "Searchable text layer present"],
        [!st.is_cryptographically_signed, st.is_cryptographically_signed ? "Signature lock detected" : "Local auto-tag repair ready"]
      ];

      const clausesSummary = (d.findings || []).map((f) => f.clause).join(", ") || "None";
      const leadSubj = "PDF Accessibility Studio v1.6.1 Question — " + d.filename + " (" + d.failed_rules + " failed rules)";
      const leadBody = [
        "Hello PDF/UA Partner Desk,",
        "",
        "We ran '" + d.filename + "' (" + pagesCount + " pages) in the free checker and have a software / CI workflow question:",
        "- Diagnostic Result: " + d.failed_rules + " failed rules / " + Number(d.failed_checks || 0) + " failed checks (Clauses: " + clausesSummary + ")",
        "- Detected Tier: " + (q.tier_label || "Standard"),
        "- Question: "
      ].join("\n");
      currentLeadBrief = "To: " + cfg.email + "\nSubject: " + leadSubj + "\n\n" + leadBody;
      if (leadMailtoEl) {
        leadMailtoEl.setAttribute("href", "mailto:" + encodeURIComponent(cfg.email) + "?subject=" + encodeURIComponent(leadSubj) + "&body=" + encodeURIComponent(leadBody));
      }
      if (leadContextEl) {
        leadContextEl.textContent = "Inspected '" + d.filename + "' (" + d.failed_rules + " failed rules across " + pagesCount + "p): test full Auto-Fix free on ≤5-page PDFs with our Windows installer, or unlock unlimited pages with Studio v1.6.1 ($9.50 Solo / $32.50 Agency w/ EARLY50).";
      }

      const copyBriefText = [
        "To: " + cfg.email,
        "Subject: PDF Accessibility Studio v1.6.1 ROI Summary — " + d.filename + " (" + pagesCount + " pages)",
        "",
        "Diagnostic Summary:",
        "- File: " + d.filename + " (" + pagesCount + " pages)",
        "- Detected Tier: " + (q.tier_label || "Standard"),
        "- Failed Clauses: " + clausesSummary + " (" + d.failed_rules + " rules / " + Number(d.failed_checks || 0) + " checks)",
        "- Est. Manual Outsourcing Cost ($5–$15/pg): " + fmt(estManualUsd),
        "- PDF Accessibility Studio v1.6.1 License (EARLY50 50% off): " + fmt(effectiveLicUsd) + " (unlimited local PDFs)"
      ].join("\n");

      const issuesHtml = (!d.findings || d.findings.length === 0)
        ? "<div class='chk-issue' style='border-left-color:var(--pass-ink);'><strong style='color:var(--pass-ink);'>0 automated structural rule failures detected</strong><p style='margin-top:4px; font-size:0.875rem;'>Follow the included OPERATOR-QA.md post-automation checklist (human_review: PENDING) for your team's final reading-order and alt-text review before publication.</p></div>"
        : d.findings.map((f) =>
            "<div class='chk-issue'>" +
              "<div style='display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;'>" +
                "<strong style='color:var(--text); font-size:0.9375rem;'>Clause " + esc(f.clause) + " — " + esc(f.title) + "</strong>" +
                "<span class='status-pill " + (f.severity === "CRITICAL" ? "status-fail" : "status-neutral") + "'>" + esc(f.severity) + " &middot; " + Number(f.failed_checks || 1).toLocaleString("en-US") + " checks</span>" +
              "</div>" +
              "<div class='mono' style='color:var(--accent-ink); margin-top:4px; font-size:0.8125rem;'>" + esc(f.wcag) + "</div>" +
              "<p style='margin-top:6px; font-size:0.875rem;'><strong>Assistive-tech impact:</strong> " + esc(f.impact) + "</p>" +
            "</div>"
          ).join("");

      resEl.innerHTML =
        "<div class='card' style='margin-top:20px;'>" +
          "<div style='display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center;'>" +
            "<div>" +
              "<span class='status-pill " + (d.is_compliant ? "status-pass" : "status-fail") + "'>" + (d.is_compliant ? "Pass · PDF/UA-1" : "Non-compliant · " + d.failed_rules + " failed rules") + "</span>" +
              "<h3 style='margin-top:8px;'>" + esc(d.filename) + " (" + pagesCount + (pagesCount === 1 ? " page" : " pages") + ")</h3>" +
              "<div class='mono' style='color:var(--text-muted); font-size:0.75rem; margin-top:2px;'>" + esc(d.engine) + "</div>" +
            "</div>" +
            "<div class='cta-group' style='margin-top:0;'>" +
              "<button type='button' class='btn btn-primary btn-sm chk-inline-preview-fix-btn'>Auto-Fix First 2 Pages Free</button>" +
              "<button type='button' class='btn btn-secondary btn-sm chk-dl-btn'>Download HTML report</button>" +
            "</div>" +
          "</div>" +
          "<div class='kpi-grid'>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Failed rules</div><div class='kpi-val " + (d.is_compliant ? "pass" : "fail") + "'>" + d.failed_rules + "</div><div class='kpi-sub'>" + Number(d.failed_checks || 0).toLocaleString("en-US") + " failed checks</div></div>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Document tier</div><div class='kpi-val' style='font-size:1.05rem;'>" + esc(q.tier_label || "Standard PDF") + "</div><div class='kpi-sub'>" + pagesCount + " total pages</div></div>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Studio v1.6.1 (EARLY50)</div><div class='kpi-val accent'>" + fmt(effectiveLicUsd) + "</div><div class='kpi-sub'>Free trial ≤5p · Unlimited w/ key</div></div>" +
            "<div class='audit-metric'><div class='kpi-lbl'>Manual vendor cost</div><div class='kpi-val'>" + fmt(estManualUsd) + "</div><div class='kpi-sub'>Save " + fmt(Math.max(0, estManualUsd - effectiveLicUsd)) + " in-house</div></div>" +
          "</div>" +
          "<div class='chk-grid'>" + checks.map(([ok, lbl]) => "<div class='chk-badge'><strong style='color:" + (ok ? "var(--pass-ink)" : "var(--fail-ink)") + ";'>" + (ok ? "Pass:" : "Issue:") + "</strong> " + esc(lbl) + "</div>").join("") + "</div>" +
          "<div class='callout-panel' style='margin-top:16px;'>" +
            "<h4 style='font-size:1.0625rem; margin-bottom:6px;'>Auto-tag &amp; repair '" + esc(d.filename) + "' locally — Free ≤5p Trial or " + fmt(effectiveLicUsd) + " (EARLY50)</h4>" +
            "<p style='font-size:0.875rem; margin-bottom:14px;'>" + (pagesCount <= 5 ? "<strong>Good news: '" + esc(d.filename) + "' is " + pagesCount + " page(s), so it qualifies for our 100% Free Windows Trial</strong> (full Auto-Fix, OCR, Forms &amp; export on ≤5-page PDFs). " : "") + "Run <strong>PDF Accessibility Studio v1.6.1</strong> locally on Windows for <code>pdfa11y</code> auto-tagging, <code>CIDSet</code>/<code>ToUnicode</code> font repair, offline RapidOCR <code>3 Tr</code>, and <code>veraPDF 1.30.3</code> validation.</p>" +
            "<div class='cta-group'>" +
              "<a class='btn btn-primary' href='" + esc(pagesCount <= 5 ? cfg.trialInstallerUrl : checkoutHref) + "' target='_blank' rel='noopener'>" + (pagesCount <= 5 ? "Download Free Windows Trial (≤5p Free)" : "Unlock Studio v1.6.1 (" + fmt(effectiveLicUsd) + " w/ EARLY50)") + "</a>" +
              "<a class='btn btn-secondary' href='" + esc(cfg.trialInstallerUrl) + "' target='_blank' rel='noopener'>Free Windows Installer (≤5p Trial)</a>" +
              "<a class='btn btn-secondary' href='" + esc(cfg.checkout19) + "' target='_blank' rel='noopener'>Studio Solo ($9.50 w/ EARLY50)</a>" +
              "<a class='btn btn-secondary' href='" + esc(cfg.checkout65) + "' target='_blank' rel='noopener'>Studio Agency ($32.50 w/ EARLY50)</a>" +
              "<button type='button' class='btn btn-secondary chk-copy-quote-btn'>Copy diagnostic summary</button>" +
            "</div>" +
            "<div class='copy-toast chk-copy-toast' role='status' aria-live='polite'></div>" +
            (checkoutHref && checkoutHref.indexOf("gumroad.com") !== -1 ? "<div class='checkout-caption' style='text-align:left; margin-top:8px;'>Instant 24/7 ZIP download via Gumroad (EARLY50 50% off auto-applied · 30-day money-back guarantee)</div>" : "") +
            "<div class='escrow-strip'><span>Marketplace software catalogs:</span>" +
              "<a class='escrow-pill' href='" + esc(cfg.upworkUrl) + "' target='_blank' rel='noopener'>Upwork Catalog</a>" +
              "<a class='escrow-pill' href='" + esc(cfg.fiverrUrl) + "' target='_blank' rel='noopener'>Fiverr Gig</a>" +
              "<a class='escrow-pill' href='" + esc(cfg.freelancerUrl) + "' target='_blank' rel='noopener'>Freelancer</a>" +
            "</div>" +
          "</div>" +
          "<h4 style='margin:20px 0 8px; font-size:0.9375rem;'>Diagnostic clause findings</h4>" +
          issuesHtml +
        "</div>";

      resEl.style.display = "block";
      const inlineFixBtn = resEl.querySelector(".chk-inline-preview-fix-btn");
      if (inlineFixBtn) {
        inlineFixBtn.addEventListener("click", () => {
          warmCloudEngine();
          if (lastSelectedFile) {
            runPreviewFix(lastSelectedFile);
          } else {
            pendingAction = "preview-fix";
            inp.value = "";
            inp.click();
          }
        });
      }
      const copyQuoteBtn = resEl.querySelector(".chk-copy-quote-btn");
      const copyToastEl = resEl.querySelector(".chk-copy-toast");
      if (copyQuoteBtn) {
        copyQuoteBtn.addEventListener("click", () => {
          const done = () => {
            if (copyToastEl) {
              copyToastEl.textContent = "Copied diagnostic ROI summary (" + cfg.email + ") — paste into Gmail, Outlook Web, or Slack.";
              copyToastEl.classList.add("visible");
            }
            copyQuoteBtn.textContent = "Copied summary!";
            setTimeout(() => { copyQuoteBtn.textContent = "Copy diagnostic summary"; }, 2200);
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
            "<p><strong>Document:</strong> " + esc(d.filename) + " (" + pagesCount + " pages) &middot; <strong>Self-Serve Software License (EARLY50):</strong> " + fmt(effectiveLicUsd) + " (vs. " + fmt(estManualUsd) + " est. manual vendor cost)</p>" +
            "<table><thead><tr><th scope='col'>Clause</th><th scope='col'>Issue &amp; WCAG Criterion</th><th scope='col'>Assistive-Tech Impact</th></tr></thead><tbody>" + rows + "</tbody></table>" +
            "<p><strong>Software Suite:</strong> PDF/UA Partner Desk (" + esc(cfg.email) + ") — Deterministic automated software; not legal advice.</p></body></html>";
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
