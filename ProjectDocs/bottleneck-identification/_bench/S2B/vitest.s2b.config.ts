import base from "../../../../ProjectCosts-CodeApp/vite.config";

const root = "c:/Personal/Code App Mordenization/Project-Management-Energy-WorkDev1-BottleneckOptimization/ProjectCosts-CodeApp";

/** Runs only the S2B throwaway bench, from outside `src/` (the app config's `include` is `src/**`). */
export default {
  ...base,
  root,
  test: {
    ...(base as { test?: object }).test,
    dir: `${root}/../ProjectDocs/bottleneck-identification/_bench/S2B`,
    include: ["**/*.bench.test.ts"],
    environment: "node",
  },
};
