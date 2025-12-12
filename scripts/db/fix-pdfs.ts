/**
 * Script para corrigir e re-enviar PDFs corrompidos
 * 
 * Este script:
 * 1. Lista todos os PDFs no banco de dados
 * 2. Verifica se os arquivos locais existem e são válidos
 * 3. Re-baixa PDFs corrompidos ou ausentes
 * 4. Re-envia para o Supabase Storage
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import '../load-env';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                    process.env.SUPABASE_URL || 
                    process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
                    process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente do Supabase não configuradas.');
  console.error('Configure:');
  console.error('   - VITE_SUPABASE_URL ou SUPABASE_URL');
  console.error('   - VITE_SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const STORAGE_BUCKET = 'edital-pdfs';
const PDFS_DIR = path.join(process.cwd(), 'scripts', 'output', 'pdfs');

/**
 * Verifica se um arquivo é um documento válido (PDF, DOCX, DOC, etc.)
 */
function isValidDocument(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  
  // PDF: %PDF
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  
  // Office documents (ZIP-based): PK\x03\x04
  const isOfficeDoc = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
  
  // DOC antigo: D0 CF 11 E0
  const isOldDoc = buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
  
  return isPdf || isOfficeDoc || isOldDoc;
}

/**
 * Re-baixa um PDF da URL original usando fetch nativo do Node.js
 */
async function redownloadPdf(pdfUrl: string): Promise<Buffer | null> {
  try {
    console.log(`  📥 Re-baixando PDF de: ${pdfUrl}`);
    
    // Usar fetch nativo do Node.js (disponível no Node 18+)
    const response = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/pdf,application/octet-stream,*/*',
      },
    });

    if (!response.ok) {
      console.error(`  ❌ Erro HTTP ${response.status}: ${response.statusText}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verificar se é um documento válido (PDF, DOCX, DOC, etc.)
    if (!isValidDocument(buffer)) {
      console.error(`  ❌ Arquivo baixado não é um documento válido (magic number: ${buffer.slice(0, 4).toString('hex')})`);
      return null;
    }

    console.log(`  ✅ PDF re-baixado com sucesso (${(buffer.length / 1024).toFixed(2)} KB)`);
    return buffer;
  } catch (error) {
    console.error(`  ❌ Erro ao re-baixar PDF:`, error);
    return null;
  }
}

/**
 * Processa um PDF do banco de dados
 */
async function processPdf(pdfRecord: any, edital: any) {
  const fileName = pdfRecord.nome_arquivo;
  const storagePath = pdfRecord.caminho_storage;
  const urlOriginal = pdfRecord.url_original;

  console.log(`\n📄 Processando: ${fileName}`);
  console.log(`   Storage path: ${storagePath}`);
  console.log(`   URL original: ${urlOriginal || 'N/A'}`);

  // Verificar se o arquivo local existe
  const localPath = path.join(PDFS_DIR, fileName);
  let buffer: Buffer | null = null;
  let needsRedownload = false;

  if (fs.existsSync(localPath)) {
    buffer = fs.readFileSync(localPath);
    
    // Verificar se é válido (aceita PDF, DOCX, DOC, etc.)
    if (!isValidDocument(buffer)) {
      console.log(`  ⚠️ Arquivo local existe mas não parece ser um documento válido`);
      needsRedownload = true;
    } else {
      console.log(`  ✅ Arquivo local válido (${(buffer.length / 1024).toFixed(2)} KB)`);
    }
  } else {
    console.log(`  ⚠️ Arquivo local não encontrado`);
    needsRedownload = true;
  }

  // Re-baixar se necessário
  if (needsRedownload && urlOriginal) {
    buffer = await redownloadPdf(urlOriginal);
    
    if (buffer) {
      // Salvar localmente
      if (!fs.existsSync(PDFS_DIR)) {
        fs.mkdirSync(PDFS_DIR, { recursive: true });
      }
      fs.writeFileSync(localPath, buffer);
      console.log(`  💾 Arquivo salvo localmente: ${localPath}`);
    } else {
      console.log(`  ⚠️ Não foi possível re-baixar o PDF, pulando...`);
      return;
    }
  }

  if (!buffer) {
    console.log(`  ⚠️ Nenhum buffer disponível, pulando...`);
    return;
  }

  // Verificar se já existe no storage
  const { data: storageFiles } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(path.dirname(storagePath));

  const fileExists = storageFiles?.some(f => f.name === fileName);

  if (fileExists) {
    // Remover arquivo antigo do storage
    console.log(`  🗑️ Removendo arquivo antigo do storage...`);
    const { error: deleteError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);

    if (deleteError) {
      console.warn(`  ⚠️ Erro ao remover arquivo antigo: ${deleteError.message}`);
    }
  }

  // Detectar tipo MIME baseado na extensão
  let contentType = 'application/pdf';
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.docx') {
    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else if (ext === '.doc') {
    contentType = 'application/msword';
  } else if (ext === '.xlsx') {
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (ext === '.pptx') {
    contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }

  // Fazer upload do arquivo corrigido
  console.log(`  📤 Enviando para storage (tipo: ${contentType})...`);
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: contentType,
      upsert: true, // Sobrescrever se existir
    });

  if (uploadError) {
    console.error(`  ❌ Erro ao fazer upload: ${uploadError.message}`);
    return;
  }

  // Usar o mesmo contentType detectado acima para atualizar no banco
  const mimeType = contentType;

  // Atualizar registro no banco
  const { error: updateError } = await supabase
    .from('edital_pdfs')
    .update({
      tamanho_bytes: buffer.length,
      tipo_mime: mimeType,
    })
    .eq('id', pdfRecord.id);

  if (updateError) {
    console.warn(`  ⚠️ Erro ao atualizar registro: ${updateError.message}`);
  } else {
    console.log(`  ✅ PDF corrigido e re-enviado com sucesso!`);
  }
}

/**
 * Função principal
 */
async function main() {
  console.log('🔧 Script de Correção de PDFs\n');
  console.log('═══════════════════════════════════════════════════\n');

  // Buscar todos os PDFs do banco
  console.log('📊 Buscando PDFs do banco de dados...');
  const { data: pdfs, error: pdfsError } = await supabase
    .from('edital_pdfs')
    .select(`
      *,
      editais (
        id,
        numero,
        titulo,
        fonte
      )
    `)
    .order('criado_em', { ascending: false });

  if (pdfsError) {
    console.error('❌ Erro ao buscar PDFs:', pdfsError);
    process.exit(1);
  }

  console.log(`✅ Encontrados ${pdfs?.length || 0} PDFs no banco\n`);

  if (!pdfs || pdfs.length === 0) {
    console.log('⚠️ Nenhum PDF encontrado no banco de dados.');
    return;
  }

  // Processar cada PDF
  let processed = 0;
  let fixed = 0;
  let skipped = 0;

  for (const pdf of pdfs) {
    const edital = pdf.editais;
    if (!edital) {
      console.log(`\n⚠️ PDF ${pdf.nome_arquivo} sem edital associado, pulando...`);
      skipped++;
      continue;
    }

    await processPdf(pdf, edital);
    processed++;

    // Aguardar um pouco entre processamentos para não sobrecarregar
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 RESUMO');
  console.log('═══════════════════════════════════════════════════');
  console.log(`✅ Processados: ${processed}`);
  console.log(`🔧 Corrigidos: ${fixed}`);
  console.log(`⏭️  Pulados: ${skipped}`);
  console.log('═══════════════════════════════════════════════════\n');
}

// Executar
main().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});

