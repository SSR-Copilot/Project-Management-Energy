import path from "node:path";
const app = "C:/Personal/Code App Mordenization/Project-Management-Energy-WorkDev1-BottleneckOptimization/ProjectCosts-CodeApp";
export default {
  root: app,
  resolve: { alias: { "@": path.join(app, "src") } },
  test: {
    pool: "threads", environment: "node", globals: true,
    include: ["../ProjectDocs/bottleneck-identification/_bench/SCC/*.bench.mts"],
  },
};
