/**
 * Carrega variáveis de ambiente do arquivo .env.local
 * Deve ser importado no início de todos os scripts Node.js
 */
import * as fs from 'fs';
import * as path from 'path';

// Tentar carregar .env.local
const envPath = path.join(process.cwd(), '.env.local');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Ignorar comentários e linhas vazias
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // Parsear linha no formato KEY=VALUE
    const match = trimmedLine.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      const cleanValue = value.trim().replace(/^["']|["']$/g, ''); // Remover aspas se houver
      
      // Só definir se não existir (não sobrescrever variáveis já definidas)
      if (!process.env[key]) {
        process.env[key] = cleanValue;
      }
    }
  }
  
  console.log('✅ Variáveis de ambiente carregadas de .env.local');
} else {
  console.warn('⚠️ Arquivo .env.local não encontrado. Usando variáveis de ambiente do sistema.');
}















