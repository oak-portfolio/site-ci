import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/** Option picker. Pass `items` to Select so SelectValue shows the chosen label. */
export const Select = BaseSelect.Root;

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof BaseSelect.Trigger>) {
  return (
    <BaseSelect.Trigger data-slot="select-trigger" className={cn("ui-select__trigger", className as string)} {...props}>
      {children}
      <BaseSelect.Icon className="ui-select__icon"><Icon name="arrowDown" /></BaseSelect.Icon>
    </BaseSelect.Trigger>
  );
}

export function SelectValue({ className, ...props }: React.ComponentProps<typeof BaseSelect.Value>) {
  return <BaseSelect.Value data-slot="select-value" className={cn("ui-select__value", className as string)} {...props} />;
}

/** `container` keeps the list inside a modal workspace so its focus trap still applies. */
export function SelectContent({ className, children, container, ...props }: React.ComponentProps<typeof BaseSelect.Popup> & {
  container?: React.ComponentProps<typeof BaseSelect.Portal>["container"];
}) {
  return (
    <BaseSelect.Portal container={container}>
      <BaseSelect.Positioner className="ui-select__positioner" sideOffset={8} alignItemWithTrigger={false}>
        <BaseSelect.Popup data-slot="select-content" className={cn("ui-select__popup", className as string)} {...props}>
          <BaseSelect.List className="ui-select__list">{children}</BaseSelect.List>
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof BaseSelect.Item>) {
  return (
    <BaseSelect.Item data-slot="select-item" className={cn("ui-select__item", className as string)} {...props}>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
      <BaseSelect.ItemIndicator className="ui-select__indicator"><Icon name="checkmark" /></BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}
