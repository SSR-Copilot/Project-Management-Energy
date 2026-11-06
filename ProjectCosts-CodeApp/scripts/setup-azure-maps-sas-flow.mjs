#!/usr/bin/env node
/**
 * Azure Maps token flow — creates or updates, in ONE environment and ONE solution, everything the General Data map needs
 * (`ProjectDocs/app-docs/18-AZURE-MAPS-IN-THE-CODE-APP.md`):
 *
 *   1. six environment variables (definition in the solution, the value as this environment's current value only, so
 *      no Azure value travels with the solution; Test / Prod get theirs at import):
 *        vsb_AzureMapsSubscriptionId · vsb_AzureMapsResourceGroup · vsb_AzureMapsAccountName · vsb_AzureMapsPrincipalId
 *        vsb_AzureMapsSasTokenHours (1–24) · vsb_AzureMapsSasMaxRatePerSecond
 *   2. the connection reference `vsb_AzureMapsSasArm` (Azure Resource Manager), bound to the service account's connection;
 *   3. the instant flow "Get Azure Maps SAS Token" (Power Apps V2 trigger, no inputs): ARM `listSas` on the Maps account,
 *      signed by its managed identity, every value read from the variables above → `sastoken`, `expiresutc`;
 *   4. turns the flow on (needs the connection reference bound).
 *
 * Idempotent: re-running updates the values, the binding and the flow definition in place. Run it signed in (az) as the
 * account that must own the flow and the connection (the service account); the Dataverse Web API runs as that account.
 *
 * Usage (from ProjectCosts-CodeApp/):
 *   node scripts/setup-azure-maps-sas-flow.mjs --org https://<org>.crm4.dynamics.com --solution <unique name>
 *     --subscription <id> --resource-group <name> --maps-account <name> --principal-id <managed identity object id>
 *     [--connection-id <shared_arm connection name>] [--token-hours 12] [--max-rate 50]
 *   Without --connection-id the reference is created unbound and the flow is left off (step 4 is skipped).
 */
import { execSync } from "node:child_process";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
};
const ORG = arg("org").replace(/\/$/, "");
const SOLUTION = arg("solution");
const CONNECTION_ID = arg("connection-id", "");
const TOKEN_HOURS = Number(arg("token-hours", "12"));
const MAX_RATE = Number(arg("max-rate", "50"));
if (!(TOKEN_HOURS >= 1 && TOKEN_HOURS <= 24)) throw new Error("--token-hours must be 1–24 (the Azure Maps SAS maximum is 24 h)");
if (!(MAX_RATE >= 1)) throw new Error("--max-rate must be a positive number");

const FLOW_NAME = "Get Azure Maps SAS Token";
const CONN_REF = "vsb_AzureMapsSasArm";
const ARM_API = "/providers/Microsoft.PowerApps/apis/shared_arm";
const STRING = 100000000;
const NUMBER = 100000001;
const VARS = [
  { schema: "vsb_AzureMapsSubscriptionId", name: "Azure Maps Subscription Id", type: STRING, value: arg("subscription"),
    description: "Azure subscription that holds the Azure Maps account (General Data map)." },
  { schema: "vsb_AzureMapsResourceGroup", name: "Azure Maps Resource Group", type: STRING, value: arg("resource-group"),
    description: "Resource group of the Azure Maps account." },
  { schema: "vsb_AzureMapsAccountName", name: "Azure Maps Account Name", type: STRING, value: arg("maps-account"),
    description: "Name of the Azure Maps account the SAS token is issued for." },
  { schema: "vsb_AzureMapsPrincipalId", name: "Azure Maps Managed Identity Principal Id", type: STRING, value: arg("principal-id"),
    description: "Object (principal) ID of the user-assigned managed identity attached to the Maps account; it signs the SAS token." },
  { schema: "vsb_AzureMapsSasTokenHours", name: "Azure Maps SAS Token Hours", type: NUMBER, value: String(TOKEN_HOURS),
    description: "Lifetime of an issued SAS token in hours (1-24). The app refreshes it 10 minutes before expiry." },
  { schema: "vsb_AzureMapsSasMaxRatePerSecond", name: "Azure Maps SAS Max Rate Per Second", type: NUMBER, value: String(MAX_RATE),
    description: "Request rate limit written into every SAS token (also caps cost)." },
];

if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(ORG)) throw new Error(`--org is not an environment URL: ${ORG}`);
const token = execSync(`az account get-access-token --resource ${ORG} --query accessToken -o tsv`, { encoding: "utf8" }).trim();
const API = `${ORG}/api/data/v9.2`;
const inSolution = { "MSCRM.SolutionUniqueName": SOLUTION };

async function call(method, path, body, headers = {}) {
  const r = await fetch(`${API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json",
      "OData-Version": "4.0", "OData-MaxVersion": "4.0", ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text}`);
  const id = r.headers.get("OData-EntityId")?.match(/\(([0-9a-f-]{36})\)/)?.[1];
  return { json: text ? JSON.parse(text) : null, id };
}
const first = async (path) => (await call("GET", path)).json.value[0] ?? null;

const who = (await call("GET", "WhoAmI")).json;
const me = await first(`systemusers?$select=domainname&$filter=systemuserid eq ${who.UserId}`);
console.log(`signed in as ${me?.domainname ?? who.UserId}`);
if (!(await first(`solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION}'`))) throw new Error(`solution ${SOLUTION} not found`);

// 1. Environment variables
for (const v of VARS) {
  let def = await first(`environmentvariabledefinitions?$select=environmentvariabledefinitionid&$filter=schemaname eq '${v.schema}'`);
  if (!def) {
    const { id } = await call("POST", "environmentvariabledefinitions", {
      schemaname: v.schema, displayname: v.name, type: v.type, description: v.description,
    }, inSolution);
    def = { environmentvariabledefinitionid: id };
    console.log(`variable ${v.schema} created`);
  } else {
    console.log(`variable ${v.schema} exists`);
  }
  const defId = def.environmentvariabledefinitionid;
  const val = await first(`environmentvariablevalues?$select=environmentvariablevalueid&$filter=_environmentvariabledefinitionid_value eq ${defId}`);
  // The value is created WITHOUT the solution header: it stays this environment's current value and is not exported.
  if (val) await call("PATCH", `environmentvariablevalues(${val.environmentvariablevalueid})`, { value: v.value });
  else await call("POST", "environmentvariablevalues", {
    schemaname: `${v.schema}_value`, value: v.value,
    "EnvironmentVariableDefinitionId@odata.bind": `/environmentvariabledefinitions(${defId})`,
  });
}

// 2. Connection reference (the service account's ARM connection; app users need no Azure rights)
let ref = await first(`connectionreferences?$select=connectionreferenceid,connectionid&$filter=connectionreferencelogicalname eq '${CONN_REF}'`);
if (!ref) {
  const { id } = await call("POST", "connectionreferences", {
    connectionreferencelogicalname: CONN_REF, connectionreferencedisplayname: "Azure Maps SAS (ARM)",
    description: "Azure Resource Manager connection of the flow service account, used by Get Azure Maps SAS Token (listSas).",
    connectorid: ARM_API, ...(CONNECTION_ID ? { connectionid: CONNECTION_ID } : {}),
  }, inSolution);
  console.log(`connection reference ${CONN_REF} created: ${id}${CONNECTION_ID ? "" : " (unbound)"}`);
} else {
  if (CONNECTION_ID && ref.connectionid !== CONNECTION_ID) await call("PATCH", `connectionreferences(${ref.connectionreferenceid})`, { connectionid: CONNECTION_ID });
  console.log(`connection reference ${CONN_REF} exists`);
}

// 3. Flow: Power Apps (V2) trigger → listSas (managed identity signs) → respond { sastoken, expiresutc }
const param = (schema) => `${schema} (${schema})`;
const p = (schema) => `parameters('${param(schema)}')`;
const parameters = {
  $connections: { defaultValue: {}, type: "Object" },
  $authentication: { defaultValue: {}, type: "SecureObject" },
};
for (const v of VARS) {
  parameters[param(v.schema)] = {
    defaultValue: v.type === NUMBER ? 0 : "", type: v.type === NUMBER ? "Float" : "String",
    metadata: { schemaName: v.schema, description: v.description },
  };
}
// Both responses share one schema (Power Apps reads the outputs from it): a token, or an error code and message.
const OUTPUT = (name) => ({ title: name, "x-ms-dynamically-added": true, type: "string" });
const OUTPUTS_SCHEMA = {
  type: "object",
  properties: { sastoken: OUTPUT("sastoken"), expiresutc: OUTPUT("expiresutc"), errorcode: OUTPUT("errorcode"), errormessage: OUTPUT("errormessage") },
};
// The first step that did not succeed: its ARM error (e.g. AuthorizationFailed), else the run error (InvalidTemplate for a
// bad variable, ActionTimedOut), else its status code.
const FIRST = "first(body('Failed_steps'))";
const ERROR_CODE = `coalesce(${FIRST}?['outputs']?['body']?['error']?['code'], ${FIRST}?['error']?['code'], ${FIRST}?['code'], 'Unknown')`;
const ERROR_MESSAGE = `coalesce(${FIRST}?['outputs']?['body']?['error']?['message'], ${FIRST}?['outputs']?['body']?['message'], ${FIRST}?['error']?['message'], 'The token step failed.')`;
const INVOKE = {
      type: "OpenApiConnection",
      runAfter: { Expiry: ["Succeeded"] },
      inputs: {
        host: { connectionName: "shared_arm", operationId: "Resources_Invoke", apiId: ARM_API },
        parameters: {
          subscriptionId: `@${p("vsb_AzureMapsSubscriptionId")}`,
          resourceGroupName: `@${p("vsb_AzureMapsResourceGroup")}`,
          resourceProviderNamespace: "Microsoft.Maps",
          shortResourceId: `accounts/@{${p("vsb_AzureMapsAccountName")}}`,
          "x-ms-api-version": "2023-06-01",
          actionName: "listSas",
          body: {
            signingKey: "managedIdentity",
            principalId: `@${p("vsb_AzureMapsPrincipalId")}`,
            maxRatePerSecond: `@int(string(${p("vsb_AzureMapsSasMaxRatePerSecond")}))`,
            start: "@{addMinutes(utcNow(), -5)}",
            expiry: "@{outputs('Expiry')}",
          },
        },
        authentication: "@parameters('$authentication')",
      },
};
const definition = {
  $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  contentVersion: "1.0.0.0",
  parameters,
  triggers: {
    manual: { type: "Request", kind: "PowerAppV2", inputs: { schema: { type: "object", properties: {}, required: [] } } },
  },
  actions: {
    // The token steps run in a scope, so ONE failure branch catches any of them (a bad variable value, ARM 403/404, a
    // timeout) and still answers the app at once; without it the app waited for a response that never came (502).
    Get_token: {
      type: "Scope",
      runAfter: {},
      actions: {
        // Number variables arrive as Float; `int()` is reliable on a string, so they go through `string()` first.
        Expiry: { type: "Compose", inputs: `@addHours(utcNow(), int(string(${p("vsb_AzureMapsSasTokenHours")})))`, runAfter: {} },
        Invoke_resource_operation: INVOKE,
      },
    },
    Respond_token: {
      type: "Response", kind: "PowerApp",
      runAfter: { Get_token: ["Succeeded"] },
      inputs: {
        statusCode: 200,
        body: {
          sastoken: "@{body('Invoke_resource_operation')?['accountSasToken']}", expiresutc: "@{outputs('Expiry')}",
          errorcode: "", errormessage: "",
        },
        schema: OUTPUTS_SCHEMA,
      },
    },
    // The scope's own result names the step that failed, even when it never ran Azure (no reference to a skipped action).
    Failed_steps: {
      type: "Query",
      runAfter: { Get_token: ["Failed", "TimedOut"] },
      inputs: {
        from: "@result('Get_token')",
        where: "@and(not(equals(item()?['status'], 'Succeeded')), not(equals(item()?['status'], 'Skipped')))",
      },
    },
    Respond_error: {
      type: "Response", kind: "PowerApp",
      runAfter: { Failed_steps: ["Succeeded"] },
      inputs: { statusCode: 200, body: { sastoken: "", expiresutc: "", errorcode: `@{${ERROR_CODE}}`, errormessage: `@{${ERROR_MESSAGE}}` }, schema: OUTPUTS_SCHEMA },
    },
    // After answering, the run still ends as Failed with the cause, so the run history and alerts show it.
    Terminate_failed: {
      type: "Terminate",
      runAfter: { Respond_error: ["Succeeded", "Failed"] },
      inputs: { runStatus: "Failed", runError: { code: `@{${ERROR_CODE}}`, message: `@{${ERROR_MESSAGE}}` } },
    },
  },
};
const clientdata = JSON.stringify({
  properties: {
    connectionReferences: {
      shared_arm: { runtimeSource: "embedded", connection: { connectionReferenceLogicalName: CONN_REF }, api: { name: "shared_arm" } },
    },
    definition,
  },
  schemaVersion: "1.0.0.0",
});

let flow = await first(`workflows?$select=workflowid,statecode&$filter=name eq '${FLOW_NAME}' and category eq 5`);
if (!flow) {
  const { id } = await call("POST", "workflows", {
    name: FLOW_NAME, category: 5, type: 1, primaryentity: "none",
    description: "Returns a short-lived, read-only Azure Maps SAS token for the code app's General Data map. Values: vsb_AzureMaps* environment variables.",
    clientdata,
  }, inSolution);
  flow = { workflowid: id, statecode: 0 };
  console.log(`flow created: ${id}`);
} else {
  if (flow.statecode === 1) await call("PATCH", `workflows(${flow.workflowid})`, { statecode: 0, statuscode: 1 });
  await call("PATCH", `workflows(${flow.workflowid})`, { clientdata });
  console.log(`flow exists, definition updated: ${flow.workflowid}`);
}

// 4. Turn on (only with a bound connection)
if (CONNECTION_ID) {
  await call("PATCH", `workflows(${flow.workflowid})`, { statecode: 1, statuscode: 2 });
  const state = (await call("GET", `workflows(${flow.workflowid})?$select=statecode,statuscode`)).json;
  console.log(`flow state: ${state.statecode === 1 ? "On" : "Off"} (statuscode ${state.statuscode})`);
} else {
  console.log("flow left Off: re-run with --connection-id once the ARM connection exists");
}
console.log(`FLOW_ID=${flow.workflowid}`);
