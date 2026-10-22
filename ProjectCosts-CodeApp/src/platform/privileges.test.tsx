// @vitest-environment jsdom
/** E13 — useTablePrivileges. */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { ALLOW_ALL, DENY_ALL, useTablePrivileges, type PrivilegeProvider } from "./privileges";

describe("UseTablePrivileges (E13)", () => {
  it("UT-PRIV-001 Defaults to the server-enforced provider (everything allowed)", () => {
    const { result } = renderHook(() => useTablePrivileges("vsb_things"));
    expect(result.current).toMatchObject(ALLOW_ALL);
    expect(result.current.forRecord("1")).toEqual(ALLOW_ALL);
  });

  it("UT-PRIV-002 Delegates to the provider for the table and for records", () => {
    const provider: PrivilegeProvider = {
      forTable: vi.fn(() => ({ ...DENY_ALL, canRead: true })),
      forRecord: vi.fn(() => DENY_ALL),
    };
    const { result } = renderHook(() => useTablePrivileges("vsb_costs", provider));
    expect(result.current.canRead).toBe(true);
    expect(result.current.canWrite).toBe(false);
    expect(provider.forTable).toHaveBeenCalledWith("vsb_costs");
    expect(result.current.forRecord("abc")).toEqual(DENY_ALL);
    expect(provider.forRecord).toHaveBeenCalledWith("vsb_costs", "abc");
  });

  it("UT-PRIV-003 Is memoised on entitySet and provider", () => {
    const provider: PrivilegeProvider = { forTable: vi.fn(() => ALLOW_ALL), forRecord: vi.fn(() => ALLOW_ALL) };
    const { result, rerender } = renderHook(({ set }) => useTablePrivileges(set, provider), { initialProps: { set: "a" } });
    const first = result.current;
    rerender({ set: "a" });
    expect(result.current).toBe(first);
    expect(provider.forTable).toHaveBeenCalledTimes(1);
    rerender({ set: "b" });
    expect(result.current).not.toBe(first);
    expect(provider.forTable).toHaveBeenCalledTimes(2);
  });
});
