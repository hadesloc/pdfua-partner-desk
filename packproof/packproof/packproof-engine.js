/**
 * PackProof EU — Client-Side Regulation (EU) 2025/40 (PPWR) Article 5 Pre-Check
 * & Multilingual Supplier Re-Request Drafter.
 *
 * Compliance engineering & document-formatting assistance tool — not legal, regulatory, or customs advice.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PackProofEngine = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Primary-source thresholds from EUR-Lex Regulation (EU) 2025/40 Article 5 (general application: 12 August 2026)
  const PPWR_ART5_THRESHOLDS = {
    heavyMetalsSumMgKgMax: 100.0, // <= 100 mg/kg sum of Pb + Cd + Hg + Cr(VI)
    pfasSinglePpbLimit: 25.0, // < 25 ppb any single targeted non-polymeric PFAS (food-contact)
    pfasSumPpbLimit: 250.0, // < 250 ppb sum of targeted non-polymeric PFAS (food-contact)
    pfasTotalPpmLimit: 50.0, // < 50 ppm (mg/kg) total PFAS incl. polymeric; >50 mg/kg total F requires origin proof
    recommendedMaxReportAgeMonths: 24
  };

  function toMgKg(value, unit) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num) || num < 0) return null;
    const u = String(unit || "mg/kg").toLowerCase().trim();
    if (u === "mg/kg" || u === "ppm") return num;
    if (u === "ug/kg" || u === "µg/kg" || u === "ppb") return num / 1000.0;
    if (u === "%") return num * 10000.0;
    return num;
  }

  function toPpb(value, unit) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num) || num < 0) return null;
    const u = String(unit || "ppb").toLowerCase().trim();
    if (u === "ppb" || u === "ug/kg" || u === "µg/kg") return num;
    if (u === "ppm" || u === "mg/kg") return num * 1000.0;
    if (u === "%") return num * 10000000.0;
    return num;
  }

  function evaluateSupplierEvidence(input, options) {
    const opts = options || {};
    const nowIso = opts.asOfDate || new Date().toISOString().slice(0, 10);
    const nowMs = Date.parse(nowIso + "T00:00:00Z");

    const docType = String(input.docType || "lab_report").trim();
    const isFoodContact = Boolean(input.foodContact);
    const reasons = [];
    const warnings = [];
    let verdict = "PASS_PRECHECK";

    if (docType === "iso_9001" || docType === "business_license" || docType === "rohs_electronics_only") {
      verdict = "REJECT_INVALID_DOC_CLASS";
      const docLabels = {
        iso_9001: "ISO 9001 / Quality Management System certificate",
        business_license: "Factory business license / company registration",
        rohs_electronics_only: "Electronics-only RoHS declaration without packaging component test results"
      };
      reasons.push(
        "Submitted document is a " +
          (docLabels[docType] || docType) +
          ", which does NOT provide packaging component chemical concentration evidence required for Regulation (EU) 2025/40 Article 5 & Annex VII technical files."
      );
    }

    // Report age sanity check
    if (input.issueDate) {
      const issuedMs = Date.parse(String(input.issueDate).slice(0, 10) + "T00:00:00Z");
      if (Number.isFinite(issuedMs) && Number.isFinite(nowMs)) {
        const ageMonths = (nowMs - issuedMs) / (1000 * 60 * 60 * 24 * 30.4375);
        if (ageMonths > PPWR_ART5_THRESHOLDS.recommendedMaxReportAgeMonths) {
          warnings.push(
            "Lab report date (" +
              input.issueDate +
              ") is ~" +
              Math.round(ageMonths) +
              " months old (>24 months). Verify that raw material batch, ink, and adhesive formulations have not changed."
          );
        }
      }
    } else {
      warnings.push("No lab report issue date entered — verify sample test date before compiling Annex VII index.");
    }

    // Heavy metals sum: Pb + Cd + Hg + Cr(VI) <= 100 mg/kg
    const hmUnit = input.heavyMetalsUnit || "mg/kg";
    const metals = ["pb", "cd", "hg", "cr6"].map((k) => toMgKg(input[k], hmUnit));
    const providedMetals = metals.filter((v) => v !== null);
    let heavyMetalsSumMgKg = null;

    if (providedMetals.length > 0) {
      heavyMetalsSumMgKg = Number(providedMetals.reduce((a, b) => a + b, 0).toFixed(4));
      if (providedMetals.length < 4) {
        warnings.push("Only " + providedMetals.length + "/4 heavy metals (Pb, Cd, Hg, Cr VI) entered — Annex VII evidence should cover all 4 analytes.");
      }
      if (heavyMetalsSumMgKg > PPWR_ART5_THRESHOLDS.heavyMetalsSumMgKgMax) {
        verdict = "FAIL_THRESHOLD";
        reasons.push(
          "Heavy metals sum (Pb + Cd + Hg + Cr VI = " +
            heavyMetalsSumMgKg +
            " mg/kg) exceeds Article 5 limit of 100 mg/kg."
        );
      }
    } else if (verdict !== "REJECT_INVALID_DOC_CLASS") {
      verdict = "INCOMPLETE_DATA";
      reasons.push("Missing heavy metals test values (Pb, Cd, Hg, Cr VI sum <= 100 mg/kg per packaging component).");
    }

    // Food-contact PFAS checks (Article 5(5) applicable from 12 August 2026)
    let pfasSinglePpb = null;
    let pfasSumPpb = null;
    let totalFluorineMgKg = null;

    if (isFoodContact) {
      pfasSinglePpb = toPpb(input.pfasSingle, input.pfasSingleUnit || "ppb");
      pfasSumPpb = toPpb(input.pfasSum, input.pfasSumUnit || "ppb");
      totalFluorineMgKg = toMgKg(input.totalFluorine, input.totalFluorineUnit || "ppm");

      if (pfasSinglePpb === null && pfasSumPpb === null && totalFluorineMgKg === null) {
        if (verdict === "PASS_PRECHECK") verdict = "INCOMPLETE_DATA";
        reasons.push(
          "Food-contact packaging requires Article 5(5) PFAS verification (<25 ppb individual targeted PFAS, <250 ppb sum targeted PFAS, <50 ppm total PFAS / total fluorine check)."
        );
      } else {
        if (pfasSinglePpb !== null && pfasSinglePpb >= PPWR_ART5_THRESHOLDS.pfasSinglePpbLimit) {
          verdict = "FAIL_THRESHOLD";
          reasons.push(
            "Max single targeted non-polymeric PFAS (" +
              pfasSinglePpb +
              " ppb) meets or exceeds the 25 ppb Article 5(5) limit for food-contact packaging."
          );
        }
        if (pfasSumPpb !== null && pfasSumPpb >= PPWR_ART5_THRESHOLDS.pfasSumPpbLimit) {
          verdict = "FAIL_THRESHOLD";
          reasons.push(
            "Sum of targeted non-polymeric PFAS (" +
              pfasSumPpb +
              " ppb) meets or exceeds the 250 ppb Article 5(5) limit for food-contact packaging."
          );
        }
        if (totalFluorineMgKg !== null && totalFluorineMgKg >= PPWR_ART5_THRESHOLDS.pfasTotalPpmLimit) {
          if (verdict === "PASS_PRECHECK") verdict = "REVIEW_REQUIRED_ORIGIN_PROOF";
          reasons.push(
            "Total Fluorine / Total PFAS (" +
              totalFluorineMgKg +
              " mg/kg [ppm]) reaches or exceeds 50 ppm: Article 5(5) prohibits >=50 ppm total PFAS, and if total fluorine exceeds 50 mg/kg from non-PFAS sources, documented proof of non-PFAS origin is mandatory."
          );
        }
      }
    }

    const supplierPrompt = buildSupplierRelayPrompt({
      skuCode: input.skuCode || "PACKAGING-SKU-01",
      componentName: input.componentName || "Primary Packaging Component",
      foodContact: isFoodContact,
      verdict,
      reasons,
      supplierLang: input.supplierLang || "zh"
    });

    return {
      verdict,
      foodContact: isFoodContact,
      heavyMetalsSumMgKg,
      pfasSinglePpb,
      pfasSumPpb,
      totalFluorineMgKg,
      reasons,
      warnings,
      supplierPrompt,
      future2028FieldsNote: "Not yet applicable (2028-2030 harmonised labels & recyclability grades A/B/C are never fabricated)."
    };
  }

  function buildSupplierRelayPrompt(ctx) {
    const enGap =
      ctx.reasons.length > 0
        ? ctx.reasons.join(" ")
        : "Pre-check passed; please attach the full signed accredited lab PDF (SGS / Intertek / TUV / Eurofins / CNAS) for SHA-256 archiving.";
    if (ctx.supplierLang === "zh") {
      return [
        "【欧盟包装法规 PPWR (EU) 2025/40 材料检测报告补充通知】",
        "包装编号 / 组件: " + ctx.skuCode + " — " + ctx.componentName,
        "审核状态: " + ctx.verdict,
        "需补充/核实事项: 请提供针对该包装材料组件的有效第三方实验室检测报告 PDF（SGS / Intertek / TÜV / Eurofins / CNAS），须包含铅(Pb)+镉(Cd)+汞(Hg)+六价铬(Cr VI)总和 ≤ 100 mg/kg 数据" +
          (ctx.foodContact ? "，以及食品接触包装 PFAS 检测数据（单项 <25 ppb、总和 <250 ppb、总氟/总PFAS <50 ppm）。请勿上传 ISO 9001 或营业执照代替化学检测报告。" : "。请勿上传 ISO 9001 或营业执照代替材料化学检测报告。"),
        "[EN Summary] " + enGap
      ].join("\n");
    }
    if (ctx.supplierLang === "vi") {
      return [
        "[YÊU CẦU BỔ SUNG BÁO CÁO THỬ NGHIỆM BAO BÌ EU PPWR (EU) 2025/40]",
        "Mã bao bì / Thành phần: " + ctx.skuCode + " — " + ctx.componentName,
        "Trạng thái kiểm tra sơ bộ: " + ctx.verdict,
        "Yêu cầu kỹ thuật: Vui lòng gửi bản PDF báo cáo thử nghiệm phòng lab (SGS / Intertek / TÜV / Eurofins) cho đúng thành phần vật liệu này, thể hiện tổng kim loại nặng Pb+Cd+Hg+Cr(VI) <= 100 mg/kg" +
          (ctx.foodContact ? " và chỉ tiêu PFAS tiếp xúc thực phẩm (<25 ppb đơn chất, <250 ppb tổng PFAS đích, <50 ppm tổng Flo/PFAS). Không dùng giấy ISO 9001 hoặc ĐKKD thay cho test hóa chất." : ". Không dùng giấy ISO 9001 hoặc ĐKKD thay cho báo cáo phân tích hóa chất."),
        "[EN Summary] " + enGap
      ].join("\n");
    }
    return [
      "[EU PPWR Regulation (EU) 2025/40 — Packaging Component Evidence Request]",
      "SKU / Component: " + ctx.skuCode + " — " + ctx.componentName,
      "Pre-Check Status: " + ctx.verdict,
      "Action Needed: " + enGap,
      "Please provide an accredited laboratory test report PDF (SGS / Intertek / TUV / Eurofins / CNAS) covering Pb+Cd+Hg+Cr(VI) <= 100 mg/kg" +
        (ctx.foodContact ? " and food-contact PFAS (<25 ppb individual, <250 ppb sum, <50 ppm total PFAS/fluorine)." : ".")
    ].join("\n");
  }

  return {
    PPWR_ART5_THRESHOLDS,
    toMgKg,
    toPpb,
    evaluateSupplierEvidence,
    buildSupplierRelayPrompt
  };
});
