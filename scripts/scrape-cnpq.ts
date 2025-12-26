#!/usr/bin/env tsx

/**
 * Script para executar apenas o scraper CNPq
 * 
 * Uso:
 *   npm run scrape:cnpq
 *   ou
 *   tsx scripts/scrape-cnpq.ts
 */

// Carregar variáveis de ambiente primeiro
import './load-env';

import { CnpqScraper } from './scrapers/cnpq-scraper';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           SCRAPER CNPq - CHAMADAS PÚBLICAS             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const scraper = new CnpqScraper();

  try {
    console.log(`🚀 Iniciando scraper: ${scraper.name}\n`);
    console.log('─'.repeat(50));
    
    const editais = await scraper.scrape();
    
    console.log('\n' + '═'.repeat(50));
    console.log('✅ SCRAPING CONCLUÍDO');
    console.log('═'.repeat(50));
    console.log(`📊 Total de editais extraídos: ${editais.length}`);
    
    if (editais.length > 0) {
      console.log('\n📋 Editais encontrados:');
      editais.forEach((edital, index) => {
        console.log(`  ${index + 1}. ${edital.titulo || 'Sem título'}`);
        if (edital.numero) {
          console.log(`     Número: ${edital.numero}`);
        }
        if (edital.dataPublicacao) {
          console.log(`     Inscrições: ${edital.dataPublicacao}${edital.dataEncerramento && edital.dataEncerramento !== edital.dataPublicacao ? ` até ${edital.dataEncerramento}` : ''}`);
        }
        if (edital.pdfUrls && edital.pdfUrls.length > 0) {
          console.log(`     PDFs: ${edital.pdfUrls.length}`);
        }
        if (edital.pdfPaths && edital.pdfPaths.length > 0) {
          console.log(`     PDFs baixados: ${edital.pdfPaths.length}`);
        }
        console.log('');
      });
      
      // Salvar JSON
      const outputDir = path.join(process.cwd(), 'scripts', 'output');
      const outputFile = path.join(outputDir, 'editais.json');
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Carregar editais existentes para mesclar
      let allEditais: any[] = [];
      if (fs.existsSync(outputFile)) {
        try {
          const existingData = fs.readFileSync(outputFile, 'utf-8');
          allEditais = JSON.parse(existingData);
        } catch (e) {
          console.log('⚠️ Não foi possível ler editais existentes, criando novo arquivo');
          allEditais = [];
        }
      }

      // Criar função para gerar chave única do edital (SEMPRE incluir fonte)
      const getEditalKey = (e: any): string => {
        // SEMPRE incluir fonte na chave para evitar conflitos entre fontes diferentes
        const fonte = e.fonte || 'unknown';
        
        // Usar número+fonte se tiver número
        if (e.numero) {
          return `${fonte}:${e.numero}`;
        }
        
        // Usar titulo+fonte se tiver título
        if (e.titulo) {
          // Normalizar título para chave (remover espaços extras, lowercase)
          const normalizedTitulo = (e.titulo || '').trim().toLowerCase().replace(/\s+/g, ' ').substring(0, 200);
          return `${fonte}:${normalizedTitulo}`;
        }
        
        // Fallback: usar índice se não tiver nem número nem título
        return `${fonte}:unknown-${Date.now()}-${Math.random()}`;
      };

      // Criar mapa de editais existentes usando chave única
      // IMPORTANTE: Usar array para cada chave para evitar sobrescrita
      const editaisMap = new Map<string, any[]>();
      
      // Primeiro, adicionar TODOS os editais existentes ao mapa
      // IMPORTANTE: Remover campos de debug de editais existentes também
      allEditais.forEach(e => {
        // Remover campos de debug se existirem
        const { _debug, resultadoLinksArray, ...editalClean } = e as any;
        const key = getEditalKey(editalClean);
        if (!editaisMap.has(key)) {
          editaisMap.set(key, []);
        }
        editaisMap.get(key)!.push(editalClean);
      });

      // Adicionar ou atualizar editais do CNPq
      editais.forEach(edital => {
        const key = getEditalKey(edital);
        const existingArray = editaisMap.get(key) || [];
        
        // Procurar edital CNPq existente com mesma chave
        const existingCnpq = existingArray.find(e => e.fonte === 'cnpq');
        
        if (existingCnpq && edital.fonte === 'cnpq') {
          // Atualizar edital CNPq existente mantendo PDFs anteriores
          // IMPORTANTE: Normalizar URLs para evitar duplicatas
          const normalizeUrl = (url: string) => {
            try {
              const urlObj = new URL(url);
              return `${urlObj.origin}${urlObj.pathname}${urlObj.search}`.toLowerCase();
            } catch {
              return url.toLowerCase();
            }
          };
          
          const existingPdfs = existingCnpq.pdfUrls || [];
          const newPdfs = edital.pdfUrls || [];
          
          // Criar mapa de URLs normalizadas para remover duplicatas
          const pdfUrlsMap = new Map<string, string>();
          [...existingPdfs, ...newPdfs].forEach(url => {
            if (url && typeof url === 'string') {
              const normalized = normalizeUrl(url);
              // Manter a URL original mais completa (com query params se houver)
              if (!pdfUrlsMap.has(normalized) || url.length > (pdfUrlsMap.get(normalized) || '').length) {
                pdfUrlsMap.set(normalized, url);
              }
            }
          });
          const allPdfs = Array.from(pdfUrlsMap.values());
          
          // Normalizar paths também (remover duplicatas por caminho absoluto)
          const existingPaths = existingCnpq.pdfPaths || [];
          const newPaths = edital.pdfPaths || [];
          const allPaths = [...new Set([...existingPaths, ...newPaths].map(p => path.resolve(p)))];
          
          // Substituir o edital CNPq existente pelo atualizado
          // IMPORTANTE: Remover campos de debug antes de salvar
          const { _debug, resultadoLinksArray, ...editalClean } = edital as any;
          
          const index = existingArray.indexOf(existingCnpq);
          existingArray[index] = {
            ...existingCnpq,
            ...editalClean,
            pdfUrls: allPdfs,
            pdfPaths: allPaths,
            processadoEm: edital.processadoEm || existingCnpq.processadoEm
          };
          editaisMap.set(key, existingArray);
          console.log(`  ✅ Edital CNPq atualizado: ${edital.numero || edital.titulo?.substring(0, 40)} (${allPdfs.length} PDFs únicos)`);
        } else if (!existingCnpq && edital.fonte === 'cnpq') {
          // Novo edital CNPq (não existe ainda)
          // IMPORTANTE: Remover campos de debug antes de salvar
          const { _debug, resultadoLinksArray, ...editalClean } = edital as any;
          
          // Verificar se não há outro edital com mesmo número mas fonte diferente
          const duplicateByNumber = existingArray.find(e => 
            e.numero === edital.numero && e.fonte !== 'cnpq'
          );
          
          if (duplicateByNumber) {
            console.log(`  ⚠️ Edital com número ${edital.numero} já existe com fonte ${duplicateByNumber.fonte}, adicionando CNPq como novo`);
          }
          
          if (!editaisMap.has(key)) {
            editaisMap.set(key, []);
          }
          editaisMap.get(key)!.push(editalClean);
          console.log(`  ✅ Novo edital CNPq adicionado: ${edital.numero || edital.titulo?.substring(0, 40)}`);
        }
        // Se existing existe mas não é CNPq, não fazer nada (preservar edital existente)
      });

      // Converter mapa de arrays de volta para array único (flatten)
      const updatedEditais: any[] = [];
      editaisMap.forEach((editaisArray) => {
        updatedEditais.push(...editaisArray);
      });
      
      // Salvar JSON atualizado
      fs.writeFileSync(outputFile, JSON.stringify(updatedEditais, null, 2), 'utf-8');
      console.log(`\n💾 ${updatedEditais.length} edital(is) salvos em: ${outputFile}`);
      console.log(`   (${editais.length} editais do CNPq)`);
    } else {
      console.log('\n⚠️ Nenhum edital foi extraído.');
    }
    
  } catch (error) {
    console.error('\n❌ Erro durante o scraping:', error);
    process.exit(1);
  } finally {
    await scraper.cleanup();
  }
}

// Executar
main().catch(console.error);

