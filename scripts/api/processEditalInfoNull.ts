#!/usr/bin/env tsx
/**
 * Processa somente editais que tenham algum campo null: sobre_programa, criterios_elegibilidade,
 * timeline_estimada, valor_projeto, prazo_inscricao, localizacao, vagas, is_researcher, is_company.
 *
 * Uso: npm run api:process-edital-info-null
 */
import "../load-env";
process.env.PROCESS_EDITAL_MODE = "null";
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
