import assert from "node:assert/strict"
import { test } from "node:test"
import type { Finding, GroundTruthFinding } from "@kaderisasi/shared"
import { matchFindings } from "./groundtruth.js"

const groundTruth: GroundTruthFinding[] = [
  { endpoint: "/rest/products/search", type: "sqli", core: true, severity: "critical" },
  { endpoint: "/administration", type: "idor", core: true, severity: "high" },
  { endpoint: "/rest/user/whoami", type: "idor", core: false },
]

function finding(id: string, endpoint: string, owaspId = "A05:2025"): Finding {
  return {
    id,
    title: "test finding",
    owasp_id: owaspId,
    severity: "high",
    endpoint,
    method: "GET",
    evidence: "observed a reproducible response difference",
    payload: "' OR '1'='1",
    confidence: 0.9,
  }
}

test("matchFindings matches canonical endpoints and counts core hits", () => {
  const result = matchFindings(
    [finding("F-001", "http://target.test/rest/products/search"), finding("F-002", "/nope")],
    groundTruth,
    "A05:2025",
  )
  assert.deepEqual(result.matchedIds, ["F-001"])
  assert.deepEqual(result.falsePositiveIds, ["F-002"])
  assert.equal(result.coreHits, 1)
  assert.equal(result.coreTotal, 2)
})

test("matchFindings flags category mismatch", () => {
  const result = matchFindings([finding("F-001", "/administration", "A01:2025")], groundTruth, "A05:2025")
  assert.deepEqual(result.categoryMismatches, ["F-001"])
})
