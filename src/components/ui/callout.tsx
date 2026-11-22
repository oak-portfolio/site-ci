import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

export const calloutVariants = cva("ui-callout", {
  variants: {
    variant: {
      default: "ui-callout--default",
      destructive: "ui-callout--destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

export type CalloutProps = Omit<React.ComponentProps<"div">, "title"> & VariantProps<typeof calloutVariants> & {
  icon?: IconName;
  title?: React.ReactNode;
};

/** A framed note for disclosures, limits and errors. Callers add `role="status"` or `role="alert"` when it announces a change. */
export function Callout({ className, variant, icon, title, children, ...props }: CalloutProps) {
  return (
    <div data-slot="callout" className={cn(calloutVariants({ variant }), className)} {...props}>
      {icon ? <span className="ui-callout__icon" aria-hidden="true"><Icon name={icon} /></span> : null}
      <div className="ui-callout__body">
        {title ? <p className="ui-callout__title">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
