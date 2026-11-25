// @vitest-environment jsdom
/**
 * `ProjectMap` holds the Azure Maps token's background refresh only while it is mounted (D162 B4, FE-P1-05): its create
 * effect calls `retainAzureMapsToken`, its cleanup the release. The SDK needs WebGL, which jsdom lacks, so a minimal
 * stand-in of `azure-maps-control` is used.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const token = vi.hoisted(() => {
  const release = vi.fn();
  return { release, retain: vi.fn(() => release) };
});
vi.mock("@/platform/azureMapsToken", () => ({
  azureMapsToken: vi.fn(async () => "token"), invalidateAzureMapsToken: vi.fn(), mapErrorKind: vi.fn(() => "unknown"),
  retainAzureMapsToken: token.retain,
}));
vi.mock("azure-maps-control/dist/atlas.min.css", () => ({}));
vi.mock("azure-maps-control", () => {
  class Map {
    events = { add: vi.fn() };
    dispose = vi.fn();
    getCamera = () => ({ bounds: null });
    setCamera = vi.fn();
  }
  return { Map, AuthenticationType: { sas: "sas" } };
});

import ProjectMap from "./ProjectMap";

afterEach(() => { cleanup(); token.retain.mockClear(); token.release.mockClear(); });

describe("UT-GDATA-FE ProjectMap and the token refresh (D162 B4, FE-P1-05)", () => {
  it("UT-GDATA-FE-004 the map holds the token refresh while mounted and lets it go when unmounted", () => {
    const { unmount } = render(
      <ProjectMap pin={{ lat: 51.28, lng: 13.71 }} label="Wirmighausen" device={null} language="en-US" disabled={false} onPick={() => {}} />,
    );
    expect(token.retain).toHaveBeenCalledTimes(1);
    expect(token.release).not.toHaveBeenCalled();
    unmount();
    expect(token.release).toHaveBeenCalledTimes(1);
  });
});
