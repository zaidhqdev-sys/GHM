# Connect Storage / Media Source Audit

**Status:** SOURCE EVIDENCE ONLY — NO CONSTRUCTION AUTHORIZATION  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Date:** 2026-09-18

> **Status reconciliation — 2026-10-13:** This document is a source audit of Connect at the recorded 2026-09-18 commit, not a current GHM implementation or production-readiness verdict. Its Connect-side observations remain tied to that exact source snapshot. Current GHM construction and qualification status is governed by `GHM_CURRENT_STATE.md` and `GHM_REMAINING_WORK_REGISTER_2026-10-05.md`; qualified resource slices do not imply complete Connect workflow parity, production routing, or cutover. Any row describing a GHM capability as missing/not implemented records the state at this audit's comparison point unless explicitly reconciled by later evidence.

## 1. Purpose

Inventory every evidenced Connect storage usage. The “no GHM storage implementation is authorized” statement records the audit-time decision only; GHM storage persistence and the live R2 provider data path have since been qualified in the current storage qualification records. Product-facing media workflows, production enablement, and cutover remain separately gated.

**Known correction:** Business logos use bucket `media` with object prefix `logos/`. Do **not** invent a `business-logos` bucket.

## 2. Call-site inventory

All primary Storage SDK usages found under `src/lib/lib_supabase.js` and path helpers in `src/lib/businessLogo.js`.

`createSignedUrl`: **not found** in Connect `src` or `supabase` application code.

| Object class | Bucket | Path pattern | Ops | Caller | Classification |
|---|---|---|---|---|---|
| Business logo | `media` | `logos/{businessUuid}/logo.{jpg\|jpeg\|png\|webp}` | upload, remove, getPublicUrl + RPC `set_business_logo` / `clear_business_logo` | `businessService.uploadLogo` / `clearLogo` | **public** (bucket public + logo policies) |
| Profile avatar | `media` | `avatars/{userId}.{ext}` | upload upsert, getPublicUrl | `profileService.uploadAvatar` | **public URL** in code; Storage RLS for avatars path **EVIDENCE INSUFFICIENT** in migrations (logo policies only) |
| Business gallery image | `media` | `businesses/{businessId}/{timestamp}.{ext}` | upload, getPublicUrl + `business_images` row | `businessImageService` | **public URL** in code; table not in migrations (**orphan metadata**) |
| Project image | `media` | `projects/{projectId}/{timestamp}.{ext}` | upload, getPublicUrl + `project_images` row | `projectService.uploadProjectImage` | **public URL** in code; table not in migrations |
| Workspace file | `media` | `workspace/{workspaceId}/{timestamp}.{ext}` | upload, getPublicUrl + `workspace_files` row | workspace upload helper | **public URL** in code; tables not in migrations |
| Verification document | `private-docs` | `verification/{businessId}/{documentType}/{timestamp}.{ext}` | upload only (no getPublicUrl/remove/signed in app) + `verification_documents` row | `verificationService.uploadDocument` | **authenticated/owner intended**; bucket policies **EVIDENCE INSUFFICIENT** in migrations; table not in migrations |

## 3. Bucket evidence

### `media`

Migration `20260827140000_establish_governed_business_logo_storage.sql`:

- Creates/updates bucket `media`, `public=true`, 2MB, jpeg/png/webp
- Storage policies scoped to **`logos/`** prefix only
- Comment states galleries/cover/avatars are out of that migration’s scope

Constant: `BUSINESS_LOGO_BUCKET = "media"` in `businessLogo.js`.

### `private-docs`

Referenced by application code only. **No** `insert into storage.buckets` for `private-docs` found under `supabase/migrations` in this audit. Classification of production bucket existence: **EVIDENCE INSUFFICIENT** (app assumes it).

## 4. Metadata ownership

| Metadata table | Migration create? | Role |
|---|---|---|
| Business logo fields on `businesses` | via logo RPCs | Authoritative for logo URL after governed set/clear |
| `verification_documents` | No (only legacy schema dump) | App-referenced; not migration-proven |
| `business_images` | No | App-referenced |
| `project_images` | No | App-referenced |
| `workspace_files` / `project_workspace` | No | App-referenced |

## 5. Conclusions

1. In the 2026-09-18 Connect storage-source snapshot, the only migration-governed **Connect-side Supabase Storage** contract was **`media` + `logos/`** with logo RPCs. This does not describe the later GHM/R2 provider qualification or establish a browser-usable GHM media API.
2. Other `media` prefixes are used by the app but lack matching Storage policy migrations in the audited set.
3. `private-docs` and several media metadata tables are **not migration-proven**; do not invent GHM tables from app references alone.
4. At the 2026-09-18 audit snapshot, GHM had no qualified storage resource. Subsequent GHM storage persistence and the live R2 provider data path have been qualified, as stated in this document's current-status notice. Product-facing media workflows, authorization coverage for every Connect media prefix, production enablement, and cutover remain separately gated.
5. Any expansion beyond the qualified `business_logo` storage object class requires separate authorization after active callers, orphan metadata, bucket policy, privacy and retention requirements are resolved.

## Target Connect storage exposure reconciliation — 2026-10-13

The storage service/R2 qualification recorded in this source audit proves only the bounded provider/service behavior it names. The current Connect no-Supabase audit found no storage router registered in `src/http/app.ts`, and the current storage object policy supports `business_logo` only. Thus the existing evidence is not proof of a browser-usable Connect storage API. Keep authenticated upload/complete/access/delete HTTP exposure and contract tests open as **Extend** for the confirmed logo journey; do not treat workspace files, project images, or verification documents as covered until separate active callers, object classes, privacy and retention rules are evidenced. No production route exposure or cutover is authorized by this note.
