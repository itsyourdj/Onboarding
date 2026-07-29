import { Router } from "express";
import { getAdapter } from "../adapters/index.js";

export const insightsRouter = Router();

insightsRouter.get("/", async (_req, res, next) => {
  try {
    const data = await getAdapter().insights();
    res.json(data);
  } catch (err) {
    next(err);
  }
});
