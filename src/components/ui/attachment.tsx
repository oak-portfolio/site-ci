import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Ported from the shadcn chat Attachment: one file row whose `state` mirrors the real upload status. */
export type AttachmentState = "idle" | "uploading" | "processing" | "error" | "done";
const AttachmentContext = React.createContext<AttachmentState>("idle");

/** Short decimal size for attachment descriptions, for example `1.8 MB`. */
export const formatFileSize = (bytes: number) =>
  bytes < 1000 ? `${bytes} B` : bytes < 1_000_000 ? `${(bytes / 1000).toFixed(1)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;

export const attachmentVariants = cva("ui-attachment", {
  variants: { size: { default: "", sm: "ui-attachment--sm" } },
  defaultVariants: { size: "default" },
});

export type AttachmentProps = React.ComponentProps<"div"> & VariantProps<typeof attachmentVariants> & { state?: AttachmentState };

export function Attachment({ className, size, state = "idle", ...props }: AttachmentProps) {
  return (
    <AttachmentContext.Provider value={state}>
      <div data-slot="attachment" data-state={state} className={cn(attachmentVariants({ size }), className)} {...props} />
    </AttachmentContext.Provider>
  );
}

/** The file's glyph. Children replace the resting icon (for example file-type art); a busy file shows the pixel loader and an error the alert glyph. */
export function AttachmentMedia({ className, icon = "documentCode", children, ...props }: React.ComponentProps<"span"> & { icon?: IconName }) {
  const state = React.useContext(AttachmentContext);
  const busy = state === "uploading" || state === "processing";
  const name: IconName = state === "error" ? "alert" : icon;
  return <span data-slot="attachment-media" aria-hidden="true" className={cn("ui-attachment__media", className)} {...props}>
    {busy ? <Spinner aria-hidden="true" /> : children && name === icon ? children : <Icon name={name} />}
  </span>;
}

export function AttachmentContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="attachment-content" className={cn("ui-attachment__content", className)} {...props} />;
}

export function AttachmentTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="attachment-title" className={cn("ui-attachment__title", className)} {...props} />;
}

export function AttachmentDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="attachment-description" className={cn("ui-attachment__description", className)} {...props} />;
}

export function AttachmentActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="attachment-actions" className={cn("ui-attachment__actions", className)} {...props} />;
}

/** Icon-only action; `label` names it for assistive tech and the tooltip-free title. */
export function AttachmentAction({ icon = "cancel", label, ...props }: Omit<React.ComponentProps<typeof Button>, "children"> & { icon?: IconName; label: string }) {
  return <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} {...props}><Icon name={icon} /></Button>;
}

export function AttachmentGroup({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="attachment-group" className={cn("ui-attachment-group", className)} {...props} />;
}

export type AttachmentDropzoneProps = Omit<React.ComponentProps<"div">, "title" | "onDrop"> & {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  icon?: IconName;
  /** A picture in place of the icon circle, for example the accepted file types. */
  media?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actionLabel: string;
  /** A glyph that leads the choose button, for example an upload. */
  actionIcon?: IconName;
};

/** Drop or choose files. Owns the only native file input; the visible Button opens it. */
export function AttachmentDropzone({ className, onFiles, accept, multiple, disabled, icon = "attachment", media, title, description, actionLabel, actionIcon, ...props }: AttachmentDropzoneProps) {
  const picker = React.useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = React.useState(false);
  return (
    <div data-slot="attachment-dropzone" data-dragging={dragging || undefined} data-disabled={disabled || undefined}
      className={cn("ui-attachment-dropzone", className)} {...props}
      onDragOver={event => { if (disabled) return; event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault(); setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (!disabled && files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}>
      {media ? <span className="ui-attachment-dropzone__media" aria-hidden="true">{media}</span>
        : <span className="ui-attachment-dropzone__icon" aria-hidden="true"><Icon name={icon} /></span>}
      <div className="ui-attachment-dropzone__text">
        <p className="ui-attachment-dropzone__title">{title}</p>
        {description ? <p className="ui-attachment-dropzone__description">{description}</p> : null}
      </div>
      <input ref={picker} type="file" multiple={multiple} accept={accept} className="sr-only" tabIndex={-1} aria-label={actionLabel}
        onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = "";
          if (files.length) onFiles(files);
        }} />
      <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => picker.current?.click()}>{actionIcon ? <Icon name={actionIcon} /> : null}{actionLabel}</Button>
    </div>
  );
}
