import path from "node:path";
const SRC = path.resolve("c:/Personal/Code App Mordenization/Project-Management-Energy-WorkDev1-BottleneckOptimization/ProjectCosts-CodeApp/src");
export default { input: "bench.ts", platform: "node", output: { file: "bench.out.mjs", format: "esm" }, resolve: { alias: { "@": SRC } },
  transform: { define: { "import.meta.env.MODE": '"production"', "import.meta.env.DEV": "false", "import.meta.env.PROD": "true", "import.meta.env": "({MODE:'production',DEV:false,PROD:true})" } } };
