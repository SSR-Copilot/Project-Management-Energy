/**
 * The Finance tables the bulk backend (`./generatorsBulk.ts`) may write: the two schedule tables of a tranche.
 * Names are from `ProjectDocs/reference/dataverse-entities.json`, entity sets from `./dataverseNames.ts`, primary keys
 * from `.power/schemas/appschemas/dataSourcesInfo.ts`. `vsb_financinginputs` itself is NOT registered: a tranche and the
 * seeds are single creates and updates (no bulk request is used for them).
 *
 * Importing this module registers the tables (a side effect, like `./generators.ts` registering the backend).
 */
import { Vsb_financinginputsrepaymentamountsService } from "@/generated/services/Vsb_financinginputsrepaymentamountsService";
import { Vsb_financinginputstepupmarginsesService } from "@/generated/services/Vsb_financinginputstepupmarginsesService";
import { ES_FINANCE } from "./dataverseNames";
import { defineBulkTable, registerBulkTables } from "./generatorsBulk";

export const FINANCE_BULK_TABLES = Object.freeze([
  defineBulkTable(
    ES_FINANCE.financingInputsRepaymentAmounts, "vsb_financinginputsrepaymentamount",
    "vsb_financinginputsrepaymentamountid", true, Vsb_financinginputsrepaymentamountsService,
  ),
  defineBulkTable(
    ES_FINANCE.financingInputStepUpMargins, "vsb_financinginputstepupmargins",
    "vsb_financinginputstepupmarginsid", true, Vsb_financinginputstepupmarginsesService,
  ),
]);

registerBulkTables(FINANCE_BULK_TABLES);
