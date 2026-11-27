import base from "../../../../ProjectCosts-CodeApp/vite.config";

const root = "c:/Personal/Code App Mordenization/Project-Management-Energy-WorkDev1-BottleneckOptimization/ProjectCosts-CodeApp";

/** Runs only the SPB throwaway bench, from outside `src/` (the app config's `include` is `src/**`). */
export default {
  ...base,
  root,
  test: {
    ...(base as { test?: object }).test,
    dir: `${root}/../ProjectDocs/bottleneck-identification/_bench/SPB`,
    include: ["**/*.bench.test.ts"],
    environment: "node",
  },
};
