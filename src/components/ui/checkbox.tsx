import * as React from "react";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { cva } from "class-variance-authority";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export const checkboxVariants = cva("ui-checkbox");

export type CheckboxProps = React.ComponentProps<typeof BaseCheckbox.Root>;

export const Checkbox = React.forwardRef<HTMLElement, CheckboxProps>(({ className, ...props }, ref) => (
  <BaseCheckbox.Root ref={ref} data-slot="checkbox" className={cn(checkboxVariants(), className as string)} {...props}>
    <BaseCheckbox.Indicator className="ui-checkbox__indicator">
      <Icon name="tick" />
    </BaseCheckbox.Indicator>
  </BaseCheckbox.Root>
));

Checkbox.displayName = "Checkbox";
