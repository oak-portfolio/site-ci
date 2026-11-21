"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
    theme?: {
      light?: string;
      dark?: string;
    };
  };
};

type ChartContextProps = {
  config: ChartConfig;
};

const INITIAL_DIMENSION = { width: 320, height: 200 } as const;

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
  id?: string;
  initialDimension?: {
    width: number;
    height: number;
  };
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
};

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ id, className, children, config, initialDimension = INITIAL_DIMENSION, ...props }, ref) => {
    const uniqueId = React.useId();
    const chartId = `chart-${(id ?? uniqueId).replace(/[^a-zA-Z0-9_-]/g, "")}`;

    return (
      <ChartContext.Provider value={{ config }}>
        <div ref={ref} data-chart={chartId} className={cn("ui-chart", className)} {...props}>
          <ChartStyle id={chartId} config={config} />
          <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension} minHeight={0} minWidth={0}>
            {children}
          </RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    );
  },
);
ChartContainer.displayName = "ChartContainer";

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, itemConfig]) => itemConfig.theme || itemConfig.color);

  if (!colorConfig.length) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
[data-chart="${id}"] {
${colorConfig
  .map(([key, itemConfig]) => `  --color-${key}: ${itemConfig.theme?.dark ?? itemConfig.color};`)
  .join("\n")}
}
`,
      }}
    />
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type ChartTooltipContentProps = React.ComponentProps<"div"> & {
  active?: boolean;
  payload?: Array<Record<string, any>>;
  label?: React.ReactNode;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "line" | "dot" | "dashed";
  nameKey?: string;
  labelKey?: string;
  formatter?: (value: unknown, name: unknown, item: Record<string, any>, index: number) => React.ReactNode;
};

const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      nameKey,
      labelKey,
      formatter,
    },
    ref,
  ) => {
    const { config } = useChart();

    if (!active || !payload?.length) return null;

    const firstPayload = payload[0];
    const tooltipLabel = hideLabel
      ? null
      : getPayloadConfigFromPayload(config, firstPayload, labelKey ?? firstPayload?.dataKey ?? firstPayload?.name)?.label ?? label;

    return (
      <div ref={ref} className={cn("ui-chart-tooltip", className)}>
        {tooltipLabel && <div className="ui-chart-tooltip__label">{tooltipLabel}</div>}
        <div className="ui-chart-tooltip__items">
          {payload.map((item, index) => {
            const key = String(nameKey ? item.payload?.[nameKey] : item.dataKey ?? item.name ?? "value");
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const indicatorColor = item.payload?.fill ?? item.color ?? itemConfig?.color;

            return (
              <div key={`${key}-${item.value}`} className="ui-chart-tooltip__item">
                {formatter ? (
                  formatter(item.value, item.name, item, index)
                ) : (
                  <>
                    {!hideIndicator && (
                      <span
                        className={cn("ui-chart-tooltip__indicator", `ui-chart-tooltip__indicator--${indicator}`)}
                        style={{ backgroundColor: indicatorColor, borderColor: indicatorColor }}
                      />
                    )}
                    <span className="ui-chart-tooltip__name">{itemConfig?.label ?? item.name ?? key}</span>
                    {item.value !== undefined && <span className="ui-chart-tooltip__value">{item.value}</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
ChartTooltipContent.displayName = "ChartTooltipContent";

const ChartLegend = RechartsPrimitive.Legend;

type ChartLegendContentProps = React.ComponentProps<"div"> & {
  payload?: Array<Record<string, any>>;
  hideIcon?: boolean;
  nameKey?: string;
};

const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendContentProps>(
  ({ className, payload, hideIcon = false, nameKey, ...props }, ref) => {
    const { config } = useChart();

    if (!payload?.length) return null;

    return (
      <div ref={ref} className={cn("ui-chart-legend", className)} {...props}>
        {payload.map((item) => {
          const key = String(nameKey ? item.payload?.[nameKey] : item.dataKey ?? item.value ?? "value");
          const itemConfig = getPayloadConfigFromPayload(config, item, key);

          return (
            <div key={key} className="ui-chart-legend__item">
              {!hideIcon && (
                <span className="ui-chart-legend__swatch" style={{ backgroundColor: item.color ?? itemConfig?.color }} />
              )}
              <span>{itemConfig?.label ?? item.value}</span>
            </div>
          );
        })}
      </div>
    );
  },
);
ChartLegendContent.displayName = "ChartLegendContent";

function getPayloadConfigFromPayload(config: ChartConfig, payload: Record<string, any> | undefined, key: string) {
  if (!payload) return config[key];

  const payloadPayload = payload.payload;
  let configKey = key;

  if (typeof payload[key] === "string") {
    configKey = payload[key];
  }

  if (payloadPayload && typeof payloadPayload[key] === "string") {
    configKey = payloadPayload[key];
  }

  return config[configKey] ?? config[key];
}

export { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent };
