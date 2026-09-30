# Connect Storage / Media Source Audit

**Status:** SOURCE EVIDENCE ONLY — NO CONSTRUCTION AUTHORIZATION  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Date:** 2026-09-18

## 1. Purpose

Inventory every evidenced Connect storage usage. No GHM storage implementation is authorized.

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

1. The only migration-governed storage contract is **`media` + `logos/`** with logo RPCs.
2. Other `media` prefixes are used by the app but lack matching Storage policy migrations in the audited set.
3. `private-docs` and several media metadata tables are **not migration-proven**; do not invent GHM tables from app references alone.
4. GHM currently has no storage resource; Connect requires object storage for logos/avatars/docs/images if those workflows remain live.
5. Storage abstraction / bucket authorization requires explicit construction authorization after resolving orphan metadata and bucket policy evidence.
