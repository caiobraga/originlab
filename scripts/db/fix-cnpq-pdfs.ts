// Carregar variáveis de ambiente primeiro
import '../load-env';

import { createClient } from '@supabase/supabase-js';
import * as path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                    process.env.SUPABASE_URL || 
                    process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
                    process.env.SUPABASE_SERVICE_ROLE_KEY ||
                    process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente não encontradas!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const STORAGE_BUCKET = 'edital-pdfs';

// Função para sanitizar nome de arquivo
const sanitizeFileName = (name: string): string => {
  let sanitized = decodeURIComponent(name);
  sanitized = sanitized
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 200);
  
  if (!sanitized.toLowerCase().endsWith('.pdf')) {
    sanitized = `${sanitized}.pdf`;
  }
  
  return sanitized || 'edital.pdf';
};

// Função para sanitizar segmento de caminho
const sanitizePathSegment = (segment: string): string => {
  return segment
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 100);
};

async function fixCnpqPdfs() {
  console.log('🔧 Corrigindo PDFs do CNPq com nomes problemáticos...\n');

  // Buscar todos os PDFs do CNPq
  const { data: cnpqPdfs, error } = await supabase
    .from('edital_pdfs')
    .select('id, nome_arquivo, caminho_storage, edital_id')
    .like('caminho_storage', 'cnpq/%');

  if (error) {
    console.error('❌ Erro ao buscar PDFs do CNPq:', error);
    process.exit(1);
  }

  if (!cnpqPdfs || cnpqPdfs.length === 0) {
    console.log('✅ Nenhum PDF do CNPq encontrado.');
    return;
  }

  console.log(`📊 Encontrados ${cnpqPdfs.length} PDF(s) do CNPq\n`);

  let fixedCount = 0;
  let errorCount = 0;

  for (const pdf of cnpqPdfs) {
    try {
      const oldPath = pdf.caminho_storage;
      const oldFileName = pdf.nome_arquivo;
      
      // Verificar se o nome precisa ser sanitizado
      const sanitizedFileName = sanitizeFileName(oldFileName);
      const needsFix = sanitizedFileName !== oldFileName || oldPath.includes(' ') || oldPath.includes('%');
      
      if (!needsFix) {
        console.log(`  ✅ ${oldFileName} - já está correto`);
        continue;
      }

      console.log(`  🔧 Corrigindo: ${oldFileName}`);
      console.log(`     Caminho antigo: ${oldPath}`);

      // Extrair partes do caminho
      const pathParts = oldPath.split('/');
      if (pathParts.length < 3) {
        console.warn(`  ⚠️ Caminho inválido, pulando: ${oldPath}`);
        continue;
      }

      const fonte = sanitizePathSegment(pathParts[0]);
      const numero = sanitizePathSegment(pathParts[1]);
      const newFileName = sanitizedFileName;
      const newPath = `${fonte}/${numero}/${newFileName}`;

      console.log(`     Caminho novo: ${newPath}`);

      // Verificar se o arquivo existe no storage com o caminho antigo
      const { data: oldFile } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(path.dirname(oldPath), {
          search: path.basename(oldPath),
        });

      if (!oldFile || oldFile.length === 0) {
        console.warn(`  ⚠️ Arquivo não encontrado no storage: ${oldPath}`);
        // Tentar baixar do caminho antigo
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(oldPath);

        if (downloadError || !fileData) {
          console.warn(`  ⚠️ Não foi possível baixar arquivo: ${downloadError?.message}`);
          errorCount++;
          continue;
        }

        // Converter para buffer
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Fazer upload com novo caminho
        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(newPath, buffer, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (uploadError) {
          console.error(`  ❌ Erro ao fazer upload: ${uploadError.message}`);
          errorCount++;
          continue;
        }

        // Atualizar registro no banco
        const { error: updateError } = await supabase
          .from('edital_pdfs')
          .update({
            nome_arquivo: newFileName,
            caminho_storage: newPath,
          })
          .eq('id', pdf.id);

        if (updateError) {
          console.error(`  ❌ Erro ao atualizar registro: ${updateError.message}`);
          errorCount++;
        } else {
          console.log(`  ✅ Arquivo corrigido e re-enviado`);
          fixedCount++;
        }
      } else {
        // Arquivo existe, apenas atualizar registro no banco
        const { error: updateError } = await supabase
          .from('edital_pdfs')
          .update({
            nome_arquivo: newFileName,
            caminho_storage: newPath,
          })
          .eq('id', pdf.id);

        if (updateError) {
          console.error(`  ❌ Erro ao atualizar registro: ${updateError.message}`);
          errorCount++;
        } else {
          console.log(`  ✅ Registro atualizado`);
          fixedCount++;
        }
      }
    } catch (error) {
      console.error(`  ❌ Erro ao processar PDF ${pdf.id}:`, error);
      errorCount++;
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUMO');
  console.log('═'.repeat(50));
  console.log(`✅ PDFs corrigidos: ${fixedCount}`);
  console.log(`❌ Erros: ${errorCount}`);
}

fixCnpqPdfs().catch(console.error);

