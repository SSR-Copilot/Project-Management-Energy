/* eslint-disable
  @typescript-eslint/no-redundant-type-constituents,
  @typescript-eslint/no-empty-function,
  @typescript-eslint/prefer-nullish-coalescing,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-return,
  @typescript-eslint/no-unsafe-argument,
  @typescript-eslint/consistent-indexed-object-style,
  @typescript-eslint/prefer-regexp-exec
*/


import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { SpreadSheetComp, ISpreadSheetProps } from "./SpreadSheet";

import { dataSetToSingleObjectArray } from "./util_datset";


import * as React from "react";
import DropdownEditor from "./CostPaidBy";
import YesNoEditor from "./YesNoDropDown";

interface InputData {
  a_Number: string | "";
  b_Name: string | "";
  c_Description: string | "";
  d_costpaidby: string | "";
  e_depreciation: string | "";
  f_applyVAT: string | "";
  g_RelatedRowID?: string | ""; // Optional as some objects use 'u_RelatedRowID' instead
  h_Year?: number | ""; // Optional as some objects use 'v_Year' instead
  g_Jan?: number | null;
  h_Feb?: number | null;
  i_Mar?: number | null;
  j_Apr?: number | null;
  k_May?: number | null;
  l_Jun?: number | null;
  m_Jul?: number | null;
  n_Aug?: number | null;
  o_Sep?: number | null;
  p_Oct?: number | null;
  q_Nov?: number | null;
  r_Dec?: number | null;
  s_ID?: string | "";
  t_parentId?: string | null;
  u_RelatedRowID?: string | "";
  v_Year?: number | "";
}

interface AggregatedData {
  Number: string | "";
  Name: string | "";
  Description: string | "";
  costpaidby: string | "None";
  depreciation: string | "No";
  applyVAT: string | "No";
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export class SpreadSheet
  implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private notifyOutputChanged: () => void;
  private data: string;
  private isSaveAction: boolean;
  private isCopyAction: boolean;
  private initialData: { value: string }[][];
  private startingYear: string;
  private ShowCostEnabled: boolean;
  private maxColumns: number;
  private completionYear: string;
  private subAccountIDs: string[] = [];
  private AddRow: boolean;
  private DeleteRow: boolean;
  private SubaccountData: [][];
  // private testData: string;
  constructor() { }

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    state: ComponentFramework.Dictionary
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    this.data = context.parameters.jsonDataIn.raw || "";
    this.isSaveAction = context.parameters.SaveData.raw;
    this.isCopyAction = context.parameters.CopyData.raw;
    this.AddRow = context.parameters.AddRow.raw;
    this.DeleteRow = context.parameters.DeleteRow.raw;
    this.startingYear =
      context.parameters.StartingYear.raw ||
      new Date().getFullYear().toString();
    this.completionYear = (
      Number(context.parameters.CompletionYear.raw || this.startingYear) + 1
    ).toString();
    this.ShowCostEnabled = context.parameters.FiscelYear.raw;
    this.maxColumns =
      12 *
      (Number(this.completionYear) -
        (this.ShowCostEnabled
          ? Number(this.startingYear)
          : new Date().getFullYear())) +
      6;




    if (this.data) {
      this.prepareInitialData();
    }
    console.log("From Init", this.initialData);
  }

  public updateView(
    context: ComponentFramework.Context<IInputs>
  ): React.ReactElement {
    this.isSaveAction = context.parameters.SaveData.raw;
    this.isCopyAction = context.parameters.CopyData.raw;
    // this.testData = context.parameters.testDatOutIn.raw || '';

    this.startingYear =
      context.parameters.StartingYear.raw || this.startingYear;
    this.completionYear = (
      Number(context.parameters.CompletionYear.raw || this.completionYear) + 1
    ).toString();
    this.ShowCostEnabled = context.parameters.FiscelYear.raw;

    this.AddRow = context.parameters.AddRow.raw;
    this.DeleteRow = context.parameters.DeleteRow.raw;

    this.maxColumns =
      12 *
      (Number(this.completionYear) -
        (this.ShowCostEnabled
          ? Number(this.startingYear)
          : new Date().getFullYear())) +
      6;


    const out = dataSetToSingleObjectArray(context.parameters.SubaccountDataIN, {
      keyColumn: "vsb_accountnumber",     // optional (else recordId)
       includeColumns: ["vsb_accountnumber", "vsb_devcospv"],   // optional (else all)
      useFormatted: false
      //,
      // onDuplicateKey: "suffix",
    });

    console.log("DatasetData", out);
    if (context.parameters.jsonDataIn.raw) {
      this.data = context.parameters.jsonDataIn.raw;

      this.prepareInitialData();
    }


    const yearDifference = new Date().getFullYear() - Number(this.startingYear);

    const headerLabels = this.generateMonthLabels(
      1,
      String(this.startingYear),
      yearDifference * 12
    );

    const headerRow = [
      "Account Number",
      "Account Name",
      "Cost Description",
      "Cost Paid By",
      "Depreciation",
      "Apply VAT",
      ...headerLabels,
    ];

    //eslint-disable-next-line
    this.initialData = this.initialData.map((row: any[], rowIndex: number) =>
      //eslint-disable-next-line
      row.map((cell: any, colIndex: number) => {
        //eslint-disable-next-line
        const cellData: any = {
          ...cell,
          className: this.getRowClassName(rowIndex, this.initialData, colIndex),
          readOnly: this.getRowEditable(rowIndex, this.initialData),
        };

        if (colIndex === 3) {
          cellData.DataEditor = DropdownEditor;
        } else if (colIndex === 4 || colIndex === 5) {
          cellData.DataEditor = YesNoEditor;
        }

        return cellData;
      })
    );

    console.log("From UpdateView", this.initialData);
    const props: ISpreadSheetProps = {
      initialData: this.initialData,
      Year: this.ShowCostEnabled
        ? this.startingYear
        : new Date().getFullYear().toString(),
      OnSave: this.isSaveAction,
      onCopy: this.isCopyAction,
      onDataChange: this.handleDataChange.bind(this),
      ShowCostEnabled: this.ShowCostEnabled,
      startingyear: this.startingYear,
      completionyear: this.completionYear,
      maxColumns: this.maxColumns,
      AddRow: this.AddRow,
      DeleteRow: this.DeleteRow,
SubaccountDataIN:out
      // , dataDifference: DataDifference
    };

    return React.createElement(SpreadSheetComp, props);
  }

  public getOutputs(): IOutputs {
    return { jsonDataOut: this.data };
  }

  public destroy(): void { }

  private handleDataChange(newData: string): void {
    this.data = newData;
    this.notifyOutputChanged();
    this.destroy();
  }
  //eslint-disable-next-line
  private getRowClassName = (rowIndex: number, data: any, colIndex: number) => {
    const firstCellValue = data[rowIndex][0].value;
    const secondCellValue = data[rowIndex][1].value;

    if (rowIndex === 0) {
      return "header"; // Header row
    } else if (firstCellValue && secondCellValue) {
      return "filled-row"; // Grey background for filled rows
    } else {
      return "empty-row"; // White background for other rows
    }
  };
  //eslint-disable-next-line
  private getRowEditable = (rowIndex: number, data: any) => {

    if (rowIndex === 0) {
      return true; // Header row
    }

    const firstCellValue = data[rowIndex][0].value;
    const secondCellValue = data[rowIndex][1].value;
    const descriptionValue = data[rowIndex][2].value || "";

    // 🔒 If Description starts with "Standard" → make row non-editable
    if (descriptionValue.toLowerCase().includes("standard")) {
      return true;
    }

    if (firstCellValue && secondCellValue) {
      return true; // Grey background for filled rows
    } else {
      return false; // White background for other rows
    }
    // const firstCellValue = data[rowIndex][0].value;
    // const secondCellValue = data[rowIndex][1].value;

    // if (rowIndex === 0) {
    //   return true; // Header row
    // } else if (firstCellValue && secondCellValue) {
    //   return true; // Grey background for filled rows
    // } else {
    //   return false; // White background for other rows
    // }
  };

  private groupData(data: InputData[]): AggregatedData[] {
    const aggregatedData: AggregatedData[] = [];
    const dataMap = new Map<string, AggregatedData>();
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    data.forEach((item) => {
      const relatedRowID = item.u_RelatedRowID || "";
      const number = item.a_Number;
      const key = `${number}_${relatedRowID}`;
      const year = item.v_Year;

      if (!dataMap.has(key)) {
        dataMap.set(key, {
          Number: item.t_parentId ? "" : number,
          Name: item.t_parentId ? "" : item.b_Name,
          Description: item.c_Description,
          costpaidby: item.d_costpaidby,
          depreciation: item.e_depreciation,
          applyVAT: item.f_applyVAT,
          yearData: {},
        });
      }

      const existingData = dataMap.get(key);

      if (existingData && year) {
        if (!existingData.yearData[year]) {
          existingData.yearData[year] = {};
        }

        const monthValues: { [key: string]: number | null } = {};

        months.forEach((month, index) => {
          const monthKey = String.fromCharCode(103 + index) + "_" + month;
          const value = item[monthKey as keyof InputData];

          monthValues[month] =
            typeof value === "number" || value === null ? value : null;
        });

        existingData.yearData[year] = {
          ...existingData.yearData[year],
          ...monthValues,
        };
      }
    });

    dataMap.forEach((value) => {
      const aggregated: AggregatedData = {
        Number: value.Number,
        Name: value.Name,
        Description: value.Description,
        costpaidby: value.costpaidby,
        depreciation: value.depreciation,
        applyVAT: value.applyVAT,
      };

      Object.keys(value.yearData).forEach((year) => {
        months.forEach((month) => {
          aggregated[`${month}_${year}`] = value.yearData[year][month];
          //|| null;
        });
      });

      aggregatedData.push(aggregated);
    });

    return aggregatedData;
  }

  private prepareInitialData(): void {
    const groupedData = this.groupData(JSON.parse(this.data));

    const startingYear = this.ShowCostEnabled
      ? this.startingYear
      : new Date().getFullYear();

    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const years = this.generateYearRange(
      Number(startingYear),
      Number(this.completionYear) - 1
    );

    this.initialData = groupedData.map((item: AggregatedData) => {
      const baseData = [
        item.Number,
        item.Name,
        item.Description,
        item.costpaidby,
        item.depreciation,
        item.applyVAT,
      ].map((value) => ({ value }));
      const yearDataMap: { [year: string]: { value: string }[] } = {};

      years.forEach((year: string | number) => {
        yearDataMap[year] = months.map(() => ({ value: "" }));
      });

      Object.entries(item).forEach(([key, value]) => {
        const match = key.match(/^([A-Za-z]+)_(\d{4})$/);
        if (match) {
          const month = match[1];
          const year = match[2];
          if (years.includes(year) && months.includes(month)) {
            const monthIndex = months.indexOf(month);
            yearDataMap[year][monthIndex] = { value };
          }
        }
      });

      const yearWiseData = years.flatMap(
        (year: string | number) => yearDataMap[year]
      );
      return [...baseData, ...yearWiseData];
    });

    const headerLabels = this.generateMonthLabels(
      1,
      String(startingYear),
      this.maxColumns - 6
    );

    const headerRow = [
      "Account Number",
      "Account Name",
      "Cost Description",
      "Cost Paid By",
      "Depreciation",
      "Apply VAT",
      ...headerLabels,
    ];
    //eslint-disable-next-line
    this.initialData.unshift(headerRow.map((value: any) => ({ value })));
    //eslint-disable-next-line
    this.initialData = this.initialData.map((row: any) => {
      const newRow = [...row];
      while (newRow.length < this.maxColumns) {
        newRow.push({ value: "" });
      }
      return newRow;
    });
  }

  private generateMonthLabels(
    startMonth: number,
    year: string,
    count: number
  ): string[] {
    const labels = [];
    let month = startMonth;
    let currentYear = Number(year);

    for (let i = 0; i < count; i++) {
      const monthString = month < 10 ? `0${month}` : `${month}`;
      labels.push(`${monthString}/${currentYear}`);

      month++;
      if (month > 12) {
        month = 1;
        currentYear++;
      }
    }

    return labels;
  }

  private generateYearRange(startYear: number, endYear: number): string[] {
    const years: string[] = [];
    for (let year = startYear; year <= endYear; year++) {
      years.push(year.toString());
    }
    return years;
  }
}
