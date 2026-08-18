#!/usr/bin/env node
/**
 * Provision a ready-to-use Notebound account for a tester.
 *
 * Why this exists: the normal signup flow emails a confirmation link that
 * redirects to the Supabase Site URL. Until that URL points somewhere real, a
 * tester's first experience is a dead page and they assume signup failed.
 * Creating the account here with `email_confirm: true` skips that entirely —
 * the tester just opens the app and signs in.
 *
 * The password is generated locally by this script and printed once. It is
 * never written to disk, never committed, and never leaves your machine.
 *
 * Usage:
 *   node scripts/create-test-account.js <email> "<Display Name>"
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (already there, and .env is
 * gitignored). The service role key bypasses RLS — never ship it in the app.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env not found at the project root.');
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

/**
 * Generate a password a tester can actually type on a phone keyboard.
 * Alphabet excludes look-alike characters (0/O, 1/l/I). 12 chars from a
 * 30-character alphabet is ~59 bits of entropy — far beyond what a
 * friends-and-family test account needs.
 */
function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  // Group as xxxx-xxxx-xxxx so it's readable out loud and over a message.
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

async function main() {
  const [email, displayName] = process.argv.slice(2);

  if (!email || !displayName) {
    console.error('Usage: node scripts/create-test-account.js <email> "<Display Name>"');
    process.exit(1);
  }
  if (!email.includes('@')) {
    console.error(`"${email}" doesn't look like an email address.`);
    process.exit(1);
  }

  const env = loadEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = generatePassword();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // the whole point: no confirmation email, no dead link
    user_metadata: { display_name: displayName },
  });

  if (error) {
    console.error(`\nCould not create the account: ${error.message}`);
    process.exit(1);
  }

  // The on_auth_user_created trigger (migration 002) creates the profile row
  // from display_name metadata. Verify it actually landed rather than assuming.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('id', data.user.id)
    .single();

  console.log('\n  Account created\n');
  console.log(`  Email:     ${email}`);
  console.log(`  Password:  ${password}`);
  console.log(`  Name:      ${displayName}`);
  console.log(`  User ID:   ${data.user.id}`);

  if (profileError || !profile) {
    console.log(`\n  WARNING: profile row was not created (${profileError?.message ?? 'not found'}).`);
    console.log('  The app expects one. Check the on_auth_user_created trigger.');
  } else {
    console.log(`  Profile:   created as "${profile.display_name}"`);
  }

  console.log('\n  Send these credentials to your tester over a private channel,');
  console.log('  and tell them to change the password once they are signed in.');
  console.log('  This password is not saved anywhere — copy it now.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
