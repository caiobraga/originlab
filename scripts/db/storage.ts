import { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { Edital } from '../types';

const STORAGE_BUCKET = 'edital-pdfs'; // Nome do bucket no Supabase Storage

/**
 * Faz upload dos PDFs de um edital para o Supabase Storage
 */
export async function uploadPdfsToStorage(
  supabase: SupabaseClient,
  editalId: string,
  edital: Edital
): Promise<void> {
  // Validar que o edital tem título válido antes de fazer upload
  const titulo = edital.titulo?.trim();
  if (!titulo || 
      titulo.length <= 3 || 
      titulo === 'Sem título' || 
      titulo === 'N/A' ||
      titulo.match(/^N\/A\s*-\s*Sem título$/i)) {
    console.warn(`  ⚠️ Pulando upload de PDFs - edital sem título válido: "${titulo}"`);
    return;
  }

  if (!edital.pdfPaths || edital.pdfPaths.length === 0) {
    return;
  }

  // Garantir que o bucket existe (criar se não existir)
  await ensureBucketExists(supabase);

  const uploadedFiles: Array<{ nome: string; caminho: string }> = [];
  const skippedFiles: Array<{ nome: string; motivo: string }> = [];

  for (const pdfPath of edital.pdfPaths) {
    try {
      // Verificar se o arquivo existe
      if (!fs.existsSync(pdfPath)) {
        console.warn(`  ⚠️ Arquivo não encontrado: ${path.basename(pdfPath)}`);
        continue;
      }

      let fileName = path.basename(pdfPath);
      
      // IMPORTANTE: Sanitizar nome do arquivo para evitar problemas com espaços e caracteres especiais
      // Manter apenas caracteres seguros para URLs e sistemas de arquivos
      const sanitizeFileName = (name: string): string => {
        // Decodificar URL se necessário
        let sanitized = decodeURIComponent(name);
        
        // Remover caracteres perigosos e substituir espaços por underscores
        sanitized = sanitized
          .replace(/[^a-zA-Z0-9._-]/g, '_') // Substituir caracteres especiais por underscore
          .replace(/_{2,}/g, '_') // Remover underscores múltiplos
          .replace(/^_+|_+$/g, '') // Remover underscores no início e fim
          .substring(0, 200); // Limitar tamanho
        
        // Garantir que tem extensão .pdf
        if (!sanitized.toLowerCase().endsWith('.pdf')) {
          sanitized = `${sanitized}.pdf`;
        }
        
        return sanitized || 'edital.pdf';
      };
      
      fileName = sanitizeFileName(fileName);
      
      // Sanitizar também o número do edital para o caminho
      const sanitizePathSegment = (segment: string): string => {
        return segment
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .replace(/_{2,}/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 100);
      };
      
      const safeFonte = sanitizePathSegment(edital.fonte || 'unknown');
      const safeNumero = sanitizePathSegment(edital.numero || 'unknown');
      
      // Criar caminho no storage: fonte/numero/nome_arquivo.pdf (todos sanitizados)
      const storagePath = `${safeFonte}/${safeNumero}/${fileName}`;

      // Verificar se o PDF já existe no banco de dados
      const { data: existingPdf, error: checkError } = await supabase
        .from('edital_pdfs')
        .select('id, edital_id')
        .eq('caminho_storage', storagePath)
        .maybeSingle();

      // Ignorar erro de "não encontrado" - é esperado quando o PDF não existe ainda
      if (checkError && checkError.code !== 'PGRST116') {
        console.warn(`  ⚠️ Erro ao verificar PDF existente ${fileName}:`, checkError.message);
      }

      if (existingPdf) {
        // PDF já existe no banco
        // Obter UUID do objeto no Storage (para o n8n)
        let fileId: string | null = null;
        const { data: fileData } = await supabase.storage
          .from(STORAGE_BUCKET)
          .list(path.dirname(storagePath), {
            search: path.basename(storagePath),
          });
        if (fileData && fileData.length > 0) {
          fileId = fileData[0].id || null;
        }

        // Se o edital_id mudou (edital foi atualizado) ou file_id precisa ser atualizado
        if (existingPdf.edital_id !== editalId || fileId) {
          const updateData: any = {};
          if (existingPdf.edital_id !== editalId) {
            updateData.edital_id = editalId;
          }
          if (fileId) updateData.file_id = fileId;

          const { error: updateError } = await supabase
            .from('edital_pdfs')
            .update(updateData)
            .eq('caminho_storage', storagePath);

          if (updateError) {
            console.warn(`  ⚠️ Erro ao atualizar registro do PDF ${fileName}:`, updateError.message);
          } else {
            console.log(`  ℹ️ PDF já existe, referência atualizada: ${fileName}`);
            uploadedFiles.push({ nome: fileName, caminho: storagePath });
          }
        } else {
          // PDF já existe e está associado ao mesmo edital
          skippedFiles.push({ nome: fileName, motivo: 'já existe no banco' });
        }
        continue;
      }

      // PDF não existe no banco, fazer upload
      const fileBuffer = fs.readFileSync(pdfPath);

      // Detectar tipo MIME baseado na extensão do arquivo (ANTES do upload)
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

      // Verificar se o arquivo já existe no storage (sem fazer upload)
      const { data: storageFiles } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(`${edital.fonte || 'unknown'}/${edital.numero || 'unknown'}`);

      const fileExistsInStorage = storageFiles?.some(file => file.name === fileName);

      let fileId: string | null = null;

      if (!fileExistsInStorage) {
        // Fazer upload apenas se não existir no storage
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, fileBuffer, {
            contentType: contentType,
            upsert: false, // Não sobrescrever - se existir, dar erro
          });

        if (error) {
          // Se o erro for de arquivo já existente, continuar (pode ter sido criado entre a verificação e o upload)
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            console.log(`  ℹ️ PDF já existe no storage: ${fileName}`);
            // Tentar obter o ID do arquivo existente
            const { data: fileData } = await supabase.storage
              .from(STORAGE_BUCKET)
              .list(path.dirname(storagePath), {
                search: path.basename(storagePath),
              });
            if (fileData && fileData.length > 0) {
              fileId = fileData[0].id || null;
            }
          } else {
            throw error;
          }
        } else {
          // Obter UUID do objeto no Storage (list/search)
          if (data?.path) {
            const { data: fileInfo } = await supabase.storage
              .from(STORAGE_BUCKET)
              .list(path.dirname(data.path), {
                search: path.basename(data.path),
              });
            if (fileInfo && fileInfo.length > 0) {
              fileId = fileInfo[0].id || null;
            }
          }
          console.log(`  📤 PDF enviado para storage: ${fileName}${fileId ? ` (file_id: ${fileId})` : ''}`);
        }
      } else {
        console.log(`  ℹ️ PDF já existe no storage: ${fileName}`);
        const { data: fileData } = await supabase.storage
          .from(STORAGE_BUCKET)
          .list(path.dirname(storagePath), {
            search: path.basename(storagePath),
          });
        if (fileData && fileData.length > 0) {
          fileId = fileData[0].id || null;
        }
      }

      // Usar o mesmo tipo MIME detectado anteriormente
      const mimeType = contentType;

      // Inserir registro na tabela edital_pdfs (usando upsert para garantir que não duplica)
      const { error: dbError } = await supabase
        .from('edital_pdfs')
        .upsert({
          edital_id: editalId,
          nome_arquivo: fileName,
          caminho_storage: storagePath,
          url_original: edital.pdfUrls?.[edital.pdfPaths.indexOf(pdfPath)] || null,
          tamanho_bytes: fileBuffer.length,
          tipo_mime: mimeType,
          file_id: fileId,
        }, {
          onConflict: 'caminho_storage',
          ignoreDuplicates: false,
        });

      if (dbError) {
        console.warn(`  ⚠️ Erro ao salvar registro do PDF ${fileName}:`, dbError.message);
      } else {
        uploadedFiles.push({ nome: fileName, caminho: storagePath });
        console.log(`  ✅ PDF registrado no banco: ${fileName}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Erro ao fazer upload de ${path.basename(pdfPath)}:`, errorMsg);
    }
  }

  // Resumo
  if (uploadedFiles.length > 0 || skippedFiles.length > 0) {
    console.log(`  📊 Resumo para edital ${edital.numero || 'N/A'}:`);
    if (uploadedFiles.length > 0) {
      console.log(`     ✅ ${uploadedFiles.length} PDF(s) processado(s)`);
    }
    if (skippedFiles.length > 0) {
      console.log(`     ⏭️  ${skippedFiles.length} PDF(s) já existente(s) (pulados)`);
    }
  }
}

/**
 * Garante que o bucket existe no Supabase Storage
 */
async function ensureBucketExists(supabase: SupabaseClient): Promise<void> {
  // Verificar se o bucket existe
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    throw new Error(`Erro ao listar buckets: ${listError.message}`);
  }

  const bucketExists = buckets?.some(b => b.name === STORAGE_BUCKET);

  if (!bucketExists) {
    // Criar bucket
    const { error: createError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
      public: true, // Tornar público para acesso direto
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: ['application/pdf'],
    });

    if (createError) {
      throw new Error(`Erro ao criar bucket: ${createError.message}`);
    }

    console.log(`✅ Bucket "${STORAGE_BUCKET}" criado no Supabase Storage`);
  }
}

