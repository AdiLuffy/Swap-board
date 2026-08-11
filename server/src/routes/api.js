import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { verifyConnectivity } from "../config/db.js";
import * as graph from "../services/graphService.js";

const router = Router();

router.get(
  "/health",
  asyncHandler(async (req, res) => {
    const db = await verifyConnectivity();
    res.status(db.ok ? 200 : 503).json({ status: db.ok ? "ok" : "degraded", db });
  })
);

router.get(
  "/people",
  asyncHandler(async (req, res) => {
    const { search = "", page = "1", limit = "20" } = req.query;
    const limitNum = Math.min(Number(limit) || 20, 100);
    const pageNum = Math.max(Number(page) || 1, 1);
    const skip = (pageNum - 1) * limitNum;
    const [people, total] = await Promise.all([
      graph.listPeople({ search, skip, limit: limitNum }),
      graph.countPeople({ search }),
    ]);
    res.json({ people, total, page: pageNum, limit: limitNum });
  })
);

router.get(
  "/people/:id",
  asyncHandler(async (req, res) => {
    const person = await graph.getPerson(req.params.id);
    if (!person) return res.status(404).json({ error: "Person not found" });
    res.json(person);
  })
);

router.get(
  "/people/:id/matches/direct",
  asyncHandler(async (req, res) => {
    res.json(await graph.findDirectMatches(req.params.id));
  })
);

router.get(
  "/people/:id/matches/chains",
  asyncHandler(async (req, res) => {
    res.json(await graph.findSwapChains(req.params.id));
  })
);

router.get(
  "/people/:id/recommendations",
  asyncHandler(async (req, res) => {
    res.json(await graph.recommendSkills(req.params.id));
  })
);

router.get(
  "/path",
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: "from and to are required" });
    const path = await graph.shortestConnection(from, to);
    if (!path) return res.status(404).json({ error: "No connection found" });
    res.json(path);
  })
);

router.get(
  "/skills",
  asyncHandler(async (req, res) => {
    const { search = "" } = req.query;
    res.json(await graph.listSkills({ search }));
  })
);

router.get(
  "/network",
  asyncHandler(async (req, res) => {
    const { category = "" } = req.query;
    res.json(await graph.getNetwork({ category }));
  })
);

export default router;
