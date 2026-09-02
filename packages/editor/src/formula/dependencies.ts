import type { FormulaAst, FormulaExpression, FormulaPropertyDefinition } from "./types.js";

export function collectFormulaDependencies(ast: FormulaAst | null | undefined): readonly string[] {
  if (!ast) return [];
  const ids = new Set<string>();
  const visit = (node: FormulaExpression): void => {
    if (node.kind === "property") ids.add(node.propertyId);
    else if (node.kind === "list") node.items.forEach(visit);
    else if (node.kind === "call") node.args.forEach(visit);
    else if (node.kind === "unary") visit(node.operand);
    else if (node.kind === "binary") { visit(node.left); visit(node.right); }
    else if (node.kind === "conditional") { visit(node.condition); visit(node.whenTrue); visit(node.whenFalse); }
  };
  visit(ast.expression);
  return [...ids].sort();
}

export type FormulaDependencyGraph = ReadonlyMap<string, readonly string[]>;

export function buildDependencyGraph(definitions: readonly FormulaPropertyDefinition[]): FormulaDependencyGraph {
  const known = new Set(definitions.filter((definition) => definition.deletedAt === null || definition.deletedAt === undefined).map((definition) => definition.id));
  return new Map(definitions
    .filter((definition) => definition.deletedAt === null || definition.deletedAt === undefined)
    .map((definition) => [definition.id, collectFormulaDependencies(definition.ast).filter((id) => known.has(id))]));
}

/** Tarjan SCC 결과에서 자기 참조와 다중 노드 순환만 돌려준다. */
export function detectCycles(graph: FormulaDependencyGraph): readonly (readonly string[])[] {
  let index = 0;
  const indexes = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  const cycles: string[][] = [];
  const visit = (node: string): void => {
    indexes.set(node, index); lowlinks.set(node, index); index += 1; stack.push(node); inStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      if (!indexes.has(next)) { visit(next); lowlinks.set(node, Math.min(lowlinks.get(node)!, lowlinks.get(next)!)); }
      else if (inStack.has(next)) lowlinks.set(node, Math.min(lowlinks.get(node)!, indexes.get(next)!));
    }
    if (lowlinks.get(node) !== indexes.get(node)) return;
    const component: string[] = [];
    while (true) { const current = stack.pop()!; inStack.delete(current); component.push(current); if (current === node) break; }
    if (component.length > 1 || (graph.get(node) ?? []).includes(node)) cycles.push(component.sort());
  };
  [...graph.keys()].sort().forEach((node) => { if (!indexes.has(node)) visit(node); });
  return cycles.sort((left, right) => left[0]!.localeCompare(right[0]!));
}
