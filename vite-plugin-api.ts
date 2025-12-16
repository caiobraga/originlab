import type { Plugin } from 'vite';
import express from 'express';

export function apiPlugin(): Plugin {
  return {
    name: 'api-plugin',
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
      
      // Importar e usar o router da API
      try {
        const { default: extractEditalInfoRouter } = await import('./server/api/extract-edital-info.js');
        app.use('/api', extractEditalInfoRouter);
        
        // Usar o middleware do Express no servidor Vite
        server.middlewares.use(app);
        
        console.log('✅ API endpoint configurado: /api/extract-edital-info');
      } catch (error) {
        console.error('❌ Erro ao configurar API endpoint:', error);
      }
    },
  };
}
