import type { Plugin } from 'vite';
import express from 'express';

export function apiPlugin(): Plugin {
  return {
    name: 'api-plugin',
    enforce: 'pre', // API antes do SPA fallback para /api/* não retornar 404
    async configureServer(server) {
      // Carregar variáveis de ambiente
      try {
        await import('./scripts/load-env.js');
      } catch (e) {
        console.warn('⚠️ Não foi possível carregar load-env:', e);
      }

      // Adicionar middleware do Express para a API
      const app = express();
      app.use(express.json({ limit: '50mb' }));
      
      // Importar e usar os routers da API
      try {
        const { default: extractEditalInfoRouter } = await import('./server/api/extract-edital-info.js');
        const { default: calculateEditalScoresRouter } = await import('./server/api/calculate-edital-scores.js');
        const { default: generatePropostaRouter } = await import('./server/api/generate-proposta.js');
        const { default: improveTextRouter } = await import('./server/api/improve-text.js');
        const { default: fetchLattesRouter } = await import('./server/api/fetch-lattes.js');
        const { default: translateRouter } = await import('./server/api/translate.js');
        
        app.use('/api', extractEditalInfoRouter);
        app.use('/api', fetchLattesRouter);
        app.use('/api', calculateEditalScoresRouter);
        app.use('/api', generatePropostaRouter);
        app.use('/api', improveTextRouter);
        app.use('/api', translateRouter);
        
        // Usar o middleware do Express no servidor Vite
        server.middlewares.use(app);
        
        console.log('✅ API endpoints configurados:');
        console.log('   - /api/extract-edital-info');
        console.log('   - /api/calculate-edital-scores');
        console.log('   - /api/generate-proposta');
        console.log('   - /api/improve-text');
        console.log('   - /api/translate');
        console.log('   - /api/lattes/:id, /api/fetch-cnpj');
      } catch (error) {
        console.error('❌ Erro ao configurar API endpoints:', error);
      }
    },
  };
}
