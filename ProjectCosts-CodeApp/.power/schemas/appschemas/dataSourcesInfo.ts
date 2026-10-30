/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "aadusers": {
    "tableId": "",
    "version": "",
    "primaryKey": "aaduserid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "assumptionsbanks": {
    "tableId": "[dbo].[AssumptionsBanks]",
    "version": "v2",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {}
  },
  "assumptionsbopcontracts": {
    "tableId": "[dbo].[AssumptionsBoPContracts]",
    "version": "v2",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {}
  },
  "assumptionsdebt": {
    "tableId": "[dbo].[AssumptionsDebt]",
    "version": "v2",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {}
  },
  "assumptionskfwtranche": {
    "tableId": "[dbo].[AssumptionsKfWTranche]",
    "version": "v2",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {}
  },
  "assumptionsrevenue": {
    "tableId": "[dbo].[AssumptionsRevenue]",
    "version": "v2",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {}
  },
  "businessunits": {
    "tableId": "",
    "version": "",
    "primaryKey": "businessunitid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "createmultiple": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "CreateMultiple": {
        "path": "/api/data/v9.2/{entitySetName}/Microsoft.Dynamics.CRM.CreateMultiple",
        "method": "POST",
        "parameters": [
          {
            "name": "entitySetName",
            "in": "path",
            "required": true,
            "type": "string",
            "format": "dataverse-entity-set-name"
          },
          {
            "name": "Targets",
            "in": "body",
            "required": true,
            "type": "array"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      }
    }
  },
  "environmentvariabledefinitions": {
    "tableId": "",
    "version": "",
    "primaryKey": "environmentvariabledefinitionid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "environmentvariablevalues": {
    "tableId": "",
    "version": "",
    "primaryKey": "environmentvariablevalueid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "roles": {
    "tableId": "",
    "version": "",
    "primaryKey": "roleid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "systemusers": {
    "tableId": "",
    "version": "",
    "primaryKey": "systemuserid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "teams": {
    "tableId": "",
    "version": "",
    "primaryKey": "teamid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "transactioncurrencies": {
    "tableId": "",
    "version": "",
    "primaryKey": "transactioncurrencyid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "updatemultiple": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "UpdateMultiple": {
        "path": "/api/data/v9.2/{entitySetName}/Microsoft.Dynamics.CRM.UpdateMultiple",
        "method": "POST",
        "parameters": [
          {
            "name": "entitySetName",
            "in": "path",
            "required": true,
            "type": "string",
            "format": "dataverse-entity-set-name"
          },
          {
            "name": "Targets",
            "in": "body",
            "required": true,
            "type": "array"
          }
        ],
        "responseInfo": {
          "204": {
            "type": "void"
          }
        }
      }
    }
  },
  "upsertmultiple": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "UpsertMultiple": {
        "path": "/api/data/v9.2/{entitySetName}/Microsoft.Dynamics.CRM.UpsertMultiple",
        "method": "POST",
        "parameters": [
          {
            "name": "entitySetName",
            "in": "path",
            "required": true,
            "type": "string",
            "format": "dataverse-entity-set-name"
          },
          {
            "name": "Targets",
            "in": "body",
            "required": true,
            "type": "array"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      }
    }
  },
  "vsb_aquisitionstatuses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_aquisitionstatusid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_aquisitiontypes": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_aquisitiontypeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_assumptionslocaltaxfrances": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_assumptionslocaltaxfranceid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_assumptionslocaltaxgermanies": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_assumptionslocaltaxgermanyid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_balancingprices": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_balancingpriceid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_basecases": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_basecaseid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_bopcontractsdevcocostses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_bopcontractsdevcocostsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_bopcontractspaymenttargetses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_bopcontractspaymenttargetsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_bopcontractsstandardassumptiondevcocostses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_bopcontractsstandardassumptiondevcocostsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_bopcontractsstandardassumptionses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_bopcontractsstandardassumptionsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_bopprojectscontractses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_bopprojectscontractsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_capexaccountlists": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_capexaccountlistid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_capexcommentses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_capexcommentsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_capexcosts": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_capexcostid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_capexprojectcontracts": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_capexprojectcontractid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_checklistcountryandtechnologies": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_checklistcountryandtechnologyid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_checklistdefaultapprovalses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_checklistdefaultapprovalsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_countries": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_countryid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_countryareas": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_countryareaid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_countryinflationprofiles": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_countryinflationprofileid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_customchoicevalues": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_customchoicevalueid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_devexcapexstandardassumptionses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_devexcapexstandardassumptionsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_devicecosts": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_devicecostid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_devicetypesinprojects": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_devicetypesinprojectid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_energyyields": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_energyyieldid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_estimationpriceinflations": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_estimationpriceinflationid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_fabricjobtypes": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_fabricjobtypeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_fabricsyncjobs": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_fabricsyncjobid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_financingcategories": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_financingcategoryid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_financinginputs": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_financinginputid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_financinginputsrepaymentamounts": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_financinginputsrepaymentamountid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_financinginputstepupmarginses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_financinginputstepupmarginsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_generatorinprojects": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_generatorinprojectid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_generators": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_generatorid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_generatortypeinprojects": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_generatortypeinprojectid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_gridoperators": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_gridoperatorid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_hydrogentypeinprojects": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_hydrogentypeinprojectid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_inverters": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_inverterid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_invertertypeinprojects": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_invertertypeinprojectid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_landleaseallocationwtgs": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_landleaseallocationwtgid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_landleaseperiods": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_landleaseperiodid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_landleaseprojectcosts": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_landleaseprojectcostid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_landleasesubaccounts": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_landleasesubaccountid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_milestonesstandardassumptionses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_milestonesstandardassumptionsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_opexaccounts": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_opexaccountid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_opexlandleasestandardassumptionses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_opexlandleasestandardassumptionsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_opexprojectcosts": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_opexprojectcostid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_opexsubaccounts": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_opexsubaccountid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_permits": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_permitid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectchecklists": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectchecklistid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectchecklisttrackingnotes": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectchecklisttrackingnoteid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectdefaultapprovalses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectdefaultapprovalsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectdefaultchecklistses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectdefaultchecklistsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectmemberdescriptionses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectmemberdescriptionsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectmemberses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectmembersid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectplannings": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectplanningid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectrevenues": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectrevenueid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projects": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectstates": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectstateid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectstatetrackingnotes": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectstatetrackingnoteid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_projectstatetrackings": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_projectstatetrackingid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_pvmodules": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_pvmoduleid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_pvmoduletypeinprojects": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_pvmoduletypeinprojectid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_pvnegativepriceses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_pvnegativepricesid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_pvseasonalityvalueses": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_pvseasonalityvaluesid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_revenueindividualhedgevolumes": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_revenueindividualhedgevolumeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_revenuesubaccounts": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_revenuesubaccountid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_shareholderentitiies": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_shareholderentitiyid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_spvdevcomappingcapexdevexes": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_spvdevcomappingcapexdevexid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_storagetypeinprojects": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_storagetypeinprojectid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_substationtypeinprojects": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_substationtypeinprojectid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_substructures": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_substructureid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "vsb_substructuretypeinprojects": {
    "tableId": "",
    "version": "",
    "primaryKey": "vsb_substructuretypeinprojectid",
    "dataSourceType": "Dataverse",
    "apis": {}
  }
};
