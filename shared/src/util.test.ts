import assert from "node:assert/strict"
import { test } from "node:test"
import { canonicalEndpoint, mean, sanitizeModel, seededRandom, shuffle, standardDeviation } from "./util.js"

test("sanitizeModel normalizes provider/model strings", () => {
  assert.equal(sanitizeModel("qwen2.5-coder:3b"), "qwen2.5-coder-3b")
  assert.equal(sanitizeModel("llama3.2:3b"), "llama3.2-3b")
})

test("canonicalEndpoint normalizes URLs and paths", () => {
  assert.equal(canonicalEndpoint("http://example.test/rest/products/search/"), "/rest/products/search")
  assert.equal(canonicalEndpoint("/REST//Products"), "/rest/products")
  assert.equal(canonicalEndpoint("/"), "/")
})

test("shuffle is deterministic for a seed", () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8]
  assert.deepEqual(shuffle(input, 42), shuffle(input, 42))
  assert.deepEqual([...shuffle(input, 42)].sort(), input)
})

test("seededRandom is repeatable", () => {
  const a = seededRandom(7)
  const b = seededRandom(7)
  assert.equal(a(), b())
  assert.equal(a(), b())
})

test("mean and standardDeviation", () => {
  assert.equal(mean([2, 4, 6]), 4)
  assert.equal(standardDeviation([2, 4, 6]), 2)
  assert.equal(standardDeviation([5]), 0)
})
