import { captureSurveillanceSnapshot, restoreSurveillanceSnapshot } from '../workspace-context.ts';
export type SurveillanceView = ReturnType<typeof captureSurveillanceSnapshot>;
export const emptyViews = (): SurveillanceView[] => [];
export function parseViews(value: unknown): SurveillanceView[] {
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some((s) => restoreSurveillanceSnapshot(s).error)
  )
    throw Error('Snapshot tampilan tidak sah.');
  if (new Set(value.map((s) => s.id)).size !== value.length)
    throw Error('ID snapshot tampilan duplikat.');
  return value;
}
