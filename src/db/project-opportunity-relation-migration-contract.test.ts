import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('database/migrations/20261106200000_link_project_to_opportunity.sql', 'utf8');
const repository = fs.readFileSync('src/resources/project/repository.ts', 'utf8');
const contracts = fs.readFileSync('src/resources/project/contracts.ts', 'utf8');

test('Project stores a unique restrictive relation to its canonical Opportunity', () => {
  assert.match(migration, /ADD COLUMN opportunity_id bigint/);
  assert.match(migration, /REFERENCES ghm\.opportunity\(id\)/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /CREATE UNIQUE INDEX project_opportunity_unique/);
  assert.match(contracts, /opportunityId\?: number \| null/);
  assert.match(repository, /opportunity_id/);
});

test('Project creation creates a project-type Opportunity before inserting the Project in one transaction', () => {
  assert.match(repository, /withAuthorizedTransaction\(/);
  assert.match(repository, /WHERE code = 'project' AND is_active = true/);
  assert.match(repository, /lifecycle_status, visibility[\s\S]*'open', 'authenticated'/);
  assert.match(repository, /INSERT INTO ghm\.opportunity_participant/);
  assert.match(repository, /INSERT INTO ghm\.project/);
  assert.match(repository, /opportunityId, normalized\.title/);
});
