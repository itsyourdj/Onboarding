import { Router } from "express";
import { getScoredCustomers } from "../services/cache.js";

export const overviewRouter = Router();

overviewRouter.get("/", async (_req, res, next) => {
  try {
    const customers = await getScoredCustomers();
    const total = customers.length;
    const healthy = customers.filter((c) => c.healthCategory === "Healthy").length;
    const watch = customers.filter((c) => c.healthCategory === "Watch").length;
    const atRisk = customers.filter((c) => c.healthCategory === "At Risk").length;
    const overallScore = total
      ? Math.round(customers.reduce((s, c) => s + c.healthScore, 0) / total)
      : 0;

    const npsResponses = customers.reduce((s, c) => s + c.nps_responses, 0);
    const promoters = customers.reduce((s, c) => s + c.promoters, 0);
    const detractors = customers.reduce((s, c) => s + c.detractors, 0);
    const npsNet = npsResponses
      ? Math.round(((promoters - detractors) / npsResponses) * 100)
      : 0;

    const totalArr = customers.reduce((s, c) => s + (c.arr ?? 0), 0);
    const atRiskArr = customers
      .filter((c) => c.healthCategory === "At Risk")
      .reduce((s, c) => s + (c.arr ?? 0), 0);

    const bucket = (label: string, pred: (c: (typeof customers)[number]) => boolean) => ({
      label,
      count: customers.filter(pred).length,
    });

    const scoreDistribution = [
      bucket("0-40", (c) => c.healthScore < 40),
      bucket("40-55", (c) => c.healthScore >= 40 && c.healthScore < 55),
      bucket("55-70", (c) => c.healthScore >= 55 && c.healthScore < 70),
      bucket("70-85", (c) => c.healthScore >= 70 && c.healthScore < 85),
      bucket("85-100", (c) => c.healthScore >= 85),
    ];

    const groupBy = (key: (c: (typeof customers)[number]) => string | null) => {
      const map = new Map<string, { name: string; count: number; scoreSum: number; atRisk: number }>();
      for (const c of customers) {
        const name = key(c) ?? "Unknown";
        const g = map.get(name) ?? { name, count: 0, scoreSum: 0, atRisk: 0 };
        g.count++;
        g.scoreSum += c.healthScore;
        if (c.healthCategory === "At Risk") g.atRisk++;
        map.set(name, g);
      }
      return [...map.values()]
        .map((g) => ({ name: g.name, count: g.count, avgScore: Math.round(g.scoreSum / g.count), atRisk: g.atRisk }))
        .sort((a, b) => b.count - a.count);
    };

    const topAtRisk = [...customers]
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 8)
      .map((c) => ({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        healthScore: c.healthScore,
        healthCategory: c.healthCategory,
        region: c.region,
        gbo: c.gbo,
        arr: c.arr,
        npsClass: c.npsClass,
      }));

    res.json({
      total,
      healthy,
      watch,
      atRisk,
      overallScore,
      npsNet,
      npsResponses,
      promoters,
      detractors,
      passives: customers.reduce((s, c) => s + c.passives, 0),
      totalArr,
      atRiskArr,
      scoreDistribution,
      bySegment: groupBy((c) => c.sales_segment),
      byRegion: groupBy((c) => c.region),
      byGbo: groupBy((c) => c.gbo),
      topAtRisk,
    });
  } catch (err) {
    next(err);
  }
});
