/**
 * D143 (item 8a): when does an expanded WTG card count as a long list? A pure rule so it is tested, not guessed in the JSX.
 * A page of the turbine grid holds `GENERATORS_PAGE_SIZE` (30) rows at most; the card is skipped off screen from this many rows up
 * (a card of a few turbines is cheaper to render than to track).
 */
export const LONG_TURBINE_LIST_ROWS = 10;

export const isLongTurbineList = (rowCount: number): boolean => rowCount >= LONG_TURBINE_LIST_ROWS;
