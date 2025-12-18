# Migrating Supabase Storage (PDFs)

When migrating to a new Supabase account, you also need to migrate the PDF files stored in Supabase Storage.

## Option 1: Re-download PDFs (Recommended)

Since the PDFs are originally downloaded from external sources, the easiest approach is to:

1. **Run the scraper again** in the new account:
   ```bash
   npm run scrape:all
   ```

2. The scraper will:
   - Download PDFs from original sources
   - Upload them to the new Supabase Storage
   - Link them to the imported editais

**Pros:**
- Simple and automatic
- Ensures you have the latest versions
- No manual file transfer needed

**Cons:**
- Requires re-downloading files
- May take time depending on number of PDFs

## Option 2: Manual Storage Migration

If you want to preserve the exact files from the old account:

### Step 1: Download PDFs from Old Account

1. Go to old Supabase Dashboard → Storage → `edital-pdfs` bucket
2. Download all folders/files, or use Supabase CLI:
   ```bash
   supabase storage download edital-pdfs ./backup-pdfs --project-ref OLD_PROJECT_REF
   ```

### Step 2: Upload to New Account

1. Create the bucket in new account (or let the script create it):
   ```sql
   -- The bucket will be created automatically on first run
   -- Or create manually in Dashboard → Storage → New bucket
   ```

2. Upload files using Supabase CLI:
   ```bash
   supabase storage upload edital-pdfs ./backup-pdfs --project-ref NEW_PROJECT_REF
   ```

3. Or upload manually via Dashboard → Storage → Upload files

### Step 3: Verify Storage Paths Match

Make sure the `caminho_storage` values in `edital_pdfs` table match the actual paths in Storage:
- Format: `{fonte}/{numero}/{filename.pdf}`
- Example: `sigfapes/10-2025/edital.pdf`

## Option 3: Use Supabase CLI (Advanced)

If you have Supabase CLI configured:

```bash
# Export from old project
supabase db dump --project-ref OLD_PROJECT_REF > backup.sql

# Import to new project
supabase db reset --project-ref NEW_PROJECT_REF
psql -h NEW_DB_HOST -U postgres -d postgres < backup.sql
```

## Recommended Approach

**For most cases, use Option 1 (re-download):**
- It's the simplest and most reliable
- The scraper handles everything automatically
- You ensure data consistency

**Use Option 2 only if:**
- PDFs are no longer available from original sources
- You need to preserve exact file versions
- You have many large files and bandwidth is a concern










