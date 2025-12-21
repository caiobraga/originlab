import express from "express";
import extractEditalInfoRouter from "../server/api/extract-edital-info.js";
import calculateEditalScoresRouter from "../server/api/calculate-edital-scores.js";
import generatePropostaRouter from "../server/api/generate-proposta.js";
import improveTextRouter from "../server/api/improve-text.js";

const app = express();

// API routes
app.use("/api", extractEditalInfoRouter);
app.use("/api", calculateEditalScoresRouter);
app.use("/api", generatePropostaRouter);
app.use("/api", improveTextRouter);

// Vercel serverless function handler - Vercel will automatically handle Express apps
export default app;

