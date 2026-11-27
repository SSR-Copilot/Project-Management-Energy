import base from "../../../../ProjectCosts-CodeApp/vite.config";
const cfg = base as unknown as { test: Record<string, unknown> } & Record<string, unknown>;
export default {
  ...cfg,
  test: { ...cfg.test, include: ["../ProjectDocs/bottleneck-identification/_bench/MEM/mem.leak.test.tsx", "../ProjectDocs/bottleneck-identification/_bench/MEM/mem.heap.test.ts", "../ProjectDocs/bottleneck-identification/_bench/MEM/mem.heap.dom.test.tsx", "../ProjectDocs/bottleneck-identification/_bench/MEM/mem.sharing.test.ts"] },
};
