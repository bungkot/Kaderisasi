import { canonicalEndpoint } from "@kaderisasi/shared"
import type { Finding, GroundTruthFinding } from "@kaderisasi/shared"

export interface FindingMatch {
  matchedIds: string[]
  falsePositiveIds: string[]
  categoryMismatches: string[]
  coreHits: number
  coreTotal: number
  auxHits: number
  auxTotal: number
  endpointHits: number
  endpointTotal: number
}

function key(endpoint: string): string {
  return canonicalEndpoint(endpoint)
}

export function matchFindings(
  findings: Finding[],
  groundTruth: GroundTruthFinding[],
  owaspId: string,
): FindingMatch {
  const gtByKey = new Map<string, GroundTruthFinding>()
  for (const item of groundTruth) gtByKey.set(key(item.endpoint), item)

  const hitKeys = new Set<string>()
  const matchedIds: string[] = []
  const falsePositiveIds: string[] = []
  const categoryMismatches: string[] = []

  for (const finding of findings) {
    const findingKey = key(finding.endpoint)
    if (gtByKey.has(findingKey)) {
      hitKeys.add(findingKey)
      matchedIds.push(finding.id)
    } else {
      falsePositiveIds.push(finding.id)
    }
    if (finding.owasp_id.trim().toUpperCase() !== owaspId.trim().toUpperCase()) {
      categoryMismatches.push(finding.id)
    }
  }

  const core = groundTruth.filter((item) => item.core)
  const aux = groundTruth.filter((item) => !item.core)

  return {
    matchedIds,
    falsePositiveIds,
    categoryMismatches,
    coreHits: core.filter((item) => hitKeys.has(key(item.endpoint))).length,
    coreTotal: core.length,
    auxHits: aux.filter((item) => hitKeys.has(key(item.endpoint))).length,
    auxTotal: aux.length,
    endpointHits: hitKeys.size,
    endpointTotal: gtByKey.size,
  }
}
