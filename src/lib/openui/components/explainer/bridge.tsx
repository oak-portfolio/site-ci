import * as React from "react";
import type { OakExplainerLink, OakExplainerTopic } from "@/data/oakExplainerTopics";
import { useScope } from "../../scope";

/** The one line that names Steve's work: "Where Steve used this" only for a record that names the topic, else "Related". */
export function ExplainerBridge({ topic }: { topic: OakExplainerTopic }) {
  const { renderLink } = useScope();
  const link = (row: OakExplainerLink) => <React.Fragment key={row.documentId}>{renderLink ? renderLink(row.page, row.name) : row.name}</React.Fragment>;
  const links = topic.used.flatMap((row, index) => index ? [", ", link(row)] : [link(row)]);
  if (!links.length && !topic.related) return null;
  return <p className="oak-explainer__bridge" data-bridge="">
    <span>{links.length ? <>Where Steve used this: {links}</> : <>Related: {link(topic.related!)}, {topic.related!.phrase}</>}</span></p>;
}
