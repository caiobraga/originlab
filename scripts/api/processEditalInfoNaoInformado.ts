#!/usr/bin/env tsx
/**
 * Processa somente editais já processados que tenham "Não informado" em algum campo.
 *
 * Uso: npm run api:process-edital-info-nao-informado
 */
import "../load-env";
process.env.PROCESS_EDITAL_MODE = "nao-informado";
const { processAllEditaisInfo } = await import("./processEditalInfo");
processAllEditaisInfo()
  .then(() => {
    console.log("\n✅ Processamento concluído!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Erro fatal:", err);
    process.exit(1);
  });
