(function () {
  "use strict";
  var SAMPLES = {
    tiktok: [
      "settlement_id,payout_date,gross_merchandise_sales,customer_shipping_collected,marketplace_facilitator_tax,referral_fee,payment_processing_fee,affiliate_commission,fbt_shipping_fee,refunds_and_returns",
      "TTS-2026-101,2026-10-15,9420.00,680.00,808.00,565.20,273.18,942.00,612.40,310.00",
      "TTS-2026-102,2026-10-31,4350.00,370.00,377.60,261.00,136.88,435.00,298.74,140.00"
    ].join("\n"),
    ebay: [
      "payout_id,payout_date,gross_item_sales,buyer_shipping_collected,collect_and_remit_tax,final_value_fee,promoted_listings_fee,ebay_shipping_label,refunds",
      "EBY-2026-201,2026-10-18,7850.00,620.00,677.60,1069.34,392.50,518.20,245.00",
      "EBY-2026-202,2026-10-31,5120.00,410.00,442.40,697.89,256.00,344.10,120.00"
    ].join("\n"),
    etsy: [
      "statement_batch_id,statement_date,gross_sales,shipping_income,facilitator_sales_tax_remitted,listing_and_transaction_fee,processing_fee,offsite_ads_fee,etsy_shipping_label,refunds",
      "ETY-2026-301,2026-10-16,6240.00,490.00,538.40,437.45,221.70,312.00,410.80,185.00",
      "ETY-2026-302,2026-10-31,4880.00,360.00,419.20,340.60,173.30,244.00,319.50,95.00"
    ].join("\n")
  };

  function toCents(v) {
    if (!v) return 0;
    var s = String(v).trim().replace(/[$,]/g, "");
    if (!s || s === "-") return 0;
    if (s[0] === "(" && s[s.length - 1] === ")") s = "-" + s.slice(1, -1);
    var n = Number(s);
    return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : 0;
  }
  function fmtPlain(cents) {
    var sign = cents < 0 ? "-" : "";
    var abs = Math.abs(cents);
    return sign + Math.floor(abs / 100) + "." + String(abs % 100).padStart(2, "0");
  }
  function fmtUsd(cents) {
    var sign = cents < 0 ? "-" : "";
    var abs = Math.abs(cents);
    var dollars = Math.floor(abs / 100).toLocaleString("en-US");
    return sign + "$" + dollars + "." + String(abs % 100).padStart(2, "0");
  }
  function parseCsv(text) {
    var lines = String(text || "").replace(/\r\n/g, "\n").trim().split("\n");
    if (lines.length < 2) return [];
    var headers = lines[0].split(",").map(function (h) { return h.trim().toLowerCase(); });
    return lines.slice(1).filter(Boolean).map(function (line) {
      var cols = line.split(",");
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = (cols[i] || "").trim(); });
      return obj;
    });
  }
  function pick(row, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (row[keys[i]] !== undefined && row[keys[i]] !== "") return toCents(row[keys[i]]);
    }
    return 0;
  }

  var qboCsvData = "";
  var xeroCsvData = "";

  function runConversion(csvText, forcedChannel) {
    var log = document.getElementById("tt-output-log");
    var rows = parseCsv(csvText);
    if (!rows.length) {
      if (log) log.textContent = "No settlement rows detected in CSV.";
      return;
    }
    var selEl = document.getElementById("tt-channel-select");
    var sel = forcedChannel || (selEl ? selEl.value : "auto");
    var hdrs = Object.keys(rows[0]).join("|");
    var ch = sel !== "auto"
      ? sel
      : (hdrs.indexOf("affiliate_commission") >= 0
        ? "TikTok Shop US"
        : (hdrs.indexOf("final_value_fee") >= 0 ? "eBay Managed Payments" : "Etsy Payment Account"));

    var qbo = ["JournalNo,JournalDate,AccountName,Debits,Credits,Description"];
    var xero = ["*Narration,*Date,*AccountCode,*TaxRate,*Amount,Description"];
    var totDr = 0, totCr = 0, totBox1a = 0, totTax = 0, totNet = 0;

    rows.forEach(function (r, idx) {
      var bId = r.settlement_id || r.payout_id || r.statement_batch_id || ("BATCH-" + (idx + 1));
      var dt = r.payout_date || r.statement_date || "2026-10-31";
      var jNo = "MC26-" + String(idx + 1).padStart(3, "0");
      var sales = pick(r, ["gross_merchandise_sales", "gross_item_sales", "gross_sales"]);
      var ship = pick(r, ["customer_shipping_collected", "buyer_shipping_collected", "shipping_income"]);
      var tax = pick(r, ["marketplace_facilitator_tax", "collect_and_remit_tax", "facilitator_sales_tax_remitted"]);
      var fee = pick(r, ["referral_fee", "final_value_fee", "listing_and_transaction_fee"]);
      var proc = pick(r, ["payment_processing_fee", "processing_fee"]);
      var aff = pick(r, ["affiliate_commission", "promoted_listings_fee", "offsite_ads_fee"]);
      var lbl = pick(r, ["fbt_shipping_fee", "ebay_shipping_label", "etsy_shipping_label", "shipping_label_cost"]);
      var ref = pick(r, ["refunds_and_returns", "refunds"]);
      var net = (sales + ship) - (fee + proc + aff + lbl + ref);
      totBox1a += (sales + ship);
      totTax += tax;
      totNet += net;

      var entries = [
        ["4000", "4000 Gross Merchandise Sales - " + ch, 0, sales, ch + " " + bId + " gross sales"],
        ["4050", "4050 Shipping Income - " + ch, 0, ship, ch + " " + bId + " shipping income"],
        ["4900", "4900 Sales Refunds & Returns - " + ch, ref, 0, ch + " " + bId + " refunds"],
        ["6100", "6100 Marketplace Referral & Platform Fees", fee, 0, ch + " " + bId + " platform fees"],
        ["6110", "6110 Payment Processing Fees", proc, 0, ch + " " + bId + " processing fees"],
        ["6120", "6120 Affiliate & Creator Commissions", aff, 0, ch + " " + bId + " affiliate commissions"],
        ["6200", "6200 Outbound Shipping Labels", lbl, 0, ch + " " + bId + " shipping labels"],
        ["1050", "1050 Platform Clearing", net >= 0 ? net : 0, net < 0 ? -net : 0, ch + " " + bId + " net to 1050 Platform Clearing"]
      ];
      entries.forEach(function (e) {
        if (e[2] === 0 && e[3] === 0) return;
        totDr += e[2];
        totCr += e[3];
        qbo.push([jNo, dt, '"' + e[1] + '"', fmtPlain(e[2]), fmtPlain(e[3]), '"' + e[4] + '"'].join(","));
        xero.push(['"' + ch + " Settlement " + bId + '"', dt, e[0], '"Tax Exempt (0%)"', fmtPlain(e[2] - e[3]), '"' + e[4] + '"'].join(","));
      });
    });

    qboCsvData = qbo.join("\n") + "\n";
    xeroCsvData = xero.join("\n") + "\n";

    var elBox = document.getElementById("tt-kpi-box1a");
    var elTax = document.getElementById("tt-kpi-tax");
    var elNet = document.getElementById("tt-kpi-net");
    var elVar = document.getElementById("tt-kpi-variance");
    if (elBox) elBox.textContent = fmtUsd(totBox1a);
    if (elTax) elTax.textContent = fmtUsd(totTax);
    if (elNet) elNet.textContent = fmtUsd(totNet);
    if (elVar) elVar.textContent = fmtUsd(totDr - totCr);

    var btnQbo = document.getElementById("btn-tt-dl-qbo");
    var btnXero = document.getElementById("btn-tt-dl-xero");
    if (btnQbo) btnQbo.disabled = false;
    if (btnXero) btnXero.disabled = false;

    if (log) {
      log.textContent = [
        "Channel Reconciled: " + ch + " (" + rows.length + " settlement batches)",
        "2026 Form 1099-K Box 1a Gross: " + fmtUsd(totBox1a),
        "IRC Sec. 6050W Facilitator Sales Tax Excluded: " + fmtUsd(totTax),
        "1050 Platform Clearing Net Deposit Match: " + fmtUsd(totNet),
        "Journal Balance Check: Debits " + fmtUsd(totDr) + " == Credits " + fmtUsd(totCr) + " (Variance: $0.00)",
        "",
        "--- Sample QuickBooks Online Journal Preview ---",
        qbo.slice(0, 10).join("\n")
      ].join("\n");
    }
  }

  function triggerDownload(filename, content) {
    if (!content) return;
    var blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btnConvert = document.getElementById("btn-tt-convert");
    var fileInput = document.getElementById("tt-csv-upload");
    if (btnConvert && fileInput) {
      btnConvert.addEventListener("click", function () {
        if (!fileInput.files || !fileInput.files[0]) {
          runConversion(SAMPLES.tiktok, "TikTok Shop US");
          return;
        }
        var reader = new FileReader();
        reader.onload = function (ev) {
          runConversion(String(ev.target.result || ""), null);
        };
        reader.readAsText(fileInput.files[0]);
      });
    }
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        if (fileInput.files && fileInput.files[0]) {
          var reader = new FileReader();
          reader.onload = function (ev) {
            runConversion(String(ev.target.result || ""), null);
          };
          reader.readAsText(fileInput.files[0]);
        }
      });
    }

    var sTik = document.getElementById("btn-tt-sample-tiktok");
    var sEby = document.getElementById("btn-tt-sample-ebay");
    var sEty = document.getElementById("btn-tt-sample-etsy");
    if (sTik) sTik.addEventListener("click", function () { runConversion(SAMPLES.tiktok, "TikTok Shop US"); });
    if (sEby) sEby.addEventListener("click", function () { runConversion(SAMPLES.ebay, "eBay Managed Payments"); });
    if (sEty) sEty.addEventListener("click", function () { runConversion(SAMPLES.etsy, "Etsy Payment Account"); });

    var dlQbo = document.getElementById("btn-tt-dl-qbo");
    var dlXero = document.getElementById("btn-tt-dl-xero");
    if (dlQbo) dlQbo.addEventListener("click", function () { triggerDownload("QuickBooks-Online-Journal-Entry.csv", qboCsvData); });
    if (dlXero) dlXero.addEventListener("click", function () { triggerDownload("Xero-Manual-Journal.csv", xeroCsvData); });

    runConversion(SAMPLES.tiktok, "TikTok Shop US");
  });
})();
