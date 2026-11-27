import { ES, ES_ADMIN } from "./dataverseNames";
import type { BulkTableInfo } from "./bulkTypes";

export const CAPEX_CONTRACTS: BulkTableInfo = {
  entitySetName: ES.capexProjectContracts,
  logicalName: "vsb_capexprojectcontract",
  primaryKey: "vsb_capexprojectcontractid",
};

export const CAPEX_COSTS: BulkTableInfo = {
  entitySetName: ES_ADMIN.capexCosts,
  logicalName: "vsb_capexcost",
  primaryKey: "vsb_capexcostid",
};

