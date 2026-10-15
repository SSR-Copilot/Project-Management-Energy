// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import type { ProjectPage, ProjectPageRequest } from "@/data/projects";

/**
 * `useProjectPage` hands the page the server actually served back to its caller when it differs
 * from the page the URL asked for (the server resets an out-of-range page to 1), and the
 * criteria controller can rewrite the URL page WITHOUT adding a history entry.
 */
const loadProjectPage = vi.fn<(req: ProjectPageRequest) => Promise<ProjectPage>>();

vi.mock("@/data/projects", () => ({
  loadProjectPage: (req: ProjectPageRequest) => loadProjectPage(req),
  deleteProject: vi.fn(),
  listCountries: vi.fn(),
  listCountryAreas: vi.fn(),
  listProjectStates: vi.fn(),
  loadProjectStateOrder: vi.fn(),
  searchProjectManagers: vi.fn(),
}));

const { useCriteria, useProjectPage } = await import("./hooks");

const served = (page: number, hasNext = false): ProjectPage => ({
  rows: [], totalRows: 25, totalPages: 3, page, pageSize: 10, hasNext,
});

const onCorrected = vi.fn<(page: number) => void>();

function Probe({ normalise }: { normalise: boolean }) {
  const { criteria, setPage } = useCriteria();
  const location = useLocation();
  const navType = useNavigationType();
  const q = useProjectPage({
    criteria,
    ...(normalise
      ? {
        onPageCorrected: (p: number) => {
          onCorrected(p);
          setPage(p, { replace: true });
        },
      }
      : {}),
  });
  return (
    <div>
      <span data-testid="url-page">{criteria.page}</span>
      <span data-testid="served-page">{q.data?.page ?? "none"}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="nav">{navType}</span>
      <button onClick={() => setPage(2)}>go2</button>
    </div>
  );
}

function mount(search: string, normalise = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/${search}`]}>
        <Probe normalise={normalise} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  loadProjectPage.mockReset();
  onCorrected.mockReset();
});

describe("useProjectPage — out-of-range page normalisation", () => {
  it("UT-PROJPAGE-032 rewrites the URL page to the served page, by REPLACE, exactly once", async () => {
    // Whatever page is asked for, the server answers page 1 for 99 (and a real page 1 for 1).
    loadProjectPage.mockImplementation(async (req) => served(req.page > 3 ? 1 : req.page));
    mount("?p=99");

    await waitFor(() => expect(screen.getByTestId("url-page").textContent).toBe("1"));
    expect(screen.getByTestId("served-page").textContent).toBe("1");
    expect(screen.getByTestId("nav").textContent).toBe("REPLACE");
    expect(screen.getByTestId("search").textContent).toBe("");
    expect(onCorrected).toHaveBeenCalledTimes(1);
    expect(onCorrected).toHaveBeenCalledWith(1);
  });

  it("UT-PROJPAGE-033 does not fire when the served page is the requested page", async () => {
    loadProjectPage.mockImplementation(async (req) => served(req.page, true));
    mount("?p=2");

    await waitFor(() => expect(screen.getByTestId("served-page").textContent).toBe("2"));
    expect(onCorrected).not.toHaveBeenCalled();
    expect(screen.getByTestId("url-page").textContent).toBe("2");
  });

  it("UT-PROJPAGE-034 without a callback an out-of-range page is left alone (no loop, no throw)", async () => {
    loadProjectPage.mockImplementation(async () => served(1));
    mount("?p=99", false);

    await waitFor(() => expect(screen.getByTestId("served-page").textContent).toBe("1"));
    expect(screen.getByTestId("url-page").textContent).toBe("99");
    expect(onCorrected).not.toHaveBeenCalled();
  });

  it("UT-PROJPAGE-035 a callback that does not navigate is still called only once per mismatch", async () => {
    loadProjectPage.mockImplementation(async () => served(1));
    const spy = vi.fn<(p: number) => void>();
    function Inert() {
      const { criteria } = useCriteria();
      useProjectPage({ criteria, onPageCorrected: (p) => spy(p) });
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/?p=50"]}><Inert /></MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/?p=50"]}><Inert /></MemoryRouter>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(1);
  });

  it("UT-PROJPAGE-036 setPage still PUSHES by default (existing behaviour preserved)", async () => {
    loadProjectPage.mockImplementation(async (req) => served(req.page, true));
    mount("?p=1");
    await waitFor(() => expect(screen.getByTestId("served-page").textContent).toBe("1"));
    screen.getByText("go2").click();
    await waitFor(() => expect(screen.getByTestId("url-page").textContent).toBe("2"));
    expect(screen.getByTestId("nav").textContent).toBe("PUSH");
  });
});
