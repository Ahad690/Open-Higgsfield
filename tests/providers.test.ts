import { randomUUID } from "node:crypto"

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import {
  clearDatabase,
  createUser,
  installFakeHiggsfield,
  setupEnv,
  startDatabase,
  stopDatabase,
  type FakeHiggsfield,
} from "./support/harness"

setupEnv()

const providers = await import("@/lib/providers")
const { higgsfieldProvider } = await import("@/lib/providers/higgsfield")
const { canonicalStatus, isTerminalStatus, TERMINAL_STATUSES } = await import(
  "@/lib/providers/status"
)
const { submitGeneration } = await import("@/lib/generations/submit")
const { finalizeGeneration } = await import("@/lib/generations/finalize")
const { collections } = await import("@/lib/db/collections")
const { findModel } = await import("@/generation/catalog")

let fake: FakeHiggsfield

beforeAll(startDatabase, 120_000)
afterAll(stopDatabase)
beforeEach(async () => {
  await clearDatabase()
  fake = await installFakeHiggsfield()
  vi.stubGlobal("fetch", fake.fetch)
})

const image = (overrides: Record<string, unknown> = {}) => ({
  submitKey: randomUUID(),
  modelId: "soul-2",
  prompt: "Editorial portrait in soft daylight",
  settings: { batchSize: "1", resolution: "720p" },
  media: [],
  ...overrides,
})

async function generationById(id: string) {
  const { generations } = await collections()
  const { ObjectId } = await import("mongodb")
  return generations.findOne({ _id: new ObjectId(id) })
}

describe("provider registry", () => {
  it("defaults to the Higgsfield API for entries that don't name one", () => {
    expect(providers.providerFor({ id: "soul-2" }).id).toBe("higgsfield")
    expect(providers.providerForGeneration({}).id).toBe("higgsfield")
    expect(providers.primaryProvider().id).toBe("higgsfield")
  })

  it("resolves an entry's apiProvider, which is separate from its producer", () => {
    const model = findModel("seedance-2")!
    // The catalog's `provider` stays the model's producer...
    expect(model.provider).toBe("ByteDance")
    // ...while delivery defaults to the registered API, not the producer.
    expect(providers.providerFor(model).id).toBe("higgsfield")
    expect(
      providers.providerFor({ id: "soul-2", apiProvider: "higgsfield" }).id
    ).toBe("higgsfield")
  })

  it("refuses unknown providers instead of falling back to another one", () => {
    expect(() => providers.providerById("ghost")).toThrow(
      providers.UnknownProviderError
    )
    expect(() =>
      providers.providerFor({ id: "soul-2", apiProvider: "ghost" as never })
    ).toThrow(providers.UnknownProviderError)
    expect(() =>
      providers.providerForGeneration({ providerId: "ghost" })
    ).toThrow(providers.UnknownProviderError)
  })

  it("reads the neutral request id, falling back to the legacy field", () => {
    expect(providers.providerRequestIdOf({})).toBeUndefined()
    expect(providers.providerRequestIdOf({ hfRequestId: "legacy" })).toBe(
      "legacy"
    )
    expect(
      providers.providerRequestIdOf({
        providerRequestId: "neutral",
        hfRequestId: "legacy",
      })
    ).toBe("neutral")
  })
})

describe("canonical statuses", () => {
  it("maps unambiguous provider vocabulary onto our states", () => {
    expect(canonicalStatus("PENDING")).toBe("queued")
    expect(canonicalStatus("running")).toBe("in_progress")
    expect(canonicalStatus("succeeded")).toBe("completed")
    expect(canonicalStatus("CANCELLED")).toBe("canceled")
    expect(canonicalStatus("nsfw")).toBe("nsfw")
  })

  it("passes states it cannot map through, and never calls them terminal", () => {
    expect(canonicalStatus("Rejected")).toBe("rejected")
    expect(isTerminalStatus("rejected")).toBe(false)
    for (const status of ["completed", "failed", "nsfw", "canceled"]) {
      expect(isTerminalStatus(status)).toBe(true)
      expect(TERMINAL_STATUSES.has(status)).toBe(true)
    }
  })
})

describe("Higgsfield adapter", () => {
  it("declares only the operations the API really has", () => {
    expect(higgsfieldProvider.capabilities).toEqual(
      new Set(["submit", "status", "cancel", "upload", "estimate"])
    )
    expect(typeof higgsfieldProvider.submit).toBe("function")
    expect(typeof higgsfieldProvider.status).toBe("function")
    expect(typeof higgsfieldProvider.cancel).toBe("function")
    expect(typeof higgsfieldProvider.createUpload).toBe("function")
    expect(typeof higgsfieldProvider.estimate).toBe("function")
  })

  it("submits through the existing client and builds this API's callback URL", async () => {
    const generationId = "64b000000000000000000001"
    const job = await higgsfieldProvider.submit({
      path: "higgsfield-ai/soul/v2/standard",
      body: { prompt: "hello" },
      generationId,
    })
    expect(job.providerId).toBe("higgsfield")
    expect(job.status).toBe("queued")
    expect(fake.submits).toHaveLength(1)
    expect(fake.submits[0]!.path).toBe("higgsfield-ai/soul/v2/standard")
    // The callback URL is provider-specific: generation id + HMAC token.
    expect(fake.submits[0]!.webhook).toContain(
      `https://vireo.test/api/webhooks/higgsfield?gid=${generationId}`
    )
    expect(fake.submits[0]!.webhook).toMatch(/[?&]t=[a-f0-9]{64}/)
  })

  it("normalises status responses without dropping artifacts", async () => {
    const job = await higgsfieldProvider.submit({
      path: "higgsfield-ai/soul/v2/standard",
      body: {},
      generationId: "64b000000000000000000002",
    })
    fake.complete(job.requestId, "image", 2)
    const status = await higgsfieldProvider.status(job.requestId)
    expect(status.status).toBe("completed")
    expect(status.requestId).toBe(job.requestId)
    expect(status.artifacts).toHaveLength(2)
    expect(status.artifacts[0]!.kind).toBe("image")
  })
})

describe("provider-neutral generation records", () => {
  it("stores providerId, a neutral request id and the Higgsfield mirror", async () => {
    const user = await createUser({ topup: 100 })
    const view = await submitGeneration(user, image())
    const doc = await generationById(view.id)
    expect(doc!.providerId).toBe("higgsfield")
    expect(doc!.providerRequestId).toBe(doc!.hfRequestId)
    expect(providers.providerRequestIdOf(doc!)).toBe(doc!.providerRequestId)
  })

  it("still finalises a job that only has the legacy hfRequestId", async () => {
    const user = await createUser({ topup: 100 })
    const view = await submitGeneration(user, image())
    const requestId = (await generationById(view.id))!.hfRequestId!
    const { generations } = await collections()
    const { ObjectId } = await import("mongodb")
    await generations.updateOne(
      { _id: new ObjectId(view.id) },
      {
        $unset: { providerId: "", providerRequestId: "" },
        $set: { status: "queued" },
      }
    )
    fake.complete(requestId, "image")
    expect(await finalizeGeneration(new ObjectId(view.id))).toBe("completed")
    const doc = await generationById(view.id)
    expect(doc!.status).toBe("completed")
    expect(doc!.outputs[0]!.kind).toBe("image")
  })

  it("fails loudly for a stored job whose provider is gone, without refunding", async () => {
    const user = await createUser({ topup: 100 })
    const view = await submitGeneration(user, image())
    const { generations } = await collections()
    const { ObjectId } = await import("mongodb")
    await generations.updateOne(
      { _id: new ObjectId(view.id) },
      { $set: { providerId: "ghost" as never } }
    )
    await expect(finalizeGeneration(new ObjectId(view.id))).rejects.toThrow(
      providers.UnknownProviderError
    )
    const doc = await generationById(view.id)
    expect(doc!.status).not.toBe("completed")
    const { users } = await collections()
    // 18 credits charged at submit, none refunded by the failed finalize.
    expect((await users.findOne({ _id: user.objectId }))!.credits).toEqual({
      subscription: 0,
      topup: 82,
    })
  })
})

describe("job identity index", () => {
  async function insertPlaceholder(suffix: string) {
    const { generations } = await collections()
    const { ObjectId } = await import("mongodb")
    return generations.insertOne({
      _id: new ObjectId(),
      userId: new ObjectId(),
      submitKey: randomUUID(),
      surface: "image",
      modelId: "soul-2",
      modelLabel: "Soul 2",
      modelPath: "higgsfield-ai/soul/v2/standard",
      requestBody: {},
      prompt: suffix,
      settings: {},
      media: [],
      status: "pending_submit",
      cost: 0,
      costSplit: { subscription: 0, topup: 0 },
      refunded: 0,
      priceUsd: 0,
      outputs: [],
      aspect: 1,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      finalizeAttempts: 0,
    } as never)
  }

  it("allows many pending jobs but rejects a duplicated provider job id", async () => {
    await insertPlaceholder("a")
    await insertPlaceholder("b")
    const { generations } = await collections()
    await generations.updateOne(
      { prompt: "a" },
      { $set: { providerId: "higgsfield", providerRequestId: "same-id" } }
    )
    await expect(
      generations.updateOne(
        { prompt: "b" },
        { $set: { providerId: "higgsfield", providerRequestId: "same-id" } }
      )
    ).rejects.toThrow()
    expect(
      await generations.countDocuments({ providerRequestId: "same-id" })
    ).toBe(1)
  })
})
