import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";
import { oakExplainerProjects, oakExplainerTopic, oakExplainerTopics, type OakExplainerTopic } from "@/data/oakExplainerTopics";
import { OakFigure } from "../../figure/OakFigure";
import { ExplainerBridge } from "./bridge";

const ROW = 36;
const wireOf = (from: number, to: number) => {
  const a = from * ROW + ROW / 2, b = ((oakExplainerTopics.length - oakExplainerProjects.length) / 2 + to) * ROW + ROW / 2;
  return `M0 ${a} C50 ${a} 50 ${b} 100 ${b}`;
};
const wires = oakExplainerTopics.flatMap((topic, from) => topic.used.map(link =>
  ({ topic: topic.id, key: `${topic.id}-${link.documentId}`, d: wireOf(from, oakExplainerProjects.findIndex(row => row.documentId === link.documentId)) })));
const rowText = (topic: OakExplainerTopic) => topic.used.length ? `Used in ${topic.used.map(link => link.name).join(", ")}`
  : `Related: ${topic.related!.name}, ${topic.related!.phrase}`;

/**
 * The index of every topic: the drawing wires topics to the case studies whose stack or system map names them, and its list
 * says each wire in words. The topic buttons are the keyboard surface; the panel explains the selected topic.
 */
export function TopicMap({ selected, titleId }: { selected: string; titleId: string }) {
  const [current, setCurrent] = React.useState(selected);
  const topic = oakExplainerTopic(current);
  return <>
    <h3 id={titleId} className="oak-explainer__title">Topics Oak can explain</h3>
    <div className="oak-explainer__map" data-bridge="">
      <OakFigure caption="Topics and the work that uses them" items={oakExplainerTopics.map(row => ({ label: row.name, value: rowText(row) }))}>
        <div className="oak-explainer__graph">
          <ul className="oak-explainer__nodes">{oakExplainerTopics.map(row => <li key={row.id} data-selected={row.id === topic.id ? "" : undefined}>
            <span className="oak-explainer__dot"><Icon name={row.icon} size={14} /></span>{row.name}</li>)}</ul>
          <span className="oak-explainer__wire-box">
            <svg className="oak-explainer__wires" viewBox={`0 0 100 ${oakExplainerTopics.length * ROW}`} preserveAspectRatio="none" role="presentation" focusable="false">
              {wires.map(wire => <path key={wire.key} d={wire.d} data-selected={wire.topic === topic.id ? "" : undefined} />)}
            </svg>
          </span>
          <ul className="oak-explainer__projects">{oakExplainerProjects.map(row => <li key={row.documentId}
            data-selected={topic.used.some(link => link.documentId === row.documentId) ? "" : undefined}>{row.name}</li>)}</ul>
        </div>
      </OakFigure>
    </div>
    <div className="oak-explainer__topics" role="group" aria-label="Topics">{oakExplainerTopics.map(row =>
      <Button key={row.id} type="button" variant="secondary" size="sm" aria-pressed={row.id === topic.id} onClick={() => setCurrent(row.id)}>
        <Icon name={row.icon} size={14} />{row.name}</Button>)}</div>
    <div className="oak-explainer__panel">
      <h4 className="oak-explainer__topic">{topic.name}</h4>
      <p className="oak-explainer__summary">{topic.summary}</p>
      <ExplainerBridge topic={topic} />
    </div>
  </>;
}
