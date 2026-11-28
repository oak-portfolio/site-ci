export type PublicCredentialStatement = Readonly<{
  text: string;
  citationUrl: string;
}>;

export type PublicCredentialRecord = Readonly<{
  title: string;
  statements: readonly PublicCredentialStatement[];
  publicQualifiers: readonly string[];
}>;

export function renderPublicCredentialSection(credentials: readonly PublicCredentialRecord[]) {
  if (credentials.length === 0) return "";
  const lines = ["## Public credentials", ""];
  for (const credential of credentials) {
    lines.push(`### ${credential.title}`, "");
    for (const statement of credential.statements) {
      lines.push(statement.text, "", `[Issuer source](${statement.citationUrl})`, "");
    }
    if (credential.publicQualifiers.length) {
      lines.push("Scope notes:", "", ...credential.publicQualifiers.map((qualifier) => `- ${qualifier}`), "");
    }
  }
  return lines.join("\n").trimEnd();
}
