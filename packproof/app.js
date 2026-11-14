(function () {
  "use strict";

  const Engine = window.PackProofEngine;
  if (!Engine) return;

  const state = {
    checkoutConfig: {
      ppwrStarter49Url: "https://pdfuapartnerdesk.gumroad.com/l/ppwr-annex8-starter-pack?wanted=true",
      ppwrGrowth69Url: "",
      ppwrPro129Url: "",
      fallbackFormUrl: "https://docs.google.com/forms/d/e/1FAIpQLSfC50VFJdc55ug-sNpJON59JL9By6yIuRe8qysotQLX1cNtFA/viewform",
      contactEmail: "halocrypto101@gmail.com"
    }
  };

  function byId(id) {
    return document.getElementById(id);
  }

  async function loadCheckoutConfig() {
    try {
      const resp = await fetch("./checkout-config.json", { cache: "no-store" });
      if (resp.ok) {
        const cfg = await resp.json();
        Object.assign(state.checkoutConfig, cfg);
      }
    } catch (_err) {
      // Offline / file:// fallback
    }
    syncOrderLinks();
  }

  function buildOrderMailto(planName, priceLabel) {
    const email = state.checkoutConfig.contactEmail || "halocrypto101@gmail.com";
    const subject = "PackProof EU — " + planName + " (" + priceLabel + ")";
    const body = [
      "Hello PackProof EU Desk,",
      "",
      "I would like to order / activate: " + planName + " (" + priceLabel + ").",
      "Company / Brand Name: ",
      "Role: [EU Private-Label Brand / EU Importer / Packaging Exporter]",
      "Approximate Packaging SKUs: ",
      "",
      "Please share the checkout / onboarding link."
    ].join("\n");
    return "mailto:" + email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  function syncOrderLinks() {
    const starterBtn = byId("btn-buy-starter49");
    const growthBtn = byId("btn-buy-growth69");
    const proBtn = byId("btn-buy-pro129");
    const formLink = byId("intake-google-form");

    if (starterBtn) {
      starterBtn.href = state.checkoutConfig.ppwrStarter49Url || buildOrderMailto("PPWR Annex VIII + VII Starter Pack", "EUR 49 one-time");
    }
    if (growthBtn) {
      growthBtn.href = state.checkoutConfig.ppwrGrowth69Url || buildOrderMailto("PackProof Growth Workspace (150 Units)", "EUR 69/mo");
    }
    if (proBtn) {
      proBtn.href = state.checkoutConfig.ppwrPro129Url || buildOrderMailto("PackProof Importer Pro (400 Units)", "EUR 129/mo");
    }
    if (formLink && state.checkoutConfig.fallbackFormUrl) {
      formLink.href = state.checkoutConfig.fallbackFormUrl;
    }
  }

  function runPrecheck() {
    const foodContact = byId("chk-food-contact").value === "yes";
    const result = Engine.evaluateSupplierEvidence({
      skuCode: byId("chk-sku").value,
      componentName: byId("chk-component").value,
      docType: byId("chk-doc-type").value,
      issueDate: byId("chk-issue-date").value,
      foodContact,
      heavyMetalsUnit: byId("chk-hm-unit").value,
      pb: byId("chk-pb").value,
      cd: byId("chk-cd").value,
      hg: byId("chk-hg").value,
      cr6: byId("chk-cr6").value,
      pfasSingle: byId("chk-pfas-single").value,
      pfasSingleUnit: "ppb",
      pfasSum: byId("chk-pfas-sum").value,
      pfasSumUnit: "ppb",
      totalFluorine: byId("chk-total-f").value,
      totalFluorineUnit: "ppm",
      supplierLang: byId("chk-supplier-lang").value
    });

    const panel = byId("precheck-result");
    panel.classList.remove("hidden");

    const badge = byId("precheck-badge");
    badge.textContent = result.verdict;
    badge.className = "pill " + (
      result.verdict === "PASS_PRECHECK"
        ? "pill-ok"
        : result.verdict === "FAIL_THRESHOLD" || result.verdict === "REJECT_INVALID_DOC_CLASS"
        ? "pill-danger"
        : "pill-warn"
    );

    const summaryList = byId("precheck-reasons");
    summaryList.textContent = "";
    const items = [];
    if (result.heavyMetalsSumMgKg !== null) {
      items.push("Heavy Metals Sum (Pb+Cd+Hg+Cr VI): " + result.heavyMetalsSumMgKg + " mg/kg (Article 5 limit: <= 100 mg/kg)");
    }
    if (result.foodContact) {
      if (result.pfasSinglePpb !== null) items.push("Single Targeted PFAS: " + result.pfasSinglePpb + " ppb (Article 5(5) limit: < 25 ppb)");
      if (result.pfasSumPpb !== null) items.push("Sum Targeted PFAS: " + result.pfasSumPpb + " ppb (Article 5(5) limit: < 250 ppb)");
      if (result.totalFluorineMgKg !== null) items.push("Total Fluorine / Total PFAS: " + result.totalFluorineMgKg + " ppm [mg/kg] (Article 5(5) limit: < 50 ppm)");
    }
    result.reasons.forEach((r) => items.push(r));
    result.warnings.forEach((w) => items.push("Note: " + w));
    items.push("2028-2030 Scope Guard: " + result.future2028FieldsNote);

    items.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      summaryList.appendChild(li);
    });

    byId("supplier-relay-box").textContent = result.supplierPrompt;
  }

  function loadDemoIsoTrap() {
    byId("chk-sku").value = "COFFEE-POUCH-250G";
    byId("chk-component").value = "Laminated Kraft + PE Inner Food-Contact Film";
    byId("chk-doc-type").value = "iso_9001";
    byId("chk-food-contact").value = "yes";
    byId("chk-pb").value = "";
    byId("chk-cd").value = "";
    byId("chk-hg").value = "";
    byId("chk-cr6").value = "";
    byId("chk-supplier-lang").value = "zh";
    runPrecheck();
  }

  function loadDemoValidSgs() {
    byId("chk-sku").value = "TEA-CARTON-100G";
    byId("chk-component").value = "Printed Folding Boxboard + Water-Based Varnish";
    byId("chk-doc-type").value = "lab_report";
    byId("chk-issue-date").value = "2026-06-15";
    byId("chk-food-contact").value = "yes";
    byId("chk-hm-unit").value = "mg/kg";
    byId("chk-pb").value = "8.5";
    byId("chk-cd").value = "1.2";
    byId("chk-hg").value = "0.5";
    byId("chk-cr6").value = "2.0";
    byId("chk-pfas-single").value = "4.0";
    byId("chk-pfas-sum").value = "18.5";
    byId("chk-total-f").value = "12.0";
    byId("chk-supplier-lang").value = "vi";
    runPrecheck();
  }

  function handleIntakeSubmit(e) {
    e.preventDefault();
    const company = byId("in-company").value.trim() || "Prospective Importer / Exporter";
    const email = byId("in-email").value.trim();
    const role = byId("in-role").value;
    const sku = byId("in-sku").value.trim() || "1 Sample Packaging SKU";
    const lang = byId("in-report-lang").value;
    const notes = byId("in-notes").value.trim();

    const refCode = "PPWR-" + Date.now().toString(36).toUpperCase().slice(-6);
    const deskEmail = state.checkoutConfig.contactEmail || "halocrypto101@gmail.com";
    const subject = "Free PPWR Lab-Report Sanity Check [" + refCode + "] — " + company;
    const body = [
      "Hello PackProof EU Desk,",
      "",
      "Please run the complimentary Regulation (EU) 2025/40 Article 5 & Annex VII/VIII sanity check on our attached supplier lab report PDF.",
      "",
      "Reference ID: " + refCode,
      "Company: " + company,
      "Reply Email: " + email,
      "Operator Role: " + role,
      "Packaging Unit / Material: " + sku,
      "Supplier Report Language: " + lang,
      notes ? "Additional Notes: " + notes : "",
      "",
      "[Please attach 1 supplier PDF report (SGS / Intertek / TUV / Eurofins / CNAS) before clicking Send]"
    ]
      .filter(Boolean)
      .join("\n");

    const mailtoHref = "mailto:" + deskEmail + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    const confirmPanel = byId("intake-confirmation");
    confirmPanel.classList.remove("hidden");
    byId("intake-ref-code").textContent = refCode;
    const sendMailBtn = byId("intake-mailto-trigger");
    sendMailBtn.href = mailtoHref;
  }

  function initEvents() {
    byId("btn-run-precheck").addEventListener("click", runPrecheck);
    byId("btn-demo-iso-trap").addEventListener("click", loadDemoIsoTrap);
    byId("btn-demo-valid-sgs").addEventListener("click", loadDemoValidSgs);
    byId("chk-food-contact").addEventListener("change", function () {
      const pfasRow = byId("pfas-fields-wrap");
      if (byId("chk-food-contact").value === "yes") {
        pfasRow.classList.remove("hidden");
      } else {
        pfasRow.classList.add("hidden");
      }
    });
    byId("btn-copy-relay").addEventListener("click", function () {
      const txt = byId("supplier-relay-box").textContent || "";
      if (navigator.clipboard && txt) {
        navigator.clipboard.writeText(txt);
        byId("btn-copy-relay").textContent = "Copied Supplier Message!";
        setTimeout(() => {
          byId("btn-copy-relay").textContent = "Copy Multilingual Supplier Request";
        }, 1800);
      }
    });
    byId("lab-intake-form").addEventListener("submit", handleIntakeSubmit);
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadCheckoutConfig();
    initEvents();
    loadDemoValidSgs();
  });
})();


/* CRO_PACKPROOF_UPGRADE */
(function () {
  "use strict";
  function copyWithFallback(text, onDone) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { onDone(true); }).catch(function () { fallbackCopy(text, onDone); });
    } else {
      fallbackCopy(text, onDone);
    }
  }
  function fallbackCopy(text, onDone) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      onDone(Boolean(ok));
    } catch (_e) {
      onDone(false);
    }
  }
  function decodeMailtoHref(href, fallbackEmail) {
    if (!href || href.indexOf("mailto:") !== 0) return "To: " + fallbackEmail;
    var qIdx = href.indexOf("?");
    var toAddr = decodeURIComponent(qIdx >= 0 ? href.slice(7, qIdx) : href.slice(7)) || fallbackEmail;
    var params = new URLSearchParams(qIdx >= 0 ? href.slice(qIdx + 1) : "");
    var subj = params.get("subject") || "PackProof EU Inquiry";
    var body = params.get("body") || "";
    return "To: " + toAddr + "\nSubject: " + subj + "\n\n" + body;
  }
  document.addEventListener("DOMContentLoaded", function () {
    var email = "halocrypto101@gmail.com";
    var copyIntakeBtn = document.getElementById("btn-copy-intake-brief");
    var intakeTrigger = document.getElementById("intake-mailto-trigger");
    var intakeStatus = document.getElementById("intake-copy-status");
    if (copyIntakeBtn && intakeTrigger) {
      copyIntakeBtn.addEventListener("click", function () {
        var payload = decodeMailtoHref(intakeTrigger.getAttribute("href"), email);
        copyWithFallback(payload, function (ok) {
          if (intakeStatus) {
            intakeStatus.textContent = ok
              ? "Copied ticket brief and email (" + email + ") to clipboard. Paste into any email client and attach your PDF."
              : "Send your PDF directly to " + email + " with the reference code shown above.";
          }
        });
      });
    }
    var copyBatchBtn = document.getElementById("btn-copy-packproof-batch");
    var batchMailto = document.getElementById("btn-packproof-batch-mailto");
    var batchStatus = document.getElementById("packproof-batch-copy-status");
    if (copyBatchBtn) {
      copyBatchBtn.addEventListener("click", function () {
        var payload = batchMailto
          ? decodeMailtoHref(batchMailto.getAttribute("href"), email)
          : ("To: " + email + "\nSubject: PackProof EU Custom Multi-SKU Quote");
        copyWithFallback(payload, function (ok) {
          if (batchStatus) {
            batchStatus.textContent = ok
              ? "Copied batch inquiry brief and email (" + email + ") to clipboard."
              : "Email us directly at " + email + " for custom multi-SKU pricing.";
          }
        });
      });
    }
  });
})();


/* CRO_PACKPROOF_V2_AUDIT */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    var email = "halocrypto101@gmail.com";
    var auditCopyBtn = document.getElementById("btn-copy-packproof-audit");
    var auditMailto = document.getElementById("btn-packproof-audit-mailto");
    var auditStatus = document.getElementById("packproof-audit-copy-status");
    if (!auditCopyBtn) return;
    auditCopyBtn.addEventListener("click", function () {
      var href = auditMailto ? (auditMailto.getAttribute("href") || "") : "";
      var qIdx = href.indexOf("?");
      var params = new URLSearchParams(qIdx >= 0 ? href.slice(qIdx + 1) : "");
      var payload = "To: " + email + "\nSubject: " + (params.get("subject") || "Free 1-PDF Lab Report Article 5 Sanity Audit ($0)") + "\n\n" + (params.get("body") || "");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).then(function () {
          if (auditStatus) auditStatus.textContent = "Copied $0 lab audit brief & email (" + email + ") to clipboard.";
        }).catch(function () {
          if (auditStatus) auditStatus.textContent = "Email 1 lab PDF directly to " + email + " for your free 24h audit.";
        });
      } else if (auditStatus) {
        auditStatus.textContent = "Email 1 lab PDF directly to " + email + " for your free 24h audit.";
      }
    });
  });
})();
