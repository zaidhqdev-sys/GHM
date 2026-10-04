import fs from "node:fs";
import crypto from "node:crypto";

const sourceProject = process.env.GHM_QUOTEFLOW_HISTORICAL_SOURCE_PROJECT_REF || "wetsblzwhxxgqpttwqht";
const evidenceFile = process.env.GHM_QUOTEFLOW_HISTORICAL_SOURCE_EVIDENCE_FILE || "";
const decision = "HISTORICAL_SOURCE_EVIDENCE_UNAVAILABLE";

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const evidencePresent = Boolean(evidenceFile && fs.existsSync(evidenceFile));
const evidenceReadable = evidencePresent && fs.statSync(evidenceFile).isFile();
const evidenceChecksum = evidenceReadable ? sha256File(evidenceFile) : null;

const output = {
  status: decision,
  mutation_authorized: false,
  source_project: {
    name: "QuoteFlow",
    ref: sourceProject,
    status: "INACTIVE",
  },
  recovery: {
    attempted: true,
    mutation_performed: false,
    restore_blocked_by: "SUPABASE_ORGANIZATION_UNPAID_INVOICES",
  },
  evidence_artifact: {
    configured: Boolean(evidenceFile),
    present: evidencePresent,
    readable: evidenceReadable,
    sha256: evidenceChecksum,
  },
  next_gate: "qualify:quoteflow-legacy-identity-provenance",
};

console.log(JSON.stringify(output, null, 2));
if (!evidenceReadable) process.exitCode = 2;
