# Supabase Migration Guide

Complete guide to migrate your Supabase database from one account to another.

## Overview

This migration involves:
1. **Database tables** (`editais`, `edital_pdfs`)
2. **Storage bucket** (`edital-pdfs` with PDF files)
3. **Environment variables** (update `.env.local`)

## Prerequisites

- Access to both old and new Supabase accounts
- SQL Editor access in both accounts
- (Optional) Supabase CLI installed for advanced operations

## Step-by-Step Migration

### Step 1: Export Data from Old Account

#### Option A: Using SQL Export (Recommended)

1. **Open old Supabase Dashboard** → SQL Editor

2. **Run export script:**
   - Open `scripts/db/export-data.sql`
   - Copy and run the SELECT statements
   - Copy the output INSERT statements
   - Save to a text file (e.g., `editais-export.sql`)

3. **Or use CSV export:**
   - Go to Table Editor → `editais` → Export CSV
   - Repeat for `edital_pdfs` table
   - Save files as `editais.csv` and `edital_pdfs.csv`

#### Option B: Using Supabase Dashboard

1. Go to **Table Editor** → Select `editais` table
2. Click **Export** → Choose format (CSV recommended)
3. Repeat for `edital_pdfs` table
4. Download both CSV files

### Step 2: Create Schema in New Account

1. **Open new Supabase Dashboard** → SQL Editor

2. **Run schema creation:**
   - Open `scripts/db/schema.sql`
   - Copy entire content
   - Paste in SQL Editor
   - Click **Run**

3. **Verify tables created:**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('editais', 'edital_pdfs');
   ```

### Step 3: Import Data to New Account

#### Option A: Using INSERT Statements

1. **Open new Supabase Dashboard** → SQL Editor

2. **Run import script:**
   - Open `scripts/db/import-data.sql`
   - Replace example INSERT statements with your exported data
   - Run the script

3. **Or paste directly:**
   - Paste all INSERT statements from Step 1
   - Run in SQL Editor

#### Option B: Using CSV Import

1. **Go to Table Editor** → `editais` table

2. **Import CSV:**
   - Click **Insert** → **Import data from CSV**
   - Upload `editais.csv`
   - Map columns correctly
   - Click **Import**

3. **Repeat for `edital_pdfs`:**
   - Import `edital_pdfs.csv`
   - Make sure `edital_id` references exist

#### Option C: Using Supabase CLI

```bash
# Connect to new database
supabase db reset --project-ref NEW_PROJECT_REF

# Import SQL dump
psql -h NEW_DB_HOST -U postgres -d postgres < backup.sql
```

### Step 4: Migrate Storage (PDFs)

See `migrate-storage.md` for detailed instructions.

**Quick method (recommended):**
```bash
# Just re-run the scraper - it will download and upload PDFs automatically
npm run scrape:all
```

### Step 5: Update Environment Variables

Update `.env.local` with new Supabase credentials:

```env
# New Supabase Project
VITE_SUPABASE_URL=https://NEW_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=new_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=new_service_role_key_here
```

**Where to find:**
- Dashboard → Settings → API
- Copy `Project URL` → `VITE_SUPABASE_URL`
- Copy `anon public` key → `VITE_SUPABASE_ANON_KEY`
- Copy `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### Step 6: Verify Migration

Run verification queries:

```sql
-- Check record counts
SELECT 
  'editais' AS table_name,
  COUNT(*) AS total_records
FROM editais
UNION ALL
SELECT 
  'edital_pdfs' AS table_name,
  COUNT(*) AS total_records
FROM edital_pdfs;

-- Check for orphaned PDFs
SELECT COUNT(*) AS orphaned_pdfs
FROM edital_pdfs ep
LEFT JOIN editais e ON ep.edital_id = e.id
WHERE e.id IS NULL;

-- Check storage bucket
SELECT COUNT(*) AS total_files
FROM storage.objects
WHERE bucket_id = 'edital-pdfs';
```

### Step 7: Test Application

1. **Restart your dev server:**
   ```bash
   npm run dev
   ```

2. **Test database connection:**
   - Login to your app
   - Check if editais are loading
   - Verify PDFs are accessible

3. **Run scraper:**
   ```bash
   npm run scrape:all
   ```
   - Should sync with new database
   - Should upload PDFs to new storage

## Troubleshooting

### Issue: Foreign Key Violations

**Problem:** `edital_pdfs` references `editais` that don't exist

**Solution:**
```sql
-- Import editais first, then edital_pdfs
-- Or temporarily disable foreign key checks:
SET session_replication_role = 'replica';
-- Import data
SET session_replication_role = 'origin';
```

### Issue: UUID Conflicts

**Problem:** UUIDs from old database conflict

**Solution:**
- Let new database generate new UUIDs
- Remove `id` column from INSERT statements
- Or use `gen_random_uuid()` in new inserts

### Issue: Storage Files Not Found

**Problem:** PDFs not accessible after migration

**Solution:**
1. Re-run scraper: `npm run scrape:all`
2. Or manually upload PDFs to Storage
3. Verify `caminho_storage` paths match Storage structure

### Issue: Constraint Violations

**Problem:** Duplicate `(numero, fonte)` entries

**Solution:**
```sql
-- Check for duplicates
SELECT numero, fonte, COUNT(*) 
FROM editais 
GROUP BY numero, fonte 
HAVING COUNT(*) > 1;

-- Remove duplicates (keep newest)
DELETE FROM editais
WHERE id NOT IN (
  SELECT DISTINCT ON (numero, fonte) id
  FROM editais
  ORDER BY numero, fonte, criado_em DESC
);
```

## Rollback Plan

If something goes wrong:

1. **Keep old account active** until migration is verified
2. **Export data again** if needed
3. **Restore from backup** if you have one
4. **Update `.env.local`** back to old credentials

## Post-Migration Checklist

- [ ] Schema created successfully
- [ ] All data imported
- [ ] PDFs accessible in Storage
- [ ] Environment variables updated
- [ ] Application tested
- [ ] Scraper tested
- [ ] Old account can be deactivated

## Need Help?

If you encounter issues:
1. Check Supabase logs in Dashboard
2. Verify SQL syntax in SQL Editor
3. Check browser console for frontend errors
4. Review migration scripts for typos









