import fs from 'fs-extra';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '../utils/env';

export async function uploadToSupabase(localPath: string, bucket: string, remoteKey: string) {
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_KEY');
  const sb = createClient(url, key, { auth: { persistSession: false }});
  const data = await fs.readFile(localPath);
  const { error } = await sb.storage.from(bucket).upload(remoteKey, data, {
    upsert: true, contentType: 'application/octet-stream'
  });
  if (error) throw error;
}

export interface InstallerRowData {
  version: string;
  product_id: string;
  storage_fid_win?: string;
  storage_fid_mac?: string;
}

export async function upsertInstallerRow(version: string, productTag: string, platform: 'mac' | 'win', storageFid: string) {
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_KEY');
  const sb = createClient(url, key, { 
    auth: { persistSession: false },
    db: { schema: 'shop' }
  });

  // find product ID by tag
  const { data: product, error: productError } = await sb
    .from('products')
    .select('id')
    .eq('tag', productTag)
    .single();

  if (productError) throw productError;

  const productId = product.id;

  // Check if a row with this version already exists
  const { data: existing, error: queryError } = await sb
    .from('installers')
    .select('*')
    .eq('version', version);

  if (queryError) throw queryError;

  if (!existing || existing.length === 0) {
    // Insert new row
    const newRow: InstallerRowData = {
      version,
      product_id: productId,
      storage_fid_win: platform === 'win' ? storageFid : '',
      storage_fid_mac: platform === 'mac' ? storageFid : '',
    };
    const { error: insertError } = await sb.from('installers').insert(newRow);
    if (insertError) throw insertError;
  } else {
    // Update existing row with platform-specific storage_fid
    const updateData = platform === 'win' 
      ? { storage_fid_win: storageFid }
      : { storage_fid_mac: storageFid };
    
    const { error: updateError } = await sb
      .from('installers')
      .update(updateData)
      .eq('version', version);
    
    if (updateError) throw updateError;
  }
}
