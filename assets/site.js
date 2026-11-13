(function () {
  const rates = {
    simple: { wholesale: 2.0, retail: 5.0 },
    tables: { wholesale: 3.0, retail: 8.0 },
    ocr: { wholesale: 3.5, retail: 9.0 },
    forms: { wholesale: 6.5, retail: 15.0 }
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
    let rawWholesale = 0;
    let rawRetail = 0;
    const vals = {};
    fields.forEach((k) => {
      const numEl = document.getElementById("num-" + k);
      const count = numEl ? Math.max(0, parseInt(numEl.value || "0", 10) || 0) : 0;
      vals[k] = count;
      pages += count;
      rawWholesale += count * rates[k].wholesale;
      rawRetail += count * rates[k].retail;
    });

    const partnerMinApplied = pages > 0 && rawWholesale < 35.0;
    const retailMinApplied = pages > 0 && rawRetail < 60.0;
    const wholesale = pages > 0 ? Math.max(35.0, rawWholesale) : 0.0;
    const retail = pages > 0 ? Math.max(60.0, rawRetail) : 0.0;
    const profit = Math.max(0, retail - wholesale);
    const marginPct = retail > 0 ? ((profit / retail) * 100).toFixed(1) : "0.0";

    const setTxt = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setTxt("out-pages", pages.toLocaleString("en-US") + (pages === 1 ? " page" : " pages"));
    setTxt("out-retail", fmt(retail));
    setTxt("out-wholesale", fmt(wholesale));
    setTxt("out-profit", fmt(profit));
    setTxt("out-margin", marginPct + "% net agency profit margin");

    const retailNoteEl = document.getElementById("out-retail-note");
    if (retailNoteEl) {
      retailNoteEl.textContent = retailMinApplied
        ? "$60.00 retail minimum applied ($5–$15/pg)"
        : "US market $5–$15/pg ($60 retail min)";
      retailNoteEl.className = retailMinApplied ? "min-badge" : "summary-subnote";
    }
    const wholesaleNoteEl = document.getElementById("out-wholesale-note");
    if (wholesaleNoteEl) {
      wholesaleNoteEl.textContent = partnerMinApplied
        ? "$35.00 partner minimum applied ($2–$6.50/pg)"
        : "White-label $2–$6.50/pg ($35 partner min)";
      wholesaleNoteEl.className = partnerMinApplied ? "min-badge" : "summary-subnote";
    }

    const fastNoteEl = document.getElementById("calc-fast-checkout-note");
    const btn65 = document.getElementById("btn-calc-gumroad-65");
    const btn195 = document.getElementById("btn-calc-gumroad-195");
    if (fastNoteEl) {
      if (pages > 0 && pages <= 12 && vals.tables === 0 && vals.ocr === 0 && vals.forms === 0) {
        fastNoteEl.textContent = "Instant card checkout match: $65 Starter (up to 12 text pages)";
        if (btn65) { btn65.classList.add("btn-primary"); btn65.classList.remove("btn-secondary"); }
        if (btn195) { btn195.classList.add("btn-secondary"); btn195.classList.remove("btn-primary"); }
      } else if (pages > 0 && pages <= 30 && vals.ocr === 0 && vals.forms === 0) {
        fastNoteEl.textContent = "Instant card checkout match: $195 Standard (up to 30 report/table pages)";
        if (btn195) { btn195.classList.add("btn-primary"); btn195.classList.remove("btn-secondary"); }
        if (btn65) { btn65.classList.add("btn-secondary"); btn65.classList.remove("btn-primary"); }
      } else {
        fastNoteEl.textContent = "1-click card checkout for single pilot packages:";
        if (btn65) { btn65.classList.add("btn-secondary"); btn65.classList.remove("btn-primary"); }
        if (btn195) { btn195.classList.add("btn-secondary"); btn195.classList.remove("btn-primary"); }
      }
    }

    const mailBtn = document.getElementById("btn-calc-email");
    const emailAddr = (mailBtn && mailBtn.getAttribute("data-email")) || "halocrypto101@gmail.com";
    const rawSubject = "White-Label PDF/UA Quote & Free 24h Sample (" + pages + " pages — " + fmt(wholesale) + " wholesale)";
    const rawBody = [
      "Hi Loc,",
      "",
      "Please lock in this white-label partner quote and run our complimentary 24-hour proof sample:",
      "- Simple Text ($2.00/pg): " + vals.simple + " pages",
      "- Structured Tables ($3.00/pg): " + vals.tables + " pages",
      "- Scanned OCR ($3.50/pg): " + vals.ocr + " pages",
      "- Fillable AcroForms ($6.50/pg): " + vals.forms + " pages",
      "- Total Volume: " + pages + " pages",
      "- Partner Wholesale Cost ($35 min): " + fmt(wholesale) + (partnerMinApplied ? " ($35 partner minimum applied)" : ""),
      "- US Market Retail Billing ($60 min): " + fmt(retail) + " (Net Agency Profit: " + fmt(profit) + " / " + marginPct + "%)",
      "",
      "Sample PDF URL or Client Domain: "
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
      copyWithFeedback(
        brief,
        statusId ? document.getElementById(statusId) : null,
        fallbackId ? document.getElementById(fallbackId) : null,
        btn,
        "Copied brief & email!"
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

  if (document.getElementById("num-simple")) {
    recalc();
  }
})();
