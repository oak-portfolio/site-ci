import * as React from "react";
import { Field as BaseField } from "@base-ui/react/field";
import { cn } from "@/lib/utils";

/** Label, control, description and error share one id set through Base UI Field. */
export function Field({ className, ...props }: React.ComponentProps<typeof BaseField.Root>) {
  return <BaseField.Root data-slot="field" className={cn("ui-field", className as string)} {...props} />;
}

export function FieldLabel({ className, ...props }: React.ComponentProps<typeof BaseField.Label>) {
  return <BaseField.Label data-slot="field-label" className={cn("ui-field__label", className as string)} {...props} />;
}

export const FieldControl = BaseField.Control;

export function FieldDescription({ className, ...props }: React.ComponentProps<typeof BaseField.Description>) {
  return <BaseField.Description data-slot="field-description" className={cn("ui-field__description", className as string)} {...props} />;
}

export function FieldError({ className, ...props }: React.ComponentProps<typeof BaseField.Error>) {
  return <BaseField.Error data-slot="field-error" className={cn("ui-field__error", className as string)} {...props} />;
}

/**
 * A "used / limit" counter (inline, not a helper line). List its id in the control's aria-describedby so the limit is read
 * out. `quiet` keeps it for assistive tech only until the text reaches 80% of the limit, as iOS fields do.
 */
export function FieldCount({ id, value, limit, unit, quiet = false }: { id: string; value: number; limit: number; unit?: string; quiet?: boolean }) {
  return <span id={id} data-slot="field-count" data-quiet={quiet && value < limit * 0.8 ? "" : undefined}>
    {value.toLocaleString("en-US")} / {limit.toLocaleString("en-US")}{unit ? ` ${unit}` : ""}
  </span>;
}
