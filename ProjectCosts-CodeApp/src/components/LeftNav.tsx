/**
 * Replaces `cmp_Left_Navigation` — a canvas component that itself hosted
 * `cat_PowerCAT.Nav`, so this removes two layers at once.
 *
 * The canvas rail took an `Items` table and returned `SelectedKey`; screens then toggled
 * container visibility on it. Here it is a real nav landmark with real links, so the browser
 * back button, middle-click and keyboard navigation all work — none of which they did before.
 *
 * The green left-edge accent bar on the selected item (screenshot r06) is reproduced.
 */
import { Button, makeStyles, mergeClasses, tokens, Tooltip } from "@fluentui/react-components";
import {
  TableSimpleRegular, ChevronDownRegular, ChevronUpRegular, NavigationRegular,
} from "@fluentui/react-icons";
import { useMemo, useState, type ReactElement } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { activeNavKey, navItemsFor, parentOf, railSection, type NavItem } from "@/app/navigation";
import { useSession } from "@/app/SessionContext";
import { costLocation, COST_PATHS } from "@/app/deepLinks";
import { layout, palette, space } from "@/theme/tokens";

/*
 * `LeftNavigationMenu.ItemIconName` (`App.pa.yaml:87-140`), which names Fabric icons, mapped to
 * their Fluent v9 equivalents. Every rail item used to render `DocumentRegular` — a plain sheet —
 * so DEVEX/CAPEX lost its solid reading-mode glyph, the OPEX items lost the pencil that makes
 * them editable pages, and Contracts was indistinguishable from its siblings.
 */
/*
 * The canvas rail's Fabric MDL2 font icons (`ItemIconName`), as each glyph's own outline on its
 * 2048-unit em, taken from `@fluentui/font-icons-mdl2` (code point and font chunk on each) — the
 * exact canvas icons, where Fluent v9 has only lookalikes (`DocumentEditRegular` draws the pencil
 * inside the page, `FlashRegular` has no tick). The viewBox pads each to 80 % of the box, i.e. 16 px
 * in the 20-px icon slot, the size the canvas rail draws its MDL2 font icons at.
 */
const MDL2_PATH = {
  // PageEdit — U+EFB6, fabric-icons-8.
  pageEdit: "M1848 896Q1890 896 1926.5 911Q1963 926 1990 953Q2017 980 2032.5 1016Q2048 1052 2048 1094Q2048 1133 2033 1170Q2018 1207 1990 1235L1273 1954L896 2048L990 1671L1707 953Q1735 925 1772 910.5Q1809 896 1848 896ZM1207 1838L1899 1145Q1920 1124 1920 1094Q1920 1063 1899.5 1043.5Q1879 1024 1848 1024Q1834 1024 1821 1028.5Q1808 1033 1798 1043L1106 1737L1072 1872L1207 1838ZM256 128L256 1920L763 1920L731 2048L128 2048L128 0L1243 0L1792 549L1792 743Q1725 753 1664 787L1664 640L1152 640L1152 128L256 128ZM1280 219L1280 512L1573 512L1280 219Z",
  /*
   * ReadingModeSolid (DEVEX/CAPEX) and TextDocumentShared (Contracts): the canvas Cost rail's
   * `data-icon-name` glyphs, from `ReadingModeSolidIcon` / `TextDocumentSharedIcon` in
   * `@fluentui/react-icons-mdl2` 1.3.83 — the SVG build of the same MDL2 font (its `PageEditIcon`
   * is the PageEdit outline above). They replace the Fluent v9 lookalikes `BookOpenFilled` and
   * `DocumentPersonRegular` (5 Nov 2026).
   */
  readingModeSolid: "M640 1664q43 0 75 9t60 26 53 41 54 52H0V256h128v1408h512zm0-1536q67 0 132 16t124 50v1435q-54-45-120-69t-136-24H256V128h384zm1280 128v1536h-882q28-28 53-52t53-40 60-26 76-10h512V256h128zm-640 1280q-70 0-136 24t-120 69V194q59-33 124-49t132-17h384v1408h-384z",
  textDocumentShared: "M1408 1024H512V896h896v128zm-896 128h896v56q-41 32-72 72H512v-128zm0 256h756q-20 63-20 128H512v-128zm-256 512h880q-16 61-16 128H128V0h1115l549 549v591q-63-20-128-20V640h-512V128H256v1792zM1280 512h293l-293-293v293zm568 1201q46 25 83 61t63 79 40 93 14 102h-128q0-53-20-99t-55-82-81-55-100-20q-53 0-99 20t-82 55-55 81-20 100h-128q0-52 14-101t40-93 63-80 83-61q-34-35-53-81t-19-96q0-53 20-99t55-82 81-55 100-20q53 0 99 20t82 55 55 81 20 100q0 50-19 96t-53 81zm-184-49q27 0 50-10t40-27 28-41 10-50q0-27-10-50t-27-40-41-28-50-10q-27 0-50 10t-40 27-28 41-10 50q0 27 10 50t27 40 41 28 50 10z",
  /*
   * The Application Settings rail (`LeftAdminNavigationMenu`), from the same package:
   * ReminderGroup (Project Gates), AccountManagement (CAPEX Accounts), DateTime (Milestones) and
   * AllCurrency (Costs; also the hidden Total Summary row of the Cost rail). They replace the
   * Fluent v9 lookalikes `AlertBadgeRegular`, `PersonAccountsRegular`, `CalendarClockRegular` and
   * `MoneyRegular` (5 Nov 2026). Check List Settings already drew `checkList` below, and Contracts
   * shares the Cost rail's TextDocumentShared.
   */
  reminderGroup: "M2029 1453l-557 558-269-270 90-90 179 178 467-466 90 90zm-1293 9q66 33 119 81t90 107 58 128 21 142H896q0-79-30-149t-82-122-123-83-149-30q-80 0-149 30t-122 82-83 123-30 149H0q0-73 20-142t58-128 91-107 119-81q-75-54-117-135t-43-175q0-79 30-149t82-122 122-83 150-30q94 0 175 42t135 118q38-76 98-136t136-98q-75-54-117-135t-43-175q0-79 30-149t82-122 122-83 150-30q79 0 149 30t122 82 83 123 30 149q0 94-42 175t-118 135q66 33 119 81t90 107 58 128 21 142h-128q0-79-30-149t-82-122-123-83-149-30q-80 0-149 30t-122 82-83 123-30 149q0 94-42 175t-118 135zm288-1078q0 53 20 99t55 82 81 55 100 20q53 0 99-20t82-55 55-81 20-100q0-53-20-99t-55-82-81-55-100-20q-53 0-99 20t-82 55-55 81-20 100zm-768 768q0 53 20 99t55 82 81 55 100 20q53 0 99-20t82-55 55-81 20-100q0-53-20-99t-55-82-81-55-100-20q-53 0-99 20t-82 55-55 81-20 100z",
  accountManagement: "M1148 1152q-83-62-179-95t-201-33q-88 0-170 23t-153 64-129 100-100 130-65 153-23 170H0q0-120 35-231t101-205 156-167 204-115q-56-35-100-82t-76-104-47-119-17-129q0-106 40-199t110-162T569 41 768 0q106 0 199 40t162 110 110 163 41 199q0 66-16 129t-48 119-76 103-101 83q60 23 113 54v152h-4zM384 512q0 80 30 149t82 122 122 83 150 30q79 0 149-30t122-82 83-122 30-150q0-79-30-149t-82-122-123-83-149-30q-80 0-149 30t-122 82-83 123-30 149zm1664 768v768H1024v-768h256v-256h512v256h256zm-640 0h256v-128h-256v128zm512 384h-128v128h-128v-128h-256v128h-128v-128h-128v256h768v-256zm0-256h-768v128h768v-128z",
  dateTime: "M1792 993q60 41 107 93t81 114 50 131 18 141q0 119-45 224t-124 183-183 123-224 46q-91 0-176-27t-156-78-126-122-85-157H128V128h256V0h128v128h896V0h128v128h256v865zM256 256v256h1408V256h-128v128h-128V256H512v128H384V256H256zm643 1280q-3-31-3-64 0-86 24-167t73-153h-97v-128h128v86q41-51 91-90t108-67 121-42 128-15q100 0 192 33V640H256v896h643zm573 384q93 0 174-35t142-96 96-142 36-175q0-93-35-174t-96-142-142-96-175-36q-93 0-174 35t-142 96-96 142-36 175q0 93 35 174t96 142 142 96 175 36zm64-512h192v128h-320v-384h128v256zM384 1024h128v128H384v-128zm256 0h128v128H640v-128zm0-256h128v128H640V768zm-256 512h128v128H384v-128zm256 0h128v128H640v-128zm384-384H896V768h128v128zm256 0h-128V768h128v128zm256 0h-128V768h128v128z",
  allCurrency: "M959 1026q-48-2-99-12t-94-31q-17-8-27-23t-10-35q0-26 19-45t45-19q13 0 27 6 66 29 138 30V678q-37-13-71-32t-61-45-43-61-16-77q0-41 16-74t43-57 61-41 71-25q0-29 16-50t48-22q27 0 45 18t19 46q35 2 66 9t65 17l-44 120q-21-8-43-12t-44-6v200q34 12 68 32t62 47 45 61 17 74q0 44-15 80t-40 63-61 45-76 28q0 28-17 48t-47 20q-25 0-43-17t-20-41zm127-143q28-11 46-30t18-52q0-12-6-23t-16-20-21-17-21-14v156zM895 463q0 28 20 46t43 30V400q-3 1-13 5t-12 7q-14 5-26 20t-12 31zm745 351q92 36 167 96t128 137 83 169 30 191q0 88-23 170t-64 153-100 129-130 101-153 65-170 23q-104 0-202-33t-181-96q-84 63-182 96t-203 33q-89 0-170-23t-153-64-129-100-100-130-65-153-23-171q0-99 29-190t83-169 129-138 167-96q-24-84-24-173 0-88 23-170t64-153 100-129T701 88t153-65 170-23q88 0 170 23t153 65 129 100 100 130 65 153 23 170q0 89-24 173zm-616-686q-106 0-199 40T662 279 552 442t-40 199q0 106 40 199t109 163 163 110 200 41q106 0 199-40t163-110 110-163 40-200q0-106-40-199t-109-163-163-110-200-41zM640 1920q106 0 199-40t163-110 110-163 40-200q0-68-20-134-54 9-108 9-105 0-203-33t-183-97q-7 4-13 5-88 26-133 91t-46 157v2h126q26 0 45 19t19 45q0 31-17 44t-41 18-51 4-46-2q35 59 93 92t128 34q29 0 54-6t52-17q13-5 26-5 26 0 45 18t19 45q0 29-22 47t-54 28-65 14-55 4q-61 0-117-18t-104-52-84-80-57-104q-16 0-31-3t-26-10-19-19-7-32q0-26 17-44t44-20q0-56 14-109t41-100 67-84 94-60q-23-29-43-60t-38-64q-74 29-133 77t-103 111-66 136-23 153q0 106 40 199t109 163 163 110 200 41zm768 0q106 0 199-40t163-110 110-163 40-200q0-79-23-152t-66-136-103-110-133-78q-38 74-93 136t-124 108l93 126 140-187q19-26 51-26 27 0 46 19t19 46q0 20-13 38l-180 239v105h41q22 0 42 4t33 18 14 42q0 28-13 41t-33 19-42 5-42-1v41q0 22-4 42t-18 33-42 14q-28 0-41-13t-19-33-5-42 1-42h-41q-22 0-41-4t-33-18-13-42q0-28 13-41t32-19 42-5 41 1v-105l-142-194-6 2q12 41 17 84t5 85q0 118-40 226t-119 197q64 44 136 67t151 23z",
  // Flag — U+E7C1, the core fabric-icons set.
  flag: "M1152 256L1920 256L1920 1280L1024 1280L1024 1024L384 1024L384 2048L256 2048L256 0L1152 0L1152 256ZM384 896L1024 896L1024 128L384 128L384 896ZM1792 1152L1792 384L1152 384L1152 1152L1792 1152Z",
  // TriggerApproval — U+F3B2, fabric-icons-12.
  triggerApproval: "M1223 768L1883 768L603 2048L313 2048L697 1280L248 1280L888 0L1607 0L1223 768ZM549 1920L1573 896L1016 896L1400 128L967 128L455 1152L904 1152L520 1920L549 1920ZM1939 1363L2029 1453L1472 2011L1203 1741L1293 1651L1472 1829L1939 1363Z",
  // ProductVariant — U+EE30, fabric-icons-7.
  productVariant: "M640 354L1344 2L2048 354L2048 1139L1920 1075L1920 497L1408 753L1408 1011L1280 1075L1280 753L768 497L768 724L640 660L640 354ZM847 394L1344 642L1521 553L1058 288L847 394ZM1195 220L1659 485L1841 394L1344 145L1195 220ZM1152 1059L1152 1139L1024 1203L1024 1202L640 1394L640 1849L1024 1656L1024 1800L576 2024L0 1735L0 1059L576 771L1152 1059ZM128 1656L512 1849L512 1394L128 1202L128 1656ZM207 1099L576 1283L945 1099L576 914L207 1099ZM1152 1809L1152 1282L1600 1058L2048 1282L2048 1809L1600 2033L1152 1809ZM1280 1730L1536 1858L1536 1553L1280 1425L1280 1730ZM1664 1858L1920 1730L1920 1425L1664 1553L1664 1858ZM1359 1321L1600 1442L1841 1321L1600 1201L1359 1321Z",
  // Teamwork — U+EA12, fabric-icons-3.
  teamwork: "M1664 1088Q1730 1088 1788.5 1113Q1847 1138 1890.5 1181.5Q1934 1225 1959 1283.5Q1984 1342 1984 1408Q1984 1460 1967.5 1509Q1951 1558 1920 1600L1920 2024L1664 1896L1408 2024L1408 1600Q1377 1558 1360.5 1509Q1344 1460 1344 1408Q1344 1342 1369 1283.5Q1394 1225 1437.5 1181.5Q1481 1138 1539.5 1113Q1598 1088 1664 1088ZM1664 1216Q1624 1216 1589 1231Q1554 1246 1528 1272Q1502 1298 1487 1333Q1472 1368 1472 1408Q1472 1448 1487 1483Q1502 1518 1528 1544Q1554 1570 1589 1585Q1624 1600 1664 1600Q1704 1600 1739 1585Q1774 1570 1800 1544Q1826 1518 1841 1483Q1856 1448 1856 1408Q1856 1368 1841 1333Q1826 1298 1800 1272Q1774 1246 1739 1231Q1704 1216 1664 1216ZM1664 1752L1792 1816L1792 1701Q1732 1728 1664 1728Q1596 1728 1536 1701L1536 1816L1664 1752ZM1664 512Q1611 512 1564.5 532Q1518 552 1483 587Q1448 622 1428 668.5Q1408 715 1408 768Q1408 860 1366.5 941.5Q1325 1023 1251 1078Q1270 1087 1287.5 1098Q1305 1109 1322 1121L1247 1225Q1198 1190 1141 1171Q1084 1152 1024 1152Q944 1152 874.5 1182Q805 1212 752.5 1264.5Q700 1317 670 1387Q640 1457 640 1536L512 1536Q512 1463 532 1394.5Q552 1326 589 1266.5Q626 1207 678.5 1158.5Q731 1110 796 1077Q722 1022 681 941Q640 860 640 768Q640 715 620 668.5Q600 622 565 587Q530 552 483.5 532Q437 512 384 512Q331 512 284.5 532Q238 552 203 587Q168 622 148 668.5Q128 715 128 768L0 768Q0 716 14 666.5Q28 617 53.5 573.5Q79 530 115.5 494Q152 458 198 432Q165 397 146.5 351Q128 305 128 256Q128 203 148 156.5Q168 110 203 75Q238 40 284.5 20Q331 0 384 0Q437 0 483.5 20Q530 40 565 75Q600 110 620 156.5Q640 203 640 256Q640 305 621.5 351Q603 397 570 432Q652 477 704 556Q731 516 766 484Q801 452 842 430Q883 408 929.5 396Q976 384 1024 384Q1072 384 1118 396Q1164 408 1205.5 430Q1247 452 1282 484Q1317 516 1344 556Q1396 477 1478 432Q1445 397 1426.5 351Q1408 305 1408 256Q1408 203 1428 156.5Q1448 110 1483 75Q1518 40 1564.5 20Q1611 0 1664 0Q1717 0 1763.5 20Q1810 40 1845 75Q1880 110 1900 156.5Q1920 203 1920 256Q1920 305 1901.5 351Q1883 397 1850 432Q1896 458 1932.5 494Q1969 530 1994.5 573.5Q2020 617 2034 666.5Q2048 716 2048 768L1920 768Q1920 715 1900 668.5Q1880 622 1845 587Q1810 552 1763.5 532Q1717 512 1664 512ZM1536 256Q1536 283 1546 306Q1556 329 1573.5 346.5Q1591 364 1614 374Q1637 384 1664 384Q1691 384 1714 374Q1737 364 1754.5 346.5Q1772 329 1782 306Q1792 283 1792 256Q1792 229 1782 206Q1772 183 1754.5 165.5Q1737 148 1714 138Q1691 128 1664 128Q1637 128 1614 138Q1591 148 1573.5 165.5Q1556 183 1546 206Q1536 229 1536 256ZM256 256Q256 283 266 306Q276 329 293.5 346.5Q311 364 334 374Q357 384 384 384Q411 384 434 374Q457 364 474.5 346.5Q492 329 502 306Q512 283 512 256Q512 229 502 206Q492 183 474.5 165.5Q457 148 434 138Q411 128 384 128Q357 128 334 138Q311 148 293.5 165.5Q276 183 266 206Q256 229 256 256ZM768 768Q768 821 788 867.5Q808 914 843 949Q878 984 924.5 1004Q971 1024 1024 1024Q1077 1024 1123.5 1004Q1170 984 1205 949Q1240 914 1260 867.5Q1280 821 1280 768Q1280 715 1260 668.5Q1240 622 1205 587Q1170 552 1123.5 532Q1077 512 1024 512Q971 512 924.5 532Q878 552 843 587Q808 622 788 668.5Q768 715 768 768Z",
  // CheckList — U+E9D5, fabric-icons-3.
  checkList: "M2048 896L640 896L640 768L2048 768L2048 896ZM640 512L640 384L2048 384L2048 512L640 512ZM2048 1280L640 1280L640 1152L2048 1152L2048 1280ZM2048 1664L640 1664L640 1536L2048 1536L2048 1664ZM109 387L192 469L403 259L493 349L192 650L19 477L109 387ZM109 771L192 853L403 643L493 733L192 1034L19 861L109 771ZM109 1155L192 1237L403 1027L493 1117L192 1418L19 1245L109 1155ZM109 1539L192 1621L403 1411L493 1501L192 1802L19 1629L109 1539Z",
  // PlanView — U+F360, fabric-icons-12.
  planView: "M2048 256L128 256L128 640L2048 640L2048 768L128 768L128 1920L0 1920L0 128L2048 128L2048 256ZM256 1024L256 896L384 896L384 1024L256 1024ZM512 1024L512 896L640 896L640 1024L512 1024ZM768 1024L768 896L896 896L896 1024L768 1024ZM1024 1024L1024 896L1152 896L1152 1024L1024 1024ZM1280 1024L1280 896L1408 896L1408 1024L1280 1024ZM1536 1024L1536 896L1664 896L1664 1024L1536 1024ZM1792 1024L1792 896L1920 896L1920 1024L1792 1024ZM256 1536L256 1408L384 1408L384 1536L256 1536ZM512 1536L512 1408L640 1408L640 1536L512 1536ZM768 1536L768 1408L896 1408L896 1536L768 1536ZM1024 1536L1024 1408L1152 1408L1152 1536L1024 1536ZM1280 1536L1280 1408L1408 1408L1408 1536L1280 1536ZM1536 1536L1536 1408L1664 1408L1664 1536L1536 1536ZM1792 1536L1792 1408L1920 1408L1920 1536L1792 1536ZM256 1280L256 1152L384 1152L384 1280L256 1280ZM512 1280L512 1152L640 1152L640 1280L512 1280ZM768 1280L768 1152L896 1152L896 1280L768 1280ZM1024 1280L1024 1152L1152 1152L1152 1280L1024 1280ZM1280 1280L1280 1152L1408 1152L1408 1280L1280 1280ZM1536 1280L1536 1152L1664 1152L1664 1280L1536 1280ZM1792 1280L1792 1152L1920 1152L1920 1280L1792 1280ZM256 1792L256 1664L384 1664L384 1792L256 1792ZM512 1792L512 1664L640 1664L640 1792L512 1792ZM768 1792L768 1664L896 1664L896 1792L768 1792ZM1024 1792L1024 1664L1152 1664L1152 1792L1024 1792ZM1280 1792L1280 1664L1408 1664L1408 1792L1280 1792Z",
  // FollowUser — U+EE05, fabric-icons-7.
  followUser: "M1677 1235L2042 1600L1677 1965L1587 1875L1798 1664L1152 1664L1152 1536L1798 1536L1587 1325L1677 1235ZM1468 1350L1351 1402Q1312 1316 1251.5 1246.5Q1191 1177 1115 1127.5Q1039 1078 950.5 1051Q862 1024 768 1024Q680 1024 598 1047Q516 1070 445 1111.5Q374 1153 315.5 1211.5Q257 1270 215.5 1341Q174 1412 151 1494Q128 1576 128 1664L0 1664Q0 1547 35.5 1435Q71 1323 136.5 1227.5Q202 1132 293.5 1058.5Q385 985 496 946Q440 910 395.5 863Q351 816 320 760Q289 704 272.5 641.5Q256 579 256 512Q256 406 296 312.5Q336 219 405.5 149.5Q475 80 568.5 40Q662 0 768 0Q874 0 967.5 40Q1061 80 1130.5 149.5Q1200 219 1240 312.5Q1280 406 1280 512Q1280 649 1216.5 760.5Q1153 872 1040 946Q1112 973 1176 1013.5Q1240 1054 1294.5 1105.5Q1349 1157 1392.5 1219Q1436 1281 1468 1350ZM384 512Q384 592 414 661.5Q444 731 496.5 783.5Q549 836 618.5 866Q688 896 768 896Q847 896 917 866Q987 836 1039.5 783.5Q1092 731 1122 661.5Q1152 592 1152 512Q1152 433 1122 363Q1092 293 1039.5 240.5Q987 188 917 158Q847 128 768 128Q688 128 618.5 158Q549 188 496.5 240.5Q444 293 414 363Q384 433 384 512Z",
  // Money — U+EAFD, fabric-icons-4.
  money: "M1792 384L2048 384L2048 1664L128 1664L128 1408L0 1408L0 256L1792 256L1792 384ZM1664 384L1536 384Q1536 411 1546 434Q1556 457 1573.5 474.5Q1591 492 1614 502Q1637 512 1664 512L1664 384ZM128 384L128 512Q155 512 178 502Q201 492 218.5 474.5Q236 457 246 434Q256 411 256 384L128 384ZM128 640L128 1024Q181 1024 227.5 1044Q274 1064 309 1099Q344 1134 364 1180.5Q384 1227 384 1280L1408 1280Q1408 1227 1428 1180.5Q1448 1134 1483 1099Q1518 1064 1564.5 1044Q1611 1024 1664 1024L1664 640Q1611 640 1564.5 620Q1518 600 1483 565Q1448 530 1428 483.5Q1408 437 1408 384L384 384Q384 437 364 483.5Q344 530 309 565Q274 600 227.5 620Q181 640 128 640ZM1664 1280L1664 1152Q1637 1152 1614 1162Q1591 1172 1573.5 1189.5Q1556 1207 1546 1230Q1536 1253 1536 1280L1664 1280ZM128 1152L128 1280L256 1280Q256 1253 246 1230Q236 1207 218.5 1189.5Q201 1172 178 1162Q155 1152 128 1152ZM1920 1536L1920 512L1792 512L1792 1408L256 1408L256 1536L1920 1536ZM448 896Q422 896 403 877Q384 858 384 832Q384 806 403 787Q422 768 448 768Q474 768 493 787Q512 806 512 832Q512 858 493 877Q474 896 448 896ZM1344 896Q1318 896 1299 877Q1280 858 1280 832Q1280 806 1299 787Q1318 768 1344 768Q1370 768 1389 787Q1408 806 1408 832Q1408 858 1389 877Q1370 896 1344 896ZM896 1152Q843 1152 796.5 1132Q750 1112 715 1077Q680 1042 660 995.5Q640 949 640 896L640 768Q640 715 660 668.5Q680 622 715 587Q750 552 796.5 532Q843 512 896 512Q949 512 995.5 532Q1042 552 1077 587Q1112 622 1132 668.5Q1152 715 1152 768L1152 896Q1152 949 1132 995.5Q1112 1042 1077 1077Q1042 1112 995.5 1132Q949 1152 896 1152ZM768 768L768 896Q768 923 778 946Q788 969 805.5 986.5Q823 1004 846 1014Q869 1024 896 1024Q923 1024 946 1014Q969 1004 986.5 986.5Q1004 969 1014 946Q1024 923 1024 896L1024 768Q1024 741 1014 718Q1004 695 986.5 677.5Q969 660 946 650Q923 640 896 640Q869 640 846 650Q823 660 805.5 677.5Q788 695 778 718Q768 741 768 768Z",
  // Financial — U+E7BB, fabric-icons-1.
  financial: "M1792 2048L1792 896L1920 896L1920 2048L1792 2048ZM512 2048L512 1344L640 1216L640 2048L512 2048ZM256 2048L256 1600L384 1472L384 2048L256 2048ZM768 2048L768 1088L896 960L896 2048L768 2048ZM1024 2047L1024 960L1152 1088L1152 2047L1024 2047ZM1280 1216L1344 1280L1408 1216L1408 2048L1280 2048L1280 1216ZM1536 2048L1536 1088L1664 960L1664 2048L1536 2048ZM0 2048L0 1856L128 1728L128 2048L0 2048ZM1536 256L2048 256L2048 768L1920 768L1920 475L1344 1050L960 666L0 1627L0 1445L960 486L1344 870L1829 384L1536 384L1536 256Z",
} as const;
// A fixed 20-px box (not `1em`, which followed the 14-px label and drew an 11-px glyph): the glyph
// 16 px, 8 px from the rail edge and its label 33 px in, as the canvas rail (screenshot, 3 Nov 2026).
const Mdl2Icon = ({ path }: { path: string }) => (
  <svg width="20" height="20" viewBox="-256 -256 2560 2560" fill="currentColor" aria-hidden="true"
    style={{ marginLeft: "-3px", marginRight: "-2px" }}>
    <path d={path} />
  </svg>
);

const ICONS: Record<NavItem["icon"], ReactElement> = {
  projects: <TableSimpleRegular />,
  // ReadingModeSolid — an open book, and the only FILLED glyph in the rail.
  capex: <Mdl2Icon path={MDL2_PATH.readingModeSolid} />,      // ReadingModeSolid
  opex: <Mdl2Icon path={MDL2_PATH.pageEdit} />,      // PageEdit
  document: <Mdl2Icon path={MDL2_PATH.pageEdit} />,  // PageEdit
  // TextDocumentShared — a document with a person, not a plain sheet of lines.
  contract: <Mdl2Icon path={MDL2_PATH.textDocumentShared} />,  // TextDocumentShared
  currency: <Mdl2Icon path={MDL2_PATH.allCurrency} />,         // AllCurrency
  // Project Management rails (`ItemIconName` in `LeftNavigationMenu` / `LeftAdminNavigationMenu`):
  flag: <Mdl2Icon path={MDL2_PATH.flag} />,                     // Flag
  generator: <Mdl2Icon path={MDL2_PATH.triggerApproval} />,     // TriggerApproval
  production: <Mdl2Icon path={MDL2_PATH.productVariant} />,     // ProductVariant
  checklist: <Mdl2Icon path={MDL2_PATH.checkList} />,           // CheckList
  team: <Mdl2Icon path={MDL2_PATH.teamwork} />,                 // Teamwork
  planning: <Mdl2Icon path={MDL2_PATH.planView} />,             // PlanView
  gridOperator: <Mdl2Icon path={MDL2_PATH.followUser} />,       // FollowUser
  money: <Mdl2Icon path={MDL2_PATH.money} />,                   // Money
  financial: <Mdl2Icon path={MDL2_PATH.financial} />,           // Financial
  gates: <Mdl2Icon path={MDL2_PATH.reminderGroup} />,           // ReminderGroup
  accounts: <Mdl2Icon path={MDL2_PATH.accountManagement} />,    // AccountManagement
  dateTime: <Mdl2Icon path={MDL2_PATH.dateTime} />,             // DateTime
};

/*
 * `Image2.Image` in the PM app's `cmp_Left_Navigation`, verbatim: a panel with a LEFT arrow
 * while `gblLeftNavigationMenuIsExpanded`, a panel with a RIGHT arrow once collapsed.
 */
const PANEL_COLLAPSE_PATH = "M17 9H0V0H17V9ZM1 8H4V1H1V8ZM5 8H16V1H5V8ZM9.85352 2.35352L8.20703 4H12V5H8.20703L9.85352 6.64648L9.14648 7.35352L6.29297 4.5L9.14648 1.64648L9.85352 2.35352Z";
const PANEL_EXPAND_PATH = "M0 9H17V0H0V9ZM16 8H13V1H16V8ZM12 8H1V1H12V8ZM7.14648 2.35352L8.79297 4H5V5H8.79297L7.14648 6.64648L7.85352 7.35352L10.707 4.5L7.85352 1.64648L7.14648 2.35352Z";

/**
 * `icon_Left_Navigation_Expand` — ONE canvas control, rendered at the top of the Cost rail and at
 * the bottom of the PM/admin rail (never both), so the id is shared through this constant.
 */
const EXPAND_TEST_ID = "icon_Left_Navigation_Expand";

/** `lbl_Left_Navigation_Expand.Text` — the same caption in both states. */
const COLLAPSE_CAPTION = "Collapse Menu";
/** `icon_Left_Navigation_Expand.Tooltip`, verbatim — "naviagtion" is the canvas spelling. */
const collapseTooltip = (expanded: boolean) => `${expanded ? "Decrease" : "Expand"} left naviagtion panel`;
/** `gblAppSizes.LeftNavigation.DecreasedWidth` — the PM rail's container width once collapsed. */
const PM_RAIL_COLLAPSED_WIDTH = 32;

/** The rail's accessible name per section. */
const RAIL_LABEL = { cost: "Cost sections", project: "Project sections", admin: "Administration sections" } as const;

const useStyles = makeStyles({
  rail: {
    display: "flex", flexDirection: "column",
    flexShrink: 0,
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground1,
    overflowY: "auto",
    // `con_Left_Navigation` is `padding: 4px 0`.
    paddingTop: "4px",
    paddingBottom: "4px",
  },
  item: {
    display: "flex", alignItems: "center", gap: space.s,
    paddingTop: space.s, paddingBottom: space.s,
    paddingLeft: space.m, paddingRight: space.s,
    color: tokens.colorNeutralForeground1,
    textDecorationLine: "none",
    fontSize: tokens.fontSizeBase200,
    // The accent bar lives on the left edge and is transparent unless selected.
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
    ":hover": { backgroundColor: palette.hoverButton },
  },
  /*
   * Selected reads as a grey band with a blue edge and BOLD DARK text — not blue text on a
   * blue tint (`Cost App - Left Panel.png`, the Contracts row). The accent is the theme blue,
   * not the green used elsewhere in the shell.
   */
  itemSelected: {
    backgroundColor: palette.Grayscale30,
    borderLeftColor: palette.themePrimary,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  child: { paddingLeft: space.xxl },
  group: {
    display: "flex", alignItems: "center", gap: space.s, width: "100%",
    justifyContent: "flex-start",
    paddingLeft: space.m,
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
  },
  label: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  disabled: { color: tokens.colorNeutralForegroundDisabled, pointerEvents: "none" },
});

/**
 * `adminVisible` — the canvas `ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)`
 * on every admin row (`app/adminAccess.ts`). Only the admin rail uses it.
 */
export function LeftNav({ adminVisible = true }: { adminVisible?: boolean } = {}) {
  const styles = useStyles();
  const location = useLocation();
  const [expanded, setExpanded] = useState(true);
  const section = railSection(location.pathname);
  const items = navItemsFor(section);
  const active = activeNavKey(location.pathname, items);

  // The OPEX group starts open when the current screen is one of its children, which is
  // what the canvas rail showed on a deep link into Land Lease.
  // The admin rail opens BOTH groups on every screen, as the canvas does (seen in the Canvas run, 29 Oct 2026: Project Gate and
  // Standard Assumptions are both open when Application Settings opens), not only the group of the current screen.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(section === "admin" ? ["GatesKey", "StandardAssumptionsKey"]
      : parentOf(active, items) ? [parentOf(active, items) as string] : ["OpexCostsKey"]),
  );

  const visible = useMemo(
    () => items.filter((i) => i.visible && (section !== "admin" || adminVisible)),
    [items, section, adminVisible],
  );
  const roots = visible.filter((i) => !i.parentKey);
  /*
   * The Project Management and admin screens instance the PM app's `cmp_Left_Navigation`,
   * whose `con_Left_Navigation` lists `pcf_Left_Navigation_Menu` FIRST and
   * `con_Left_Navigation_Header` after it — so the items start at the top and the "Collapse
   * Menu" row sits at the bottom. The Cost app's copy of the component has the header first,
   * which is the hamburger row the cost screens keep.
   */
  const pmRail = section === "project" || section === "admin";
  const collapsedWidth = pmRail ? PM_RAIL_COLLAPSED_WIDTH : layout.railWidthCollapsed;

  return (
    <nav
      className={`${styles.rail} canvas-rail${pmRail ? " canvas-rail-pm" : ""}`}
      aria-label={RAIL_LABEL[section ?? "cost"]}
      style={{ width: expanded ? layout.railWidth : collapsedWidth }}
    >
      {pmRail ? null : <>
      {/*
        * `con_Left_Navigation_Header` with `icon_Left_Navigation_Expand` inside it, and
        * `rec_Left_Navigation_Expanded_Delimiter` as its own full-width rectangle below —
        * the canvas draws the line as a control, not as a border on the button.
        */}
      <div className="canvas-rail-header">
        <Tooltip content={expanded ? "Collapse menu" : "Expand menu"} relationship="label">
          <Button
            appearance="transparent"
            data-testid={EXPAND_TEST_ID}
            icon={<NavigationRegular />}
            aria-expanded={expanded}
            /*
             * Tosca rule 1. The `Tooltip relationship="label"` above already names this for a
             * screen reader, but it does so through `aria-labelledby` pointing at a tooltip
             * that only exists while hovered — nothing for a scanner to read at rest.
             */
            aria-label={expanded ? "Collapse menu" : "Expand menu"}
            onClick={() => setExpanded((v) => !v)}
          />
        </Tooltip>
      </div>
      <span className="canvas-rail-divider" aria-hidden="true" />
      </>}

      {pmRail && !expanded ? visible.map((item) =>
        /*
         * Collapsed PM/admin rail — `pcf_Left_Navigation_Menu.Items` (cmp_Left_Navigation:100-119,
         * the live formula; the one below it is commented out): `If(Not(IsExpanded), ForAll(Items,
         * {ItemKey, ItemDisplayName: "", ItemIconName, ItemEnabled, TargetScreen}), Items)`. The
         * records drop `ItemParentKey`, so the Nav gets a FLAT list: every screen link at the root
         * as its icon alone (no group chevron, no child indent, every group's links shown), and
         * each group header, which has no `ItemIconName`, as an empty row of the same height.
         * Rendering the grouped tree at 32 px clipped the indented icons and left the chevrons.
         */
        item.path
          ? <NavItemLink key={item.key} item={item} expanded={false} />
          : <span key={item.key} className="canvas-rail-blank" aria-hidden="true" />,
      ) : roots.map((item) => {
        const children = visible.filter((c) => c.parentKey === item.key);
        const isGroup = children.length > 0 && !item.path;
        const open = openGroups.has(item.key);

        if (isGroup) {
          return (
            <div key={item.key}>
              {/*
                * The group header shows the expand CHEVRON where its siblings show an icon, and
                * shows no icon of its own — see `Cost App - Left Panel.png`, where OPEX reads
                * "⌃ OPEX" against "📄 Land Lease" below it. Rendering `ItemIconName` here as
                * well, with the chevron pushed to the right, is what made this row the odd one.
                */}
              <Button
                appearance="transparent"
                data-testid={`rail-group-${item.key}`}
                className={styles.group}
                icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                iconPosition="before"
                aria-expanded={open}
                // Tosca rule 1 — and the label is not rendered at all on a collapsed rail,
                // so without this the group header has no accessible name there either.
                aria-label={item.label}
                onClick={() =>
                  setOpenGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.key)) next.delete(item.key);
                    else next.add(item.key);
                    return next;
                  })
                }
              >
                {expanded ? <span className={styles.label}>{item.label}</span> : null}
              </Button>
              {open
                ? children.map((child) => (
                    <NavItemLink key={child.key} item={child} indented expanded={expanded} />
                  ))
                : null}
            </div>
          );
        }

        return <NavItemLink key={item.key} item={item} expanded={expanded} />;
      })}

      {pmRail ? (
        /*
         * `con_Left_Navigation_Header` (45 high): `rec_Left_Navigation_Expanded_Delimiter`, a
         * 3 px #f3f2f1 line across its top; `Image2`, the 28 x 28 panel glyph at x 5; and
         * `lbl_Left_Navigation_Expand`, "Collapse Menu" at 11 pt in #2c2c2c. Image and the
         * transparent `icon_Left_Navigation_Expand` over it share `OnSelect: =OnExpand()`, which
         * flips `gblLeftNavigationMenuIsExpanded`. One button here; it keeps the existing test id.
         * The label is clipped away once the rail is 32 wide (`Width: =Parent.Width-38`).
         */
        <div className="canvas-rail-collapse">
          <span className="canvas-rail-collapse-delimiter" aria-hidden="true" />
          <Tooltip content={collapseTooltip(expanded)} relationship="description">
            <Button
              appearance="transparent"
              data-testid={EXPAND_TEST_ID}
              aria-expanded={expanded}
              aria-label="Collapse Menu"
              onClick={() => setExpanded((v) => !v)}
              icon={
                // 24 px wide, as the canvas glyph renders (screenshot, 28 Oct 2026).
                <svg width="24" height="12" viewBox="0 0 19 9" fill="none" aria-hidden="true">
                  <path d={expanded ? PANEL_COLLAPSE_PATH : PANEL_EXPAND_PATH} fill="#595959" />
                </svg>
              }
            >
              {expanded ? <span className="canvas-rail-collapse-label">{COLLAPSE_CAPTION}</span> : null}
            </Button>
          </Tooltip>
        </div>
      ) : null}
    </nav>
  );
}

function NavItemLink({
  item, indented = false, expanded,
}: { item: NavItem; indented?: boolean; expanded: boolean }) {
  const styles = useStyles();
  const { projectId } = useSession();
  const { pathname } = useLocation();
  if (!item.path) return null;
  const costPath = COST_PATHS.find((path) => path === item.path);
  const items = navItemsFor(railSection(pathname));
  // Project Management routes carry `?projectId=` exactly as the cost routes do.
  const to = costPath && projectId ? costLocation(costPath, projectId)
    : item.path.startsWith("/project/") && projectId
      ? { pathname: item.path, search: `?${new URLSearchParams({ projectId })}` }
      : item.path;
  return (
    <NavLink
      to={to}
      // The canvas `ItemKey` (configuration, stable across captions).
      data-testid={`rail-${item.key}`}
      aria-current={activeNavKey(pathname, items) === item.key ? "page" : undefined}
      className={() =>
        mergeClasses(
          styles.item,
          indented && styles.child,
          activeNavKey(pathname, items) === item.key && styles.itemSelected,
          !item.enabled && styles.disabled,
        )
      }
      aria-disabled={!item.enabled}
      // Tosca rule 1. `title` is a tooltip, not a name a scanner reads, and the label span is
      // not rendered on a collapsed rail — so the icon-only state had no name at all.
      aria-label={item.label}
      title={item.label}
    >
      {ICONS[item.icon]}
      {expanded ? <span className={styles.label}>{item.label}</span> : null}
    </NavLink>
  );
}
