/** SHM's departments, the fixed list chosen on 17 Nov 2026. Must match the database checks. */
export const DEPARTMENTS = ['TA', 'MKT', 'SCM', 'HR', 'ACC', 'LAW', 'FOOD', 'NF', 'PCB', 'BD', 'OTHERS'] as const
export type Department = (typeof DEPARTMENTS)[number]
