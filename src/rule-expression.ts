import { validCondition, conditionText, type Condition } from './analytics.ts';
export type Expression = Condition | { join: 'AND' | 'OR'; children: Expression[] };
export function validExpression(value: unknown, depth = 0): value is Expression {
  if (!value || typeof value !== 'object' || depth > 4) return false;
  if ('children' in value) {
    const g = value as { join: string; children: unknown[] };
    return (
      ['AND', 'OR'].includes(g.join) &&
      Array.isArray(g.children) &&
      g.children.length > 0 &&
      g.children.length <= 10 &&
      g.children.every((c) => validExpression(c, depth + 1))
    );
  }
  return validCondition(value as Condition);
}
export function expressionLeaves(e: Expression): Condition[] {
  return 'children' in e ? e.children.flatMap(expressionLeaves) : [e];
}
export function expressionText(e: Expression): string {
  return 'children' in e
    ? '(' + e.children.map(expressionText).join(` ${e.join} `) + ')'
    : conditionText(e);
}
export function matchExpression(e: Expression, match: (c: Condition) => boolean): boolean {
  return 'children' in e
    ? e.join === 'AND'
      ? e.children.every((c) => matchExpression(c, match))
      : e.children.some((c) => matchExpression(c, match))
    : match(e);
}
