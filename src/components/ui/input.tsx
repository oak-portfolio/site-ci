import * as React from "react";
import { Input as BaseInput } from "@base-ui/react/input";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const inputVariants = cva("ui-input");

export type InputProps = React.ComponentProps<typeof BaseInput>;

/** Single-line text field. Inside a Field it registers as the field control. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <BaseInput ref={ref} data-slot="input" className={cn(inputVariants(), className as string)} {...props} />
));

Input.displayName = "Input";
