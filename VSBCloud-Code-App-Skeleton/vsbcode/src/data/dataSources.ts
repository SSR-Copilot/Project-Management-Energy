/**
 * Data-source descriptor handed to `getClient(dataSourcesInfo)`.
 *
 * IN A REAL DEPLOYMENT this file is GENERATED. Run, once per table:
 *
 *     pac code add-data-source -a dataverse -t vsb_project
 *
 * which writes the descriptor and a typed model into the project. The hand-written map
 * below covers the tables the 23 screens touch so the app compiles and runs before the
 * environment is attached; regenerate it against the real environment before go-live and
 * delete this notice.
 */
/** The SDK does not re-export DataSourcesInfo from a public entry point, so it is
 * mirrored here. Shape from
 * @microsoft/power-apps/dist/internal/data/core/types/index.d.ts */
interface IApiParameter {
  name: string;
  in: string;
  required: boolean;
  type: string;
  format?: string;
}
interface IApiDefinition {
  path: string;
  method: string;
  parameters: IApiParameter[];
}
export interface IDataSourceInfo {
  tableId: string;
  version?: string;
  primaryKey?: string;
  dataSourceType?: string;
  apis: Record<string, IApiDefinition>;
}
export type DataSourcesInfo = Record<string, IDataSourceInfo>;
import { ES } from "./entities";

/** Standard Dataverse Web API verbs for one table. */
const idParam: IApiParameter = { name: "id", in: "path", required: true, type: "string", format: "guid" };

function dataverseApis(entitySet: string): Record<string, IApiDefinition> {
  return {
    retrieveMultiple: { path: `/${entitySet}`, method: "GET", parameters: [] },
    retrieve: { path: `/${entitySet}({id})`, method: "GET", parameters: [idParam] },
    create: { path: `/${entitySet}`, method: "POST", parameters: [] },
    update: { path: `/${entitySet}({id})`, method: "PATCH", parameters: [idParam] },
    delete: { path: `/${entitySet}({id})`, method: "DELETE", parameters: [idParam] },
  };
}

/** Primary key column for each entity set, by convention `<logicalname>id`. */
const PRIMARY_KEYS: Partial<Record<string, string>> = {
  [ES.projects]: "vsb_projectid",
  [ES.countries]: "vsb_countryid",
  [ES.clusterStates]: "vsb_clusterstateid",
  [ES.users]: "systemuserid",
  [ES.teams]: "teamid",
  [ES.roles]: "roleid",
  [ES.environmentVariableValues]: "environmentvariablevalueid",
  [ES.environmentVariableDefinitions]: "environmentvariabledefinitionid",
};

export const dataSources: DataSourcesInfo = Object.fromEntries(
  Object.values(ES).map((entitySet) => [
    entitySet,
    {
      tableId: entitySet,
      dataSourceType: "dataverse",
      primaryKey: PRIMARY_KEYS[entitySet] ?? `${entitySet.replace(/s$/, "")}id`,
      apis: dataverseApis(entitySet),
    },
  ]),
) as DataSourcesInfo;
