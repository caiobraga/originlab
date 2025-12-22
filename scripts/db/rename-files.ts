/**
 * Script para renomear arquivos com extensão incorreta
 * Arquivos DOCX salvos como .pdf serão renomeados para .docx
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import '../load-env';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                    process.env.SUPABASE_URL || 
                    process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
                    process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente do Supabase não configuradas.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const PDFS_DIR = path.join(process.cwd(), 'scripts', 'output', 'pdfs');
const STORAGE_BUCKET = 'edital-pdfs';

/**
 * Detecta o tipo real do arquivo pelo magic number
 */
function detectFileType(buffer: Buffer): { ext: string; mimeType: string } {
  if (buffer.length < 4) {
    return { ext: '.pdf', mimeType: 'application/pdf' };
  }

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { ext: '.pdf', mimeType: 'application/pdf' };
  }
  
  // ZIP-based formats (Office documents): PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return { ext: '.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }
  
  // DOC antigo: D0 CF 11 E0
  if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
    return { ext: '.doc', mimeType: 'application/msword' };
  }

  return { ext: '.pdf', mimeType: 'application/pdf' };
}

async function renameFile(oldPath: string, newPath: string): Promise<void> {
  try {
    fs.renameSync(oldPath, newPath);
    console.log(`  ✅ Renomeado: ${path.basename(oldPath)} → ${path.basename(newPath)}`);
  } catch (error) {
    console.error(`  ❌ Erro ao renomear ${path.basename(oldPath)}:`, error);
    throw error;
  }
}

async function updateStoragePath(oldPath: string, newPath: string, pdfRecord: any): Promise<void> {
  const oldFileName = path.basename(oldPath);
  const newFileName = path.basename(newPath);
  const oldStoragePath = pdfRecord.caminho_storage;
  const newStoragePath = oldStoragePath.replace(oldFileName, newFileName);

  // Atualizar no banco de dados
  const { error: updateError } = await supabase
    .from('edital_pdfs')
    .update({
      nome_arquivo: newFileName,
      caminho_storage: newStoragePath,
    })
    .eq('id', pdfRecord.id);

  if (updateError) {
    console.error(`  ⚠️ Erro ao atualizar banco: ${updateError.message}`);
    throw updateError;
  }

  // Renomear no storage (mover arquivo)
  const { error: moveError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .move(oldStoragePath, newStoragePath);

  if (moveError) {
    console.error(`  ⚠️ Erro ao mover no storage: ${moveError.message}`);
    // Continuar mesmo se falhar no storage (arquivo local já foi renomeado)
  } else {
    console.log(`  ✅ Atualizado no storage: ${newStoragePath}`);
  }
}

async function main() {
  console.log('🔄 Script de Renomeação de Arquivos\n');
  console.log('═══════════════════════════════════════════════════\n');

  // Buscar todos os PDFs do banco
  const { data: pdfs, error: pdfsError } = await supabase
    .from('edital_pdfs')
    .select('*')
    .order('criado_em', { ascending: false });

  if (pdfsError) {
    console.error('❌ Erro ao buscar PDFs:', pdfsError);
    process.exit(1);
  }

  console.log(`📊 Encontrados ${pdfs?.length || 0} arquivos no banco\n`);

  if (!pdfs || pdfs.length === 0) {
    console.log('⚠️ Nenhum arquivo encontrado.');
    return;
  }

  let renamed = 0;
  let skipped = 0;
  let errors = 0;

  for (const pdf of pdfs) {
    const fileName = pdf.nome_arquivo;
    const filePath = path.join(PDFS_DIR, fileName);

    console.log(`\n📄 Processando: ${fileName}`);

    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠️ Arquivo local não encontrado, pulando...`);
      skipped++;
      continue;
    }

    // Ler arquivo e detectar tipo real
    const buffer = fs.readFileSync(filePath);
    const { ext, mimeType } = detectFileType(buffer);

    // Verificar se a extensão está correta
    const currentExt = path.extname(fileName).toLowerCase();
    
    if (currentExt === ext) {
      console.log(`  ✅ Extensão já está correta (${ext})`);
      skipped++;
      continue;
    }

    // Renomear arquivo
    const newFileName = fileName.replace(/\.(pdf|docx|doc)$/i, ext);
    const newFilePath = path.join(PDFS_DIR, newFileName);

    if (fs.existsSync(newFilePath)) {
      console.log(`  ⚠️ Arquivo destino já existe, pulando...`);
      skipped++;
      continue;
    }

    try {
      console.log(`  🔄 Detectado tipo real: ${ext} (${mimeType})`);
      console.log(`  📝 Renomeando de ${ext} para ${ext}...`);
      
      await renameFile(filePath, newFilePath);
      await updateStoragePath(filePath, newFilePath, pdf);
      
      renamed++;
    } catch (error) {
      console.error(`  ❌ Erro ao processar:`, error);
      errors++;
    }

    // Aguardar um pouco entre processamentos
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 RESUMO');
  console.log('═══════════════════════════════════════════════════');
  console.log(`✅ Renomeados: ${renamed}`);
  console.log(`⏭️  Pulados: ${skipped}`);
  console.log(`❌ Erros: ${errors}`);
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});

















