import * as React from "react";
import { Meter as BaseMeter } from "@base-ui/react/meter";
import { cn } from "@/lib/utils";

/** Base UI Meter drawn as a small ring, rendered as spans so it can sit inside a button. The caller gives it an accessible name. */
export function MeterRing({ className, value, max = 100, ...props }: Omit<React.ComponentProps<typeof BaseMeter.Root>, "style">) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return <BaseMeter.Root render={<span />} data-slot="meter" className={cn("ui-meter-ring", className as string)} value={value} max={max}
    style={{ "--ui-meter-fraction": fraction } as React.CSSProperties} {...props}>
    <BaseMeter.Track render={<span />} className="ui-meter-ring__track" />
  </BaseMeter.Root>;
}

/** The same Base UI Meter as a thin horizontal bar; the indicator's width is the remaining share. The caller gives it an accessible name. */
export function MeterBar({ className, ...props }: React.ComponentProps<typeof BaseMeter.Root>) {
  return <BaseMeter.Root data-slot="meter" className={cn("ui-meter-bar", className as string)} {...props}>
    <BaseMeter.Track className="ui-meter-bar__track"><BaseMeter.Indicator className="ui-meter-bar__indicator" /></BaseMeter.Track>
  </BaseMeter.Root>;
}
