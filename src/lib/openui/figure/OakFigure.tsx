import * as React from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/Icon";

export type OakFigureItem = Readonly<{ label: string; value: string }>;

/**
 * Ticket 06 (O6): every chart and diagram renders inside this figure. The caption names it; the list of `items` is its
 * text equivalent, read by screen readers in place of the drawing and shown on "Show as list". With no items the drawing
 * stays readable and no switch appears.
 * `frame`: the child hides its own drawing and keeps its keyboard scroll frame readable, so the drawing wrapper stays unhidden.
 */
export function OakFigure({ caption, items, frame = false, children }: { caption: string; items: readonly OakFigureItem[]; frame?: boolean; children: React.ReactNode }) {
  const id = React.useId();
  const [list, setList] = React.useState(false);
  const equivalent = items.length > 0;
  return <figure className="oak-figure" aria-labelledby={`${id}-caption`} data-view={list ? "list" : "drawing"}>
    <div className="oak-figure__head">
      <figcaption id={`${id}-caption`} className="oak-figure__caption">{caption}</figcaption>
      {equivalent ? <Button type="button" variant="secondary" size="sm" aria-pressed={list} aria-controls={`${id}-list`}
        onClick={() => setList(open => !open)}><Icon name="checkList" size={16} />Show as list</Button> : null}
    </div>
    <div className="oak-figure__drawing" aria-hidden={(equivalent && !frame) || undefined} hidden={list}>{children}</div>
    {equivalent ? <dl id={`${id}-list`} className={list ? "oak-figure__list" : "oak-figure__list sr-only"}>
      {items.map((item, index) => <div key={index} className="oak-figure__row"><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
    </dl> : null}
  </figure>;
}

export type OakFigureBarsData = Readonly<{ caption: string; series: readonly string[]; rows: readonly Readonly<{ label: string; values: readonly number[] }>[] }>;

function valueOf(series: readonly string[], values: readonly number[]) {
  return values.flatMap((value, index) => value ? [`${series[index]}: ${value}`] : []).join(", ") || "0";
}

/** The list equivalent of a bar figure: one row per bar, its parts named in words. */
export const oakFigureBarItems = (data: OakFigureBarsData): OakFigureItem[] => data.rows.map(row => ({ label: row.label, value: valueOf(data.series, row.values) }));

/**
 * A stacked bar drawing for OakFigure: the gallery's two fixtures and the reference for later charts. Each bar is a row of
 * equal unit cells, so widths need no inline style; series 1 is solid, 2 hatched, 3 dotted, 4 striped, never color alone.
 * shortcut: one cell per unit suits counts up to about 50; a chart with larger totals scales its values first.
 */
export function OakFigureBars({ data }: { data: OakFigureBarsData }) {
  const max = Math.max(1, ...data.rows.map(row => row.values.reduce((sum, value) => sum + value, 0)));
  return <div className="oak-figure__bars">
    <ul className="oak-figure__legend">{data.series.map((name, index) => <li key={name}>
      <span className="oak-figure__mark oak-figure__key" data-series={index + 1} />{name}</li>)}</ul>
    {data.rows.map((row, rowIndex) => {
      const units = row.values.flatMap((value, index) => Array.from({ length: value }, () => index + 1));
      return <div key={rowIndex} className="oak-figure__bar-row">
        <p className="oak-figure__bar-head"><span>{row.label}</span><span className="oak-figure__bar-value">{valueOf(data.series, row.values)}</span></p>
        <span className="oak-figure__bar">
          {units.map((series, index) => <span key={index} className="oak-figure__mark" data-series={series} />)}
          {Array.from({ length: max - units.length }, (_, index) => <span key={`rest-${index}`} className="oak-figure__rest" />)}
        </span>
      </div>;
    })}
  </div>;
}
