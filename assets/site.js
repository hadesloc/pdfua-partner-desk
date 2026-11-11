(function () {
  const rates = {
    simple: { wholesale: 2.0, retail: 5.0 },
    tables: { wholesale: 3.0, retail: 8.0 },
    ocr: { wholesale: 3.5, retail: 9.0 },
    forms: { wholesale: 6.5, retail: 15.0 }
  };

  const fields = ["simple", "tables", "ocr", "forms"];
  const fmt = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    recalc();
  }

  function recalc() {
    let pages = 0;
    let wholesale = 0;
    let retail = 0;
    const vals = {};
    fields.forEach((k) => {
      const numEl = document.getElementById("num-" + k);
      const count = numEl ? Math.max(0, parseInt(numEl.value || "0", 10) || 0) : 0;
      vals[k] = count;
      pages += count;
      wholesale += count * rates[k].wholesale;
      retail += count * rates[k].retail;
    });
    if (pages > 0 && wholesale < 35) {
      wholesale = 35.0;
    }
    const profit = Math.max(0, retail - wholesale);
    const marginPct = retail > 0 ? ((profit / retail) * 100).toFixed(1) : "0.0";

    const setTxt = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setTxt("out-pages", pages.toLocaleString("en-US") + " pages");
    setTxt("out-retail", fmt(retail));
    setTxt("out-wholesale", fmt(wholesale));
    setTxt("out-profit", fmt(profit));
    setTxt("out-margin", marginPct + "% net agency margin");

    const mailBtn = document.getElementById("btn-calc-email");
    if (mailBtn) {
      const email = mailBtn.getAttribute("data-email") || "halocrypto101@gmail.com";
      const subject = encodeURIComponent(
        "White-Label PDF/UA Quote & Free Sample (" + pages + " pages — " + fmt(wholesale) + " wholesale)"
      );
      const body = encodeURIComponent(
        "Hi Loc,\n\nWe would like to lock in a white-label partner quote and test a free 24h sample PDF:\n" +
        "- Simple Text Pages: " + vals.simple + "\n" +
        "- Structured Table Pages: " + vals.tables + "\n" +
        "- Scanned OCR Pages: " + vals.ocr + "\n" +
        "- Fillable AcroForm Pages: " + vals.forms + "\n" +
        "- Estimated Wholesale Cost: " + fmt(wholesale) + "\n\n" +
        "Sample PDF URL or Client Domain: "
      );
      mailBtn.setAttribute("href", "mailto:" + email + "?subject=" + subject + "&body=" + body);
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

  recalc();
})();
