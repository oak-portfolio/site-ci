"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type WorkChartType = "line" | "area" | "bar" | "donut" | "pie" | "radar" | "radial";
export type WorkChartFormat = "raw" | "number" | "compact" | "percent";
export type WorkChartValue = string | number | null | undefined;
export type WorkChartDatum = Record<string, WorkChartValue>;

export type WorkChartSeries = {
  key: string;
  label: string;
  color?: string;
  tone?: "blue" | "pale-blue" | "green" | "amber" | "orange" | "muted";
  stackId?: string;
};

type Props = {
  type: WorkChartType;
  data: WorkChartDatum[];
  series: WorkChartSeries[];
  xKey?: string;
  categoryKey?: string;
  valueKey?: string;
  stacked?: boolean;
  maxValue?: number;
  unit?: string;
  valueFormatter?: WorkChartFormat;
  axisFormatter?: WorkChartFormat;
  centerLabel?: string;
  centerValue?: string;
  orientation?: "horizontal" | "vertical";
  yAxisLabel?: string;
  ticks?: number[];
};

const toneColors: Record<NonNullable<WorkChartSeries["tone"]>, string> = {
  blue: "var(--work-chart-blue-2)",
  "pale-blue": "var(--work-chart-blue-1)",
  green: "var(--work-chart-green)",
  amber: "var(--work-chart-amber)",
  orange: "var(--work-chart-orange)",
  muted: "var(--work-chart-muted)",
};

const defaultSeriesColors = [
  "var(--work-chart-blue-1)",
  "var(--work-chart-blue-2)",
  "var(--work-chart-peach)",
  "var(--work-chart-orange)",
  "var(--work-chart-green)",
  "var(--work-chart-amber)",
];

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const numeric = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function formatChartValue(value: unknown, format: WorkChartFormat = "number", unit?: string) {
  if (value === null || value === undefined) return "";
  if (format === "raw") return `${value}${unit ? ` ${unit}` : ""}`;

  const numeric = toNumber(value);
  const formatted =
    format === "compact"
      ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(numeric)
      : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(numeric);

  if (format === "percent") return `${formatted}%`;
  return unit ? `${formatted}${unit}` : formatted;
}

function getSeriesColor(series: WorkChartSeries, index: number) {
  return series.color ?? (series.tone ? toneColors[series.tone] : defaultSeriesColors[index % defaultSeriesColors.length]);
}

function getDatumFill(datum: WorkChartDatum, fallback: string) {
  const explicitFill = datum.fill;
  if (typeof explicitFill === "string") return explicitFill;

  const tone = datum.tone;
  if (typeof tone === "string" && tone in toneColors) return toneColors[tone as keyof typeof toneColors];

  return fallback;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(() => {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(query.matches);

    updatePreference();
    query.addEventListener("change", updatePreference);
    return () => query.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

type AxisTickProps = {
  x?: number;
  y?: number;
  payload?: {
    value?: unknown;
  };
};

function splitAxisLabel(value: unknown) {
  const label = value === null || value === undefined ? "" : String(value);
  if (label.length <= 11) return [label];

  const words = label.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [label];
  if (words.length === 2) return words;

  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

function WrappedCategoryTick({ x = 0, y = 0, payload }: AxisTickProps) {
  const lines = splitAxisLabel(payload?.value);

  return (
    <g transform={`translate(${x},${y})`}>
      <text className="work-chart-graphic__category-tick" textAnchor="middle">
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={0} dy={index === 0 ? 14 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function WrappedPolarTick({ x = 0, y = 0, payload }: AxisTickProps) {
  const rawValue = String(payload?.value ?? "");
  const lines = splitAxisLabel(rawValue);
  const normalizedLabel = rawValue.toLowerCase();
  const isRightSide = normalizedLabel.includes("ask") || normalizedLabel.includes("approval");
  const isLeftSide = normalizedLabel.includes("oak") || normalizedLabel.includes("override") || normalizedLabel.includes("stop");
  const xOffset = isRightSide ? 24 : isLeftSide ? -24 : 0;
  const textAnchor = isRightSide ? "start" : isLeftSide ? "end" : "middle";

  return (
    <g transform={`translate(${x + xOffset},${y})`}>
      <text className="work-chart-graphic__polar-tick" textAnchor={textAnchor} dominantBaseline="middle">
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={0} dy={index === 0 ? 0 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function buildChartConfig(series: WorkChartSeries[]) {
  return series.reduce<ChartConfig>((config, item, index) => {
    config[item.key] = {
      label: item.label,
      color: getSeriesColor(item, index),
    };
    return config;
  }, {});
}

function getPrimarySeries(series: WorkChartSeries[], valueKey?: string) {
  return series[0] ?? { key: valueKey ?? "value", label: "Value", tone: "pale-blue" as const };
}

type TooltipPayload = {
  value?: unknown;
  name?: string | number;
  dataKey?: string | number;
  color?: string;
  payload?: WorkChartDatum;
};

type WorkChartTooltipProps = {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: React.ReactNode;
  labelKey?: string;
  seriesLabelMap: Map<string, string>;
  formatValue: (value: unknown) => string;
  showSeriesName?: boolean;
};

function WorkChartTooltip({
  active,
  payload,
  label,
  labelKey,
  seriesLabelMap,
  formatValue,
  showSeriesName = true,
}: WorkChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const datum = payload[0]?.payload;
  const datumLabel = labelKey && datum?.[labelKey] !== undefined ? datum[labelKey] : undefined;
  const tooltipLabel = datumLabel ?? label;
  const detail = typeof datum?.detail === "string" ? datum.detail : undefined;
  const hasMultipleItems = payload.length > 1;

  return (
    <div className="ui-chart-tooltip ui-chart-tooltip--work">
      {tooltipLabel && <div className="ui-chart-tooltip__label">{tooltipLabel}</div>}
      <div className="ui-chart-tooltip__items">
        {payload.map((item, index) => {
          const key = String(item.dataKey ?? item.name ?? index);
          const name = seriesLabelMap.get(key) ?? String(item.name ?? key);

          const isValueOnly = !hasMultipleItems && !showSeriesName;
          const indicatorColor = getDatumFill(item.payload ?? {}, typeof item.color === "string" ? item.color : "currentColor");

          return (
            <div key={`${key}-${index}`} className={`ui-chart-tooltip__item${isValueOnly ? " ui-chart-tooltip__item--value-only" : ""}`}>
              <span
                className="ui-chart-tooltip__indicator ui-chart-tooltip__indicator--dot"
                style={{ backgroundColor: indicatorColor, borderColor: indicatorColor }}
              />
              {(hasMultipleItems || showSeriesName) && <span className="ui-chart-tooltip__name">{name}</span>}
              <span className="ui-chart-tooltip__value">{formatValue(item.value)}</span>
            </div>
          );
        })}
      </div>
      {detail && <div className="ui-chart-tooltip__detail">{detail}</div>}
    </div>
  );
}

export default function WorkChartGraphic({
  type,
  data,
  series,
  xKey,
  categoryKey = "label",
  valueKey,
  stacked = false,
  maxValue,
  unit,
  valueFormatter = "number",
  axisFormatter = "raw",
  centerLabel,
  centerValue,
  orientation = "horizontal",
  yAxisLabel,
  ticks,
}: Props) {
  const normalizedSeries = React.useMemo(() => {
    return series.length ? series : [getPrimarySeries(series, valueKey)];
  }, [series, valueKey]);
  const chartConfig = React.useMemo(() => buildChartConfig(normalizedSeries), [normalizedSeries]);
  const primarySeries = getPrimarySeries(normalizedSeries, valueKey);
  const primaryColor = getSeriesColor(primarySeries, 0);
  const horizontalKey = xKey ?? categoryKey;
  const resolvedValueKey = valueKey ?? primarySeries.key;
  const valueDomain: [number, number | "dataMax"] = [0, maxValue ?? "dataMax"];
  const formatValue = React.useCallback((value: unknown) => formatChartValue(value, valueFormatter, unit), [unit, valueFormatter]);
  const formatAxis = React.useCallback((value: unknown) => formatChartValue(value, axisFormatter), [axisFormatter]);
  const formatCategoryAxis = React.useCallback(
    (value: unknown) => {
      if (axisFormatter === "raw") return formatChartValue(value, "raw");
      if (typeof value === "number") return formatAxis(value);
      if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.replace(/,/g, ""))) return formatAxis(value);
      return value === null || value === undefined ? "" : String(value);
    },
    [axisFormatter, formatAxis],
  );
  const seriesLabelMap = React.useMemo(() => {
    return new Map(normalizedSeries.map((item) => [item.key, item.label]));
  }, [normalizedSeries]);
  const chartInstanceId = React.useId().replace(/:/g, "");
  const prefersReducedMotion = usePrefersReducedMotion();
  const chartAnimationDuration = prefersReducedMotion ? 0 : 900;
  const isChartAnimationActive = !prefersReducedMotion;

  if (type === "bar") {
    const isHorizontal = orientation === "horizontal";
    const chartMargin = isHorizontal ? { top: 12, right: 42, bottom: 26, left: 10 } : { top: 18, right: 22, bottom: 18, left: 10 };

    return (
      <ChartContainer config={chartConfig} className="work-chart-graphic work-chart-graphic--bar">
        <BarChart data={data} layout={isHorizontal ? "vertical" : undefined} margin={chartMargin} accessibilityLayer>
          <CartesianGrid horizontal={!isHorizontal} vertical={isHorizontal} />
          {isHorizontal ? (
            <>
              <XAxis type="number" domain={valueDomain} ticks={ticks} tickFormatter={formatAxis} tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis dataKey={categoryKey} type="category" width={168} tickLine={false} axisLine={false} tickMargin={14} />
            </>
          ) : (
            <>
              <XAxis dataKey={categoryKey} tick={<WrappedCategoryTick />} tickLine={false} axisLine={false} tickMargin={8} interval={0} height={48} />
              <YAxis domain={valueDomain} ticks={ticks} tickFormatter={formatAxis} tickLine={false} axisLine={false} tickMargin={10}>
                {yAxisLabel && <Label value={yAxisLabel} angle={-90} position="insideLeft" className="work-chart-graphic__axis-label" />}
              </YAxis>
            </>
          )}
          <ChartTooltip
            cursor={{ fill: "rgba(255, 255, 255, 0.045)" }}
            content={
              <WorkChartTooltip
                labelKey={categoryKey}
                seriesLabelMap={seriesLabelMap}
                formatValue={formatValue}
                showSeriesName={normalizedSeries.length > 1}
              />
            }
          />
          {normalizedSeries.map((item, index) => {
            const color = getSeriesColor(item, index);
            return (
              <Bar
                key={item.key}
                dataKey={item.key}
                stackId={stacked ? item.stackId ?? "stack" : undefined}
                fill={`var(--color-${item.key})`}
                barSize={isHorizontal ? 20 : 24}
                radius={isHorizontal ? [0, 7, 7, 0] : [7, 7, 0, 0]}
                background={normalizedSeries.length === 1 ? { fill: "rgba(255, 255, 255, 0.055)", radius: 7 } : undefined}
                isAnimationActive={isChartAnimationActive}
                animationDuration={chartAnimationDuration}
                animationEasing="ease-out"
              >
                {normalizedSeries.length === 1 && data.map((datum, cellIndex) => <Cell key={`${item.key}-${cellIndex}`} fill={getDatumFill(datum, color)} />)}
                {normalizedSeries.length === 1 && <LabelList dataKey={item.key} position={isHorizontal ? "right" : "top"} formatter={formatValue} />}
              </Bar>
            );
          })}
          {normalizedSeries.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        </BarChart>
      </ChartContainer>
    );
  }

  if (type === "line") {
    return (
      <ChartContainer config={chartConfig} className="work-chart-graphic work-chart-graphic--line">
        <AreaChart data={data} margin={{ top: 18, right: 34, bottom: 22, left: 16 }} accessibilityLayer>
          <defs>
            {normalizedSeries.map((item) => {
              const gradientId = `work-line-gradient-${chartInstanceId}-${item.key}`;
              return (
                <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={`var(--color-${item.key})`} stopOpacity={0.28} />
                  <stop offset="58%" stopColor={`var(--color-${item.key})`} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={`var(--color-${item.key})`} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={horizontalKey} tick={<WrappedCategoryTick />} tickFormatter={formatCategoryAxis} tickLine={false} axisLine={false} tickMargin={8} interval={0} height={46} />
          <YAxis domain={valueDomain} ticks={ticks} tickFormatter={formatAxis} tickLine={false} axisLine={false} tickMargin={10}>
            {yAxisLabel && <Label value={yAxisLabel} angle={-90} position="insideLeft" className="work-chart-graphic__axis-label" />}
          </YAxis>
          <ChartTooltip
            cursor={{ stroke: "rgba(255, 255, 255, 0.16)" }}
            content={
              <WorkChartTooltip
                labelKey={horizontalKey}
                seriesLabelMap={seriesLabelMap}
                formatValue={formatValue}
                showSeriesName={normalizedSeries.length > 1}
              />
            }
          />
          {normalizedSeries.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
          {normalizedSeries.map((item, index) => {
            const gradientId = `work-line-gradient-${chartInstanceId}-${item.key}`;
            return (
              <Area
                key={item.key}
                dataKey={item.key}
                type="linear"
                fill={`url(#${gradientId})`}
                fillOpacity={1}
                stroke={`var(--color-${item.key})`}
                strokeWidth={2}
                dot={{ r: 3.6, fill: getSeriesColor(item, index), strokeWidth: 0 }}
                activeDot={{ r: 4.8, strokeWidth: 0 }}
                isAnimationActive={isChartAnimationActive}
                animationDuration={chartAnimationDuration}
                animationEasing="ease-out"
              />
            );
          })}
        </AreaChart>
      </ChartContainer>
    );
  }

  if (type === "area") {
    return (
      <ChartContainer config={chartConfig} className="work-chart-graphic work-chart-graphic--area">
        <AreaChart data={data} margin={{ top: 18, right: 24, bottom: 26, left: 8 }} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={horizontalKey} tickFormatter={formatCategoryAxis} tickLine={false} axisLine={false} tickMargin={10} />
          <YAxis domain={valueDomain} ticks={ticks} tickFormatter={formatAxis} tickLine={false} axisLine={false} tickMargin={10}>
            {yAxisLabel && <Label value={yAxisLabel} angle={-90} position="insideLeft" className="work-chart-graphic__axis-label" />}
          </YAxis>
          <ChartTooltip
            cursor={{ stroke: "rgba(255, 255, 255, 0.16)" }}
            content={<WorkChartTooltip seriesLabelMap={seriesLabelMap} formatValue={formatValue} />}
          />
          {normalizedSeries.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
          {normalizedSeries.map((item) => (
            <Area
              key={item.key}
              dataKey={item.key}
              type="monotone"
              fill={`var(--color-${item.key})`}
              fillOpacity={0.24}
              stroke={`var(--color-${item.key})`}
              strokeWidth={2}
              stackId={stacked ? item.stackId ?? "stack" : undefined}
              isAnimationActive={isChartAnimationActive}
              animationDuration={chartAnimationDuration}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ChartContainer>
    );
  }

  if (type === "donut" || type === "pie") {
    const total = data.reduce((sum, datum) => sum + toNumber(datum[resolvedValueKey]), 0);
    const showDonut = type === "donut";
    const legendItems = data.map((datum, index) => ({
      key: String(datum[categoryKey] ?? index),
      label: String(datum[categoryKey] ?? "Item"),
      color: getDatumFill(datum, defaultSeriesColors[index % defaultSeriesColors.length]),
      value: datum[resolvedValueKey],
    }));

    return (
      <div className="work-chart-graphic work-chart-graphic--donut-layout">
        <ChartContainer config={chartConfig} className="work-chart-graphic__donut-canvas">
          <PieChart accessibilityLayer>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey={categoryKey} />} />
            <Pie
              data={data}
              dataKey={resolvedValueKey}
              nameKey={categoryKey}
              innerRadius={showDonut ? "58%" : 0}
              outerRadius="82%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={showDonut ? 1 : 0}
              stroke="rgba(5, 5, 5, 0.9)"
              strokeWidth={1}
              isAnimationActive={isChartAnimationActive}
              animationDuration={chartAnimationDuration}
              animationEasing="ease-out"
            >
              {data.map((datum, index) => (
                <Cell key={`${datum[categoryKey] ?? index}`} fill={getDatumFill(datum, defaultSeriesColors[index % defaultSeriesColors.length])} />
              ))}
              {showDonut && (
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="work-chart-graphic__center-value">
                          {centerValue ?? formatValue(total)}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 24} className="work-chart-graphic__center-label">
                          {centerLabel ?? "Total"}
                        </tspan>
                      </text>
                    );
                  }}
                />
              )}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="work-chart-graphic__legend" aria-label="Chart legend">
          {legendItems.map((item) => (
            <span key={item.key} className="work-chart-graphic__legend-item">
              <span className="work-chart-graphic__legend-swatch" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (type === "radar") {
    return (
      <div className="work-chart-graphic work-chart-graphic--radar">
        <ChartContainer config={chartConfig} className="work-chart-graphic__radar-canvas">
          <RadarChart data={data} outerRadius="68%" margin={{ top: 18, right: 96, bottom: 48, left: 96 }} accessibilityLayer>
            <ChartTooltip
              cursor={false}
              content={<WorkChartTooltip labelKey={categoryKey} seriesLabelMap={seriesLabelMap} formatValue={formatValue} />}
            />
            <PolarAngleAxis dataKey={categoryKey} tick={<WrappedPolarTick />} tickLine={false} tickSize={28} />
            <PolarRadiusAxis angle={90} domain={[0, maxValue ?? "dataMax"]} tick={false} tickLine={false} axisLine={false} />
            <PolarGrid radialLines />
            {normalizedSeries.map((item, index) => (
              <Radar
                key={item.key}
                dataKey={item.key}
                stroke={`var(--color-${item.key})`}
                strokeWidth={2}
                fill={`var(--color-${item.key})`}
                fillOpacity={index === 0 ? 0.34 : 0.14}
                dot={{ r: 4, fill: getSeriesColor(item, index), fillOpacity: 1, stroke: "rgba(5, 5, 5, 0.92)", strokeWidth: 1.3 }}
                activeDot={{ r: 5.2, fill: getSeriesColor(item, index), stroke: "rgba(5, 5, 5, 0.92)", strokeWidth: 1.3 }}
                isAnimationActive={isChartAnimationActive}
                animationDuration={chartAnimationDuration}
                animationEasing="ease-out"
              />
            ))}
          </RadarChart>
        </ChartContainer>
        <div className="work-chart-graphic__legend" aria-label="Team contribution legend">
          {normalizedSeries.map((item, index) => (
            <span key={item.key} className="work-chart-graphic__legend-item">
              <span className="work-chart-graphic__legend-swatch" style={{ backgroundColor: getSeriesColor(item, index) }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const radialValue = toNumber(data[0]?.[resolvedValueKey]);
  const radialMax = maxValue ?? 100;

  return (
    <ChartContainer config={chartConfig} className="work-chart-graphic work-chart-graphic--radial">
      <RadialBarChart data={data.slice(0, 1)} startAngle={90} endAngle={-270} innerRadius="72%" outerRadius="88%" accessibilityLayer>
        <PolarAngleAxis type="number" domain={[0, radialMax]} tick={false} />
        <RadialBar
          dataKey={resolvedValueKey}
          fill={primaryColor}
          background
          cornerRadius={10}
          isAnimationActive={isChartAnimationActive}
          animationDuration={chartAnimationDuration}
          animationEasing="ease-out"
        />
        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={viewBox.cy} className="work-chart-graphic__center-value">
                    {centerValue ?? formatValue(radialValue)}
                  </tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 24} className="work-chart-graphic__center-label">
                    {centerLabel ?? primarySeries.label}
                  </tspan>
                </text>
              );
            }}
          />
        </PolarRadiusAxis>
      </RadialBarChart>
    </ChartContainer>
  );
}
