// Compatibility overload for legacy callers that still pass document context.
// The parser itself intentionally uses only the first two arguments.
declare module './documentParser' {
  export function mapTableDataToMedicineItems(...args: any[]): any;
}
