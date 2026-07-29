import { Router } from "express";
import { getAdapter } from "../adapters/index.js";

export const filtersRouter = Router();

filtersRouter.get("/", async (_req, res, next) => {
  try {
    const opts = await getAdapter().filterOptions();
    res.json({
      ...opts,
      categories: ["Healthy", "Watch", "At Risk"],
      npsClasses: ["Promoter", "Passive", "Detractor", "No Survey"],
    });
  } catch (err) {
    next(err);
  }
});
