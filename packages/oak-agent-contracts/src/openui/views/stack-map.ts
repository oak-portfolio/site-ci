export type OakStackMapRecord = Readonly<{ name: string; stack: readonly string[] }>;
export type OakStackMapTool = Readonly<{ name: string; records: readonly string[] }>;

/**
 * StackMap's layout: each named tool once across the records (folded by case), with the records that list it, the shared
 * ones first and otherwise in page order. `venn` splits exactly two records' tools into only A, both and only B. Null under
 * 2 tools, where the block draws nothing of its own.
 */
export function oakStackMapView(records: readonly OakStackMapRecord[], named: (item: string) => boolean) {
  const tools = new Map<string, { name: string; records: string[] }>();
  for (const record of records) for (const item of record.stack) {
    if (!named(item)) continue;
    const key = item.toLowerCase();
    const tool = tools.get(key) ?? { name: item, records: [] };
    tools.set(key, tool);
    if (!tool.records.includes(record.name)) tool.records.push(record.name);
  }
  const list: OakStackMapTool[] = [...tools.values()].sort((one, other) => other.records.length - one.records.length);
  if (list.length < 2) return null;
  const [a, b] = records;
  const only = (name: string) => list.filter(tool => tool.records.length === 1 && tool.records[0] === name).map(tool => tool.name);
  const venn = records.length === 2 && a && b ? { a: a.name, b: b.name, onlyA: only(a.name), both: list.filter(tool => tool.records.length === 2).map(tool => tool.name), onlyB: only(b.name) } : null;
  return { tools: list, venn };
}
