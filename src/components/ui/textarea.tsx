import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const textareaVariants = cva("ui-textarea", {
  variants: {
    variant: {
      default: "ui-textarea--default",
      bare: "ui-textarea--bare",
    },
  },
  defaultVariants: { variant: "default" },
});

export type TextareaProps = React.ComponentProps<"textarea"> & { variant?: "default" | "bare" };

/** Multi-line text field. Inside a Field, pass it as `render` to FieldControl. `bare` drops the frame for prompt bars. */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, variant, ...props }, ref) => (
  <textarea ref={ref} data-slot="textarea" className={cn(textareaVariants({ variant }), className)} {...props} />
));

Textarea.displayName = "Textarea";
