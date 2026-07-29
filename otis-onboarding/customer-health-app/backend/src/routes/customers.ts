import { Router } from "express";
import { getAdapter } from "../adapters/index.js";
import { scoreCustomer } from "../services/health.js";
import { getScoredCustomers } from "../services/cache.js";

export const customersRouter = Router();

customersRouter.get("/", async (req, res, next) => {
  try {
    let list = await getScoredCustomers();
    const { category, nps, region, gbo, segment, classification, search, sort } =
      req.query as Record<string, string>;

    if (category) list = list.filter((c) => c.healthCategory === category);
    if (nps) list = list.filter((c) => c.npsClass === nps);
    if (region) list = list.filter((c) => c.region === region);
    if (gbo) list = list.filter((c) => c.gbo === gbo);
    if (segment) list = list.filter((c) => c.sales_segment === segment);
    if (classification) list = list.filter((c) => c.classification === classification);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.customer_name ?? "").toLowerCase().includes(q) ||
          c.customer_id.toLowerCase().includes(q)
      );
    }

    const sortKey = sort ?? "score_asc";
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "score_desc": return b.healthScore - a.healthScore;
        case "arr_desc": return (b.arr ?? 0) - (a.arr ?? 0);
        case "nps_asc": return (a.latest_nps ?? 99) - (b.latest_nps ?? 99);
        case "name": return (a.customer_name ?? "").localeCompare(b.customer_name ?? "");
        case "score_asc":
        default: return a.healthScore - b.healthScore;
      }
    });

    res.json({
      count: list.length,
      customers: list.map((c) => ({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        region: c.region,
        subregion: c.subregion,
        gbo: c.gbo,
        sales_segment: c.sales_segment,
        classification: c.classification,
        nsa_name: c.nsa_name,
        healthScore: c.healthScore,
        healthCategory: c.healthCategory,
        npsClass: c.npsClass,
        latest_nps: c.latest_nps,
        avg_nps: c.avg_nps,
        missed_visits: c.missed_visits,
        total_callbacks: c.total_callbacks,
        total_units: c.total_units,
        open_orders: c.open_orders,
        arr: c.arr,
        clv: c.clv,
        delinquent: c.delinquent,
        last_visit_date: c.last_visit_date,
      })),
    });
  } catch (err) {
    next(err);
  }
});

customersRouter.get("/:id", async (req, res, next) => {
  try {
    const detail = await getAdapter().customerDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: "Customer not found" });
    const scored = scoreCustomer(detail.metrics);
    res.json({
      customer: scored,
      npsTrend: detail.npsTrend,
      npsHistory: detail.npsHistory,
      contracts: detail.contracts,
      units: detail.units,
      openIssues: detail.openIssues,
      missedVisitTrend: detail.missedVisitTrend,
      negativeFeedback: detail.negativeFeedback,
      arTrend: detail.arTrend,
      recentNotes: detail.recentNotes,
    });
  } catch (err) {
    next(err);
  }
});
