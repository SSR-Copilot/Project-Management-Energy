/**
 * UT-GENBULK-103.. — review fix F2, finding 6: the write-plan engine does not import the Generators transport.
 * `bulkBackend.ts` keeps a registry (`registerDefaultBulkBackend`); `data/generators.ts` registers
 * `createGeneratorsBulkBackend` at module load. Each test starts from a fresh module state.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({ transportLoaded: 0, created: 0 }));
vi.mock("./generatorsBulk", () => {
  probe.transportLoaded += 1;
  return {
    createGeneratorsBulkBackend: () => {
      probe.created += 1;
      return { createMany: async () => ({ ids: [], requests: 0 }), updateMany: async () => ({ requests: 0 }) };
    },
  };
});

beforeEach(() => {
  vi.resetModules();
  probe.transportLoaded = 0;
  probe.created = 0;
});
afterEach(() => vi.resetModules());

const fake = () => ({ createMany: vi.fn(), updateMany: vi.fn() });

describe("the default bulk backend registry", () => {
  it("UT-GENBULK-103 with nothing installed and nothing registered, getBulkBackend throws the programmer error", async () => {
    const { getBulkBackend, setBulkBackend } = await import("./bulkBackend");
    setBulkBackend(null);
    expect(() => getBulkBackend()).toThrow(/^No bulk backend is installed\./);
  });

  it("UT-GENBULK-104 a registered default is created lazily, once, and kept; setBulkBackend overrides it and null restores the same instance", async () => {
    const { getBulkBackend, registerDefaultBulkBackend, setBulkBackend } = await import("./bulkBackend");
    const made = fake();
    const factory = vi.fn(() => made);
    registerDefaultBulkBackend(factory);
    expect(factory).not.toHaveBeenCalled();
    expect(getBulkBackend()).toBe(made);
    expect(getBulkBackend()).toBe(made);
    expect(factory).toHaveBeenCalledTimes(1);
    const override = fake();
    setBulkBackend(override);
    expect(getBulkBackend()).toBe(override);
    setBulkBackend(null);
    expect(getBulkBackend()).toBe(made);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("UT-GENBULK-105 registering again replaces the factory and drops the kept instance", async () => {
    const { getBulkBackend, registerDefaultBulkBackend } = await import("./bulkBackend");
    const a = fake();
    const b = fake();
    registerDefaultBulkBackend(() => a);
    expect(getBulkBackend()).toBe(a);
    registerDefaultBulkBackend(() => b);
    expect(getBulkBackend()).toBe(b);
  });

  it("UT-GENBULK-106 importing the engine (executePlan, usePlanWrite, bulkBackend) does not load the Generators transport", async () => {
    await import("./bulkBackend");
    await import("./executePlan");
    await import("./usePlanWrite");
    expect(probe.transportLoaded).toBe(0);
    // And the source says so: no import of the transport, static or dynamic, in the registry module.
    const source = readFileSync(resolve(__dirname, "bulkBackend.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["']\.\/generatorsBulk["']/);
    expect(source).not.toMatch(/import\(\s*["']\.\/generatorsBulk["']/);
  });

  it("UT-GENBULK-107 importing data/generators installs the Generators transport as the default (created lazily on the first bulk step)", async () => {
    await import("./generators");
    const { getBulkBackend } = await import("./bulkBackend");
    expect(probe.transportLoaded).toBe(1);
    expect(probe.created).toBe(0);
    const backend = getBulkBackend();
    expect(probe.created).toBe(1);
    expect(getBulkBackend()).toBe(backend);
  });
});
