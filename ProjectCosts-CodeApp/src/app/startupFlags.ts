/**
 * The startup optimisations (D119), each behind a switch so the old path stays.
 *
 * Every flag set to its OLD value reproduces the behaviour before the change, so any one of them
 * can be rolled back on its own by editing this file (CONVENTIONS rule 15). Nothing here changes
 * what a screen shows or writes; it changes WHEN a read starts and how many reads there are.
 *
 * The object is mutable on purpose: unit tests flip a flag to pin both halves. App code only reads it.
 */
export const startupFlags = {
  /**
   * OLD `true`: the shell showed "Please wait..." until both environment-variable reads had
   * finished (two sequential round trips), though only the header labels and click-time launch
   * links read them. NEW `false`: the shell and the first screen do not wait for them; they fill in
   * when the read lands.
   */
  envVarsBlockFirstPaint: false,

  /**
   * OLD `false`: the screen's chunk and its first reads started only after the session, the
   * environment variables and (on Project Management routes) the project had loaded, one after the
   * other. NEW `true`: they start at once, from the URL, before React has mounted (`app/bootPrefetch.ts`).
   * The cache keys and query functions are the screens' own, so a screen that mounts later reads the
   * result, and a prefetch that fails is simply retried by the screen.
   */
  bootPrefetch: true,

  /**
   * OLD `0`: the next project page was prefetched the moment the page on screen had loaded, so its
   * two requests (about the size of the page itself) ran beside the rest of the start-up reads.
   * NEW: the prefetch waits this many milliseconds after the page is on screen. A click on Next
   * before then still works: it simply fetches the page itself, as it did without a prefetch.
   */
  nextPagePrefetchDelayMs: 1500,

  /**
   * OLD `false`: the signed-in user's lookups ran as a chain of five dependent round trips, and read
   * every role the user holds (106 rows in DEV). NEW `true`: the directory entry and the country map
   * start with the user row, the direct roles and the teams start together, and only the roles the
   * badge reads are requested, by name. `badgeScopeFromRoles` still decides what they mean.
   */
  parallelUserLookups: true,
};
