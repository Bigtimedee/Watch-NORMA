#!/usr/bin/env -S deno run --allow-env --allow-net --allow-read

/**
 * Upload media assets to Supabase Storage and update public_url in media_assets table.
 *
 * Usage:
 *   deno run --allow-env --allow-net --allow-read supabase/assets/upload-media-assets.ts
 *
 * Required env vars:
 *   SUPABASE_URL              - e.g. https://xyzxyz.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY - service role JWT (bypasses RLS)
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment."
  );
  Deno.exit(1);
}

const BUCKET = "social-images";
const STORAGE_PREFIX = "norma-screenshots";

// Resolve the media directory relative to this script file.
// __dirname equivalent in Deno:
const scriptDir = new URL(".", import.meta.url).pathname;
const mediaDir = `${scriptDir}media`;

const authHeaders = {
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: SUPABASE_SERVICE_ROLE_KEY,
};

async function uploadFile(filename: string): Promise<void> {
  const filePath = `${mediaDir}/${filename}`;
  const storagePath = `${STORAGE_PREFIX}/${filename}`;

  // Read file
  let data: Uint8Array;
  try {
    data = await Deno.readFile(filePath);
  } catch (err) {
    console.error(`  [SKIP] Cannot read ${filePath}: ${err}`);
    return;
  }

  // Determine content type
  const contentType = filename.endsWith(".png") ? "image/png" : "image/jpeg";

  // Upload to Supabase Storage (upsert = true via x-upsert header)
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: data,
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    console.error(`  [FAIL] Upload ${filename}: HTTP ${uploadRes.status} — ${body}`);
    return;
  }

  // Build public URL (assumes bucket is public)
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

  // Update media_assets row
  const updateUrl = `${SUPABASE_URL}/rest/v1/media_assets?filename=eq.${encodeURIComponent(filename)}`;
  const updateRes = await fetch(updateUrl, {
    method: "PATCH",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ public_url: publicUrl }),
  });

  if (!updateRes.ok) {
    const body = await updateRes.text();
    console.error(
      `  [FAIL] DB update for ${filename}: HTTP ${updateRes.status} — ${body}`
    );
    return;
  }

  console.log(`  [OK]   ${filename} → ${publicUrl}`);
}

async function main() {
  console.log(`Scanning media directory: ${mediaDir}`);
  console.log(`Supabase project: ${SUPABASE_URL}`);
  console.log(`Bucket: ${BUCKET}  |  Path prefix: ${STORAGE_PREFIX}/\n`);

  const files: string[] = [];
  for await (const entry of Deno.readDir(mediaDir)) {
    if (entry.isFile && (entry.name.endsWith(".png") || entry.name.endsWith(".jpg") || entry.name.endsWith(".jpeg"))) {
      files.push(entry.name);
    }
  }

  if (files.length === 0) {
    console.warn("No image files found in media directory.");
    Deno.exit(0);
  }

  files.sort();
  console.log(`Found ${files.length} file(s): ${files.join(", ")}\n`);

  let ok = 0;
  let fail = 0;

  for (const filename of files) {
    try {
      await uploadFile(filename);
      ok++;
    } catch (err) {
      console.error(`  [FAIL] Unexpected error for ${filename}: ${err}`);
      fail++;
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
  if (fail > 0) Deno.exit(1);
}

await main();
