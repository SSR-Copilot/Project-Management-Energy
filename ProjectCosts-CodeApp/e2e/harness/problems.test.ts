/**
 * UT-PHPROB: `lib/ui.ts` benignFailure, the smoke layer's rule for a request that failed at network level: the host's own
 * (reported, not a failure) against the app's (a failure). The rules are narrow on purpose: a rule that matched an app
 * request would hide a real defect.
 */
import { describe, expect, it } from "vitest";
import { benignFailure } from "../lib/ui";

describe("benignFailure", () => {
  it("UT-PHPROB-001 a player resource aborted by the player's navigation is the host's (D80 run 16)", () => {
    expect(benignFailure("GET https://content.powerapps.com/resource/webplayerbus/hashedresources/52osl8gs3eer9/js/es6.webplayer-host-ui.js net::ERR_ABORTED"))
      .toMatch(/cancelled by the player's own navigation/);
    expect(benignFailure("GET https://config.fp.measure.office.com/collect/v1 net::ERR_CERT_COMMON_NAME_INVALID"))
      .toMatch(/Office telemetry/);
  });

  it("UT-PHPROB-002 an app request, aborted or not, and a player resource that failed otherwise still count as failures", () => {
    expect(benignFailure("GET http://localhost:3000/src/features/cost/periods/LandLeaseScreen.tsx net::ERR_ABORTED")).toBeNull();
    expect(benignFailure("POST https://vsbclouddev.crm4.dynamics.com/api/data/v9.2/vsb_landleaseperiods net::ERR_ABORTED")).toBeNull();
    expect(benignFailure("GET https://content.powerapps.com/resource/webplayerbus/js/x.js net::ERR_CONNECTION_RESET")).toBeNull();
    expect(benignFailure("GET https://content.powerapps.com.evil.example/x.js net::ERR_ABORTED")).toBeNull();
  });
});
