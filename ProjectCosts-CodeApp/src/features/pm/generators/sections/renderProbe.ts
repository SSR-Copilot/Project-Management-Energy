/**
 * Test seam (D143, UT-GENPERF-3xx): each memoized section reports when it renders, so a test can prove that one family's update
 * does not re-render the others. The probe itself moved to `platform/renderProbe.ts` (D162) so every screen can use it; the
 * names here stay for the existing Generators tests.
 */
export { renderProbe as sectionRenderProbe, probeRender } from "@/platform/renderProbe";
