import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'database/migrations/20261125010000_add_protected_business_featured_directory_order.sql',
  'utf8',
);
const businessContracts = fs.readFileSync('src/resources/business-identity/contracts.ts', 'utf8');
const publicContracts = fs.readFileSync('src/resources/business-identity/public-contracts.ts', 'utf8');
const publicRepository = fs.readFileSync('src/resources/business-identity/public-repository.ts', 'utf8');
const directoryRepository = fs.readFileSync('src/resources/directory/repository.ts', 'utf8');

test('featured listing state is canonical, protected and defaults to false', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false/);
  assert.match(migration, /WHERE is_active = true\s+AND is_verified = true\s+AND verification_status = 'approved'/);
  assert.match(businessContracts, /'is_featured'/);
  assert.doesNotMatch(businessContracts.match(/export interface UpdateBusinessProfileInput[\s\S]*?\n}/)?.[0] ?? '', /isFeatured|is_featured/);
});

test('public Business and Directory projections expose only the read-only featured boolean', () => {
  assert.match(publicContracts, /readonly isFeatured\?: boolean/);
  assert.match(publicRepository, /is_featured/);
  assert.match(publicRepository, /isFeatured: row\.is_featured === true/);
  assert.match(directoryRepository, /b\.is_featured/);
  assert.match(directoryRepository, /isFeatured: row\.is_featured === true/);
});

test('featured businesses remain first for every supported directory ordering', () => {
  assert.match(directoryRepository, /b\.is_featured DESC, b\.rating DESC, b\.created_at DESC/);
  assert.match(directoryRepository, /b\.is_featured DESC, b\.created_at DESC/);
  assert.match(directoryRepository, /b\.is_featured DESC, b\.review_count DESC/);
  assert.match(directoryRepository, /b\.is_featured DESC, \$\{distanceExpression\} ASC/);
});
