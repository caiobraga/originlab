import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import extractEditalInfoRouter from "./api/extract-edital-info.js";
import calculateEditalScoresRouter from "./api/calculate-edital-scores.js";
import generatePropostaRouter from "./api/generate-proposta.js";
import improveTextRouter from "./api/improve-text.js";
import fetchLattesRouter from "./api/fetch-lattes.js";
import translateRouter from "./api/translate.js";
import generateFieldTextRouter from "./api/generate-field-text.js";
import analyzeFieldRouter from "./api/analyze-field.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // API routes (before static files)
  app.use("/api", extractEditalInfoRouter);
  app.use("/api", fetchLattesRouter);
  app.use("/api", calculateEditalScoresRouter);
  app.use("/api", generatePropostaRouter);
  app.use("/api", improveTextRouter);
  app.use("/api", generateFieldTextRouter);
  app.use("/api", analyzeFieldRouter);
  app.use("/api", translateRouter);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`API endpoints:`);
    console.log(`  - http://localhost:${port}/api/extract-edital-info`);
    console.log(`  - http://localhost:${port}/api/calculate-edital-scores`);
    console.log(`  - http://localhost:${port}/api/generate-proposta`);
    console.log(`  - http://localhost:${port}/api/improve-text`);
    console.log(`  - http://localhost:${port}/api/fetch-cnpj`);
    console.log(`  - http://localhost:${port}/api/translate`);
    console.log(`  - http://localhost:${port}/api/generate-field-text`);
    console.log(`  - http://localhost:${port}/api/analyze-field`);
  });
}

startServer().catch(console.error);
