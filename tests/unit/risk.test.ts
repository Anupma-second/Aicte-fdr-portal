import { describe, expect, it } from "vitest";
import { computeRisk, type RiskInput } from "@/lib/fdr/risk";

const base: RiskInput = {
  status: "ACTIVE",
  daysToMaturity: 400,
  missingDocuments: 0,
  pastDelays: 0,
  openDiscrepancies: 0,
  resolvedDiscrepancies: 0,
};

describe("risk score", () => {
  it("is green with no reasons when nothing is wrong", () => {
    expect(computeRisk(base)).toEqual({ score: 0, level: "GREEN", reasons: [] });
  });

  it("is red when overdue, and says so", () => {
    const risk = computeRisk({ ...base, daysToMaturity: -3 });
    expect(risk.level).toBe("RED");
    expect(risk.reasons).toEqual([{ code: "OVERDUE", points: 70, value: 3 }]);
  });

  it("gets more urgent as maturity approaches", () => {
    const scores = [120, 80, 50, 20, 5].map((daysToMaturity) => computeRisk({ ...base, daysToMaturity }).score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(computeRisk({ ...base, daysToMaturity: 20 }).level).toBe("AMBER");
    expect(computeRisk({ ...base, daysToMaturity: 5 }).level).toBe("RED");
  });

  it("score always equals the sum of its reasons, up to 100", () => {
    const risk = computeRisk({ ...base, daysToMaturity: 45, missingDocuments: 1, pastDelays: 1, openDiscrepancies: 1 });
    expect(risk.score).toBe(risk.reasons.reduce((total, reason) => total + reason.points, 0));
    expect(risk.score).toBe(55);
  });

  it("caps each factor and the total", () => {
    const risk = computeRisk({
      ...base,
      daysToMaturity: -10,
      missingDocuments: 9,
      pastDelays: 9,
      openDiscrepancies: 9,
      resolvedDiscrepancies: 9,
    });
    expect(risk.reasons.find((reason) => reason.code === "MISSING_DOCUMENTS")?.points).toBe(30);
    expect(risk.score).toBe(100);
  });

  it("carries no risk once a deposit is finished", () => {
    for (const status of ["RENEWED", "REPLACED", "RELEASED", "CLOSED"] as const) {
      expect(computeRisk({ ...base, status, daysToMaturity: -100 }).level).toBe("GREEN");
    }
  });
});
