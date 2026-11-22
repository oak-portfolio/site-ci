// node --test reporter: one JSON object, test file -> { seconds, passed }, from each file's own completion event.
import { relative, resolve } from 'node:path';

export default async function* timings(source) {
  const files = {};
  for await (const { type, data } of source) {
    if (type !== 'test:complete' || !data.file || resolve(data.name) !== data.file) continue;
    files[relative(process.cwd(), data.file)] = { seconds: Math.round(data.details.duration_ms / 100) / 10, passed: data.details.passed };
  }
  yield `${JSON.stringify(files, null, 1)}\n`;
}
