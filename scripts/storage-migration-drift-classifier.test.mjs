import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyStorageMigrationFourState } from './storage-migration-drift-classifier.mjs';

const baseline = {
  constraintValidated: true,
  returnType: 'ghm.storage_object',
  constraintDefinition: "CHECK (((status = 'pending' AND available_at IS NULL AND deleted_at IS NULL) OR (status = 'available' AND available_at IS NOT NULL AND deleted_at IS NULL) OR (status = 'deletion_pending' AND available_at IS NOT NULL AND deleted_at IS NULL) OR (status = 'deleted' AND deleted_at IS NOT NULL)))",
  functionDefinition: "CREATE FUNCTION ghm.storage_mark_deletion_pending(p_object_id bigint) RETURNS ghm.storage_object LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'ghm' AS $function$ BEGIN UPDATE ghm.storage_object SET status = 'deletion_pending' WHERE id = p_object_id AND status = 'available'; IF NOT FOUND THEN RAISE EXCEPTION 'storage object is not available or does not exist'; END IF; RETURN v_row; END; $function$",
  securityDefiner: true,
  owner: 'ghm_schema_owner',
  configuration: ['search_path=pg_catalog, ghm'],
  acl: '{ghm_schema_owner=X/ghm_schema_owner,ghm_runtime=X/ghm_schema_owner}',
  runtimeExecute: true,
  gatewayExecute: false,
};

test('classifies exact pre-migration storage state', () => {
  assert.equal(classifyStorageMigrationFourState(baseline), 'PRE_MIGRATION');
});

test('classifies exact migration-4 state', () => {
  assert.equal(classifyStorageMigrationFourState({
    ...baseline,
    constraintDefinition: "CHECK (((status = 'pending' AND available_at IS NULL AND deleted_at IS NULL) OR (status = 'available' AND available_at IS NOT NULL AND deleted_at IS NULL) OR (status = 'deletion_pending' AND deleted_at IS NULL) OR (status = 'deleted' AND deleted_at IS NOT NULL)))",
    functionDefinition: "CREATE FUNCTION ghm.storage_mark_deletion_pending(p_object_id bigint) RETURNS ghm.storage_object LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'ghm' AS $function$ BEGIN UPDATE ghm.storage_object SET status = 'deletion_pending' WHERE id = p_object_id AND status IN ('pending', 'available'); IF NOT FOUND THEN RAISE EXCEPTION 'storage object is not pending or available, or does not exist'; END IF; RETURN v_row; END; $function$",
    securityDefiner: true,
    acl: '{ghm_schema_owner=X/ghm_schema_owner,ghm_runtime=X/ghm_schema_owner}',
  }), 'POST_MIGRATION');
});

test('classifies the exact October SECURITY DEFINER baseline as pre-migration', () => {
  assert.equal(classifyStorageMigrationFourState(baseline), 'PRE_MIGRATION');
});

test('classifies unexpected baseline ACL authority as partial drift', () => {
  assert.equal(classifyStorageMigrationFourState({
    ...baseline,
    acl: '{=X/owner,ghm_runtime=X/ghm_schema_owner,ghm_schema_owner=X/ghm_schema_owner}',
  }), 'PARTIAL_DRIFT');
});

test('classifies unexpected baseline function authority as partial drift', () => {
  assert.equal(classifyStorageMigrationFourState({
    ...baseline,
    securityDefiner: false,
  }), 'PARTIAL_DRIFT');
});

test('fails closed when lifecycle constraint is post-migration but function is old', () => {
  assert.equal(classifyStorageMigrationFourState({
    ...baseline,
    constraintDefinition: "CHECK ((status = 'deletion_pending' AND deleted_at IS NULL))",
  }), 'PARTIAL_DRIFT');
});

test('fails closed when post-migration function has unexpected gateway or PUBLIC execute', () => {
  const post = {
    ...baseline,
    constraintDefinition: "CHECK ((status = 'deletion_pending' AND deleted_at IS NULL))",
    functionDefinition: "CREATE FUNCTION x() BEGIN UPDATE ghm.storage_object SET status = 'deletion_pending' WHERE id = 1 AND status IN ('pending', 'available'); END",
    securityDefiner: true,
  };
  assert.equal(classifyStorageMigrationFourState({ ...post, gatewayExecute: true }), 'PARTIAL_DRIFT');
  assert.equal(classifyStorageMigrationFourState({ ...post, acl: '{=X/owner,ghm_runtime=X/owner}' }), 'PARTIAL_DRIFT');
  assert.equal(classifyStorageMigrationFourState({ ...post, acl: '{ghm_schema_owner=X/ghm_schema_owner,ghm_runtime=X/ghm_schema_owner,other_role=X/ghm_schema_owner}' }), 'PARTIAL_DRIFT');
});

test('unknown or missing catalog state is not treated as safe', () => {
  assert.equal(classifyStorageMigrationFourState({ ...baseline, functionDefinition: null }), 'UNKNOWN_DRIFT');
  assert.equal(classifyStorageMigrationFourState({ ...baseline, constraintValidated: false }), 'UNKNOWN_DRIFT');
});
