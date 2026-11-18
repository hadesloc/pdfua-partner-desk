(function () {
  const rates = {
    simple: { retail: 5.0 },
    tables: { retail: 8.0 },
    ocr: { retail: 9.0 },
    forms: { retail: 15.0 }
  };

  const fields = ["simple", "tables", "ocr", "forms"];
  const fmt = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let currentQuoteBrief = "";

  function copyWithFeedback(text, statusEl, fallbackWrapEl, btnEl, copiedLabel) {
    const origLabel = btnEl ? (btnEl.getAttribute("data-orig-label") || btnEl.textContent) : "";
    if (btnEl && !btnEl.getAttribute("data-orig-label")) {
      btnEl.setAttribute("data-orig-label", origLabel);
    }

    function showSuccess() {
      if (statusEl) {
        statusEl.textContent = "Copied brief & halocrypto101@gmail.com to clipboard — paste directly into Gmail, Outlook Web, or Slack.";
        statusEl.classList.add("visible");
      }
      if (btnEl && copiedLabel) {
        btnEl.textContent = copiedLabel;
        setTimeout(() => {
          btnEl.textContent = origLabel;
        }, 2400);
      }
    }

    function fallbackExecCopy() {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) {
          showSuccess();
          return;
        }
      } catch (_) {}
      if (fallbackWrapEl) {
        const box = fallbackWrapEl.querySelector("textarea");
        if (box) box.value = text;
        fallbackWrapEl.classList.add("visible");
      }
      if (statusEl) {
        statusEl.textContent = "Clipboard restricted by browser — select and copy the pre-formatted brief below (halocrypto101@gmail.com).";
        statusEl.classList.add("visible");
      }
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).then(showSuccess).catch(fallbackExecCopy);
    } else {
      fallbackExecCopy();
    }
  }

  function syncPair(key, source) {
    const rangeEl = document.getElementById("rng-" + key);
    const numEl = document.getElementById("num-" + key);
    if (!rangeEl || !numEl) return;
    if (source === "range") {
      numEl.value = rangeEl.value;
    } else {
      const v = Math.max(0, parseInt(numEl.value || "0", 10) || 0);
      numEl.value = v;
      rangeEl.value = Math.min(parseInt(rangeEl.max, 10), v);
    }
    document.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    recalc();
  }

  function recalc() {
    let pages = 0;
    let rawRetail = 0;
    const vals = {};
    fields.forEach((k) => {
      const numEl = document.getElementById("num-" + k);
      const count = numEl ? Math.max(0, parseInt(numEl.value || "0", 10) || 0) : 0;
      vals[k] = count;
      pages += count;
      rawRetail += count * rates[k].retail;
    });

    const retailMinApplied = pages > 0 && rawRetail < 60.0;
    const retail = pages > 0 ? Math.max(60.0, rawRetail) : 0.0;
    let softwareCost = 0.0;
    let tierNote = "No license needed ($0.00)";
    if (pages >= 1 && pages <= 15) {
      softwareCost = 9.50;
      tierNote = "Studio Solo v1.6.1 w/ EARLY50 (reg. $19 · unlimited local PDFs)";
    } else if (pages > 15 && pages <= 150) {
      softwareCost = 32.50;
      tierNote = "Studio Agency v1.6.1 w/ EARLY50 (reg. $65 · multi-folder batch + white-label reports)";
    } else if (pages > 150) {
      softwareCost = 97.50;
      tierNote = "Studio Commercial v1.6.1 w/ EARLY50 (reg. $195 · multi-seat + CI/SaaS source)";
    }
    const profit = Math.max(0, retail - softwareCost);
    const marginPct = retail > 0 ? ((profit / retail) * 100).toFixed(1) : "0.0";

    const setTxt = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setTxt("out-pages", pages.toLocaleString("en-US") + (pages === 1 ? " page" : " pages"));
    setTxt("out-retail", fmt(retail));
    setTxt("out-wholesale", fmt(softwareCost));
    setTxt("out-profit", fmt(profit));
    setTxt("out-margin", marginPct + "% software savings / agency margin");

    const retailNoteEl = document.getElementById("out-retail-note");
    if (retailNoteEl) {
      retailNoteEl.textContent = retailMinApplied
        ? "$60.00 manual vendor minimum applied ($5–$15/pg)"
        : "Industry manual outsourcing ($5–$15/pg, $60 min)";
      retailNoteEl.className = retailMinApplied ? "min-badge" : "summary-subnote";
    }
    const wholesaleNoteEl = document.getElementById("out-wholesale-note");
    if (wholesaleNoteEl) {
      wholesaleNoteEl.textContent = tierNote;
      wholesaleNoteEl.className = pages > 0 ? "min-badge" : "summary-subnote";
    }

    const fastNoteEl = document.getElementById("calc-fast-checkout-note");
    const btn19 = document.getElementById("btn-calc-gumroad-19");
    const btn65 = document.getElementById("btn-calc-gumroad-65");
    const btn195 = document.getElementById("btn-calc-gumroad-195");
    if (fastNoteEl) {
      if (pages >= 1 && pages <= 15) {
        fastNoteEl.textContent = "Recommended license (EARLY50 auto-applied): Studio Solo v1.6.1 ($9.50)";
        if (btn19) { btn19.classList.add("btn-primary"); btn19.classList.remove("btn-secondary"); }
        if (btn65) { btn65.classList.add("btn-secondary"); btn65.classList.remove("btn-primary"); }
        if (btn195) { btn195.classList.add("btn-secondary"); btn195.classList.remove("btn-primary"); }
      } else if (pages > 15 && pages <= 150) {
        fastNoteEl.textContent = "Recommended license (EARLY50 auto-applied): Studio Agency v1.6.1 ($32.50)";
        if (btn19) { btn19.classList.add("btn-secondary"); btn19.classList.remove("btn-primary"); }
        if (btn65) { btn65.classList.add("btn-primary"); btn65.classList.remove("btn-secondary"); }
        if (btn195) { btn195.classList.add("btn-secondary"); btn195.classList.remove("btn-primary"); }
      } else if (pages > 150) {
        fastNoteEl.textContent = "Recommended license (EARLY50 auto-applied): Studio Commercial v1.6.1 ($97.50)";
        if (btn19) { btn19.classList.add("btn-secondary"); btn19.classList.remove("btn-primary"); }
        if (btn195) { btn195.classList.add("btn-primary"); btn195.classList.remove("btn-secondary"); }
        if (btn65) { btn65.classList.add("btn-secondary"); btn65.classList.remove("btn-primary"); }
      } else {
        fastNoteEl.textContent = "1-click instant download (50% off w/ EARLY50 auto-applied):";
        if (btn19) { btn19.classList.add("btn-secondary"); btn19.classList.remove("btn-primary"); }
        if (btn65) { btn65.classList.add("btn-secondary"); btn65.classList.remove("btn-primary"); }
        if (btn195) { btn195.classList.add("btn-secondary"); btn195.classList.remove("btn-primary"); }
      }
    }

    const mailBtn = document.getElementById("btn-calc-email");
    const emailAddr = (mailBtn && mailBtn.getAttribute("data-email")) || "halocrypto101@gmail.com";
    const rawSubject = "PDF Accessibility Studio v1.6.1 — In-House ROI & License Question (" + pages + " pages)";
    const rawBody = [
      "Hello PDF/UA Partner Desk,",
      "",
      "We modeled our PDF backlog in the In-House Software Savings & Agency Margin Calculator:",
      "- Simple Text ($5.00/pg manual benchmark): " + vals.simple + " pages",
      "- Structured Tables ($8.00/pg manual benchmark): " + vals.tables + " pages",
      "- Scanned OCR ($9.00/pg manual benchmark): " + vals.ocr + " pages",
      "- Fillable AcroForms ($15.00/pg manual benchmark): " + vals.forms + " pages",
      "- Total Backlog Modeled: " + pages + " pages",
      "- Est. Manual Outsourcing / Client Retail Value: " + fmt(retail),
      "- PDF Accessibility Studio v1.6.1 License (EARLY50 50% off): " + fmt(softwareCost) + " (" + tierNote + ")",
      "- Net In-House Software Savings / Agency Margin: " + fmt(profit) + " (" + marginPct + "%)",
      "",
      "Question / Team Seat Count: "
    ].join("\n");

    currentQuoteBrief = "To: " + emailAddr + "\nSubject: " + rawSubject + "\n\n" + rawBody;
    const fbTextarea = document.getElementById("calc-copy-textarea");
    if (fbTextarea) fbTextarea.value = currentQuoteBrief;

    if (mailBtn) {
      mailBtn.setAttribute(
        "href",
        "mailto:" + emailAddr + "?subject=" + encodeURIComponent(rawSubject) + "&body=" + encodeURIComponent(rawBody)
      );
    }
  }

  fields.forEach((k) => {
    const r = document.getElementById("rng-" + k);
    const n = document.getElementById("num-" + k);
    if (r) r.addEventListener("input", () => syncPair(k, "range"));
    if (n) n.addEventListener("input", () => syncPair(k, "number"));
  });

  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      const parts = (btn.getAttribute("data-preset") || "40,30,10,5").split(",");
      fields.forEach((k, idx) => {
        const val = parseInt(parts[idx] || "0", 10) || 0;
        const n = document.getElementById("num-" + k);
        const r = document.getElementById("rng-" + k);
        if (n) n.value = val;
        if (r) r.value = Math.min(parseInt(r.max, 10), val);
      });
      recalc();
    });
  });

  const copyBtn = document.getElementById("btn-calc-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!currentQuoteBrief) recalc();
      copyWithFeedback(
        currentQuoteBrief,
        document.getElementById("calc-copy-status"),
        document.getElementById("calc-copy-fallback"),
        copyBtn,
        "Copied quote brief & email!"
      );
    });
  }

  document.querySelectorAll("[data-copy-brief]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const brief = btn.getAttribute("data-copy-brief") || "";
      const statusId = btn.getAttribute("data-copy-status-id") || "";
      const fallbackId = btn.getAttribute("data-copy-fallback-id") || "";
      const copiedLabel = btn.getAttribute("data-copy-label") || "Copied brief & email!";
      copyWithFeedback(
        brief,
        statusId ? document.getElementById(statusId) : null,
        fallbackId ? document.getElementById(fallbackId) : null,
        btn,
        copiedLabel
      );
    });
  });

  document.querySelectorAll("[data-proof-tabs]").forEach((explorer) => {
    const tabs = Array.from(explorer.querySelectorAll("[role='tab']"));
    const panels = Array.from(explorer.querySelectorAll("[role='tabpanel']"));
    if (!tabs.length) return;

    function activateTab(targetTab, moveFocus) {
      tabs.forEach((t) => {
        const active = t === targetTab;
        t.setAttribute("aria-selected", active ? "true" : "false");
        t.setAttribute("tabindex", active ? "0" : "-1");
      });
      panels.forEach((p) => {
        if (p.id === targetTab.getAttribute("aria-controls")) {
          p.removeAttribute("hidden");
        } else {
          p.setAttribute("hidden", "");
        }
      });
      if (moveFocus) targetTab.focus();
    }

    tabs.forEach((tab, idx) => {
      tab.addEventListener("click", () => activateTab(tab, false));
      tab.addEventListener("keydown", (e) => {
        let nextIdx = -1;
        if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
        else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") nextIdx = 0;
        else if (e.key === "End") nextIdx = tabs.length - 1;
        if (nextIdx >= 0) {
          e.preventDefault();
          activateTab(tabs[nextIdx], true);
        }
      });
    });
  });

  const ciCopyBtn = document.getElementById("btn-copy-ci-yaml");
  if (ciCopyBtn) {
    ciCopyBtn.addEventListener("click", () => {
      const codeEl = document.getElementById("ci-yaml-snippet");
      const statusEl = document.getElementById("ci-yaml-copy-status");
      const yamlText = codeEl ? codeEl.textContent : "";
      if (!yamlText) return;
      const onCopied = () => {
        if (statusEl) {
          statusEl.textContent = "Copied .github/workflows/pdf-accessibility.yml to clipboard.";
          statusEl.classList.add("visible");
        }
        const orig = ciCopyBtn.getAttribute("data-orig-label") || ciCopyBtn.textContent;
        ciCopyBtn.setAttribute("data-orig-label", orig);
        ciCopyBtn.textContent = "Copied workflow YAML!";
        setTimeout(() => { ciCopyBtn.textContent = orig; }, 2200);
      };
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(yamlText).then(onCopied).catch(onCopied);
      } else {
        onCopied();
      }
    });
  }

  const pipCopyBtn = document.getElementById("btn-copy-pip-wheel");
  if (pipCopyBtn) {
    pipCopyBtn.addEventListener("click", () => {
      const pipEl = document.getElementById("pip-wheel-snippet");
      const statusEl = document.getElementById("ci-yaml-copy-status");
      const cmdText = pipEl ? pipEl.textContent : "";
      if (!cmdText) return;
      const onPipCopied = () => {
        if (statusEl) {
          statusEl.textContent = "Copied pip install command for pdfa11y v0.5.0 wheel to clipboard.";
          statusEl.classList.add("visible");
        }
        const orig = pipCopyBtn.getAttribute("data-orig-label") || pipCopyBtn.textContent;
        pipCopyBtn.setAttribute("data-orig-label", orig);
        pipCopyBtn.textContent = "Copied pip command!";
        setTimeout(() => { pipCopyBtn.textContent = orig; }, 2200);
      };
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(cmdText).then(onPipCopied).catch(onPipCopied);
      } else {
        onPipCopied();
      }
    });
  }

  const npmCopyBtn = document.getElementById("btn-copy-npm-tgz");
  if (npmCopyBtn) {
    npmCopyBtn.addEventListener("click", () => {
      const npmEl = document.getElementById("npm-tgz-snippet");
      const statusEl = document.getElementById("ci-yaml-copy-status");
      const cmdText = npmEl ? npmEl.textContent : "";
      if (!cmdText) return;
      const onNpmCopied = () => {
        if (statusEl) {
          statusEl.textContent = "Copied npm install command for pdfua-ada-scanner v1.3.0 CLI to clipboard.";
          statusEl.classList.add("visible");
        }
        const orig = npmCopyBtn.getAttribute("data-orig-label") || npmCopyBtn.textContent;
        npmCopyBtn.setAttribute("data-orig-label", orig);
        npmCopyBtn.textContent = "Copied npm command!";
        setTimeout(() => { npmCopyBtn.textContent = orig; }, 2200);
      };
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(cmdText).then(onNpmCopied).catch(onNpmCopied);
      } else {
        onNpmCopied();
      }
    });
  }

  if (document.getElementById("num-simple")) {
    recalc();
  }
})();
