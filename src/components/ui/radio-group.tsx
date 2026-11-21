import * as React from "react";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { Radio as BaseRadio } from "@base-ui/react/radio";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/** One choice among a few. Arrow keys move between options; Base UI owns roving focus and the hidden input. */
export function RadioGroup({ className, ...props }: React.ComponentProps<typeof BaseRadioGroup>) {
  return <BaseRadioGroup data-slot="radio-group" className={cn("ui-radio-group", className as string)} {...props} />;
}

/** A labeled card option: icon, title, one short description and the selection dot. */
export function RadioCard({ className, icon, media, title, description, ...props }: React.ComponentProps<typeof BaseRadio.Root> & {
  icon?: IconName;
  /** A picture in the icon's place, such as a provider's bundled favicon. Decorative; the title names it. */
  media?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <BaseRadio.Root data-slot="radio-card" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
      className={cn("ui-radio-card", className as string)} {...props}>
      {media || icon ? <span className="ui-radio-card__icon" data-media={media ? "" : undefined} aria-hidden="true">{media ?? <Icon name={icon!} />}</span> : null}
      <span className="ui-radio-card__text">
        <span id={`${id}-title`} className="ui-radio-card__title">{title}</span>
        {description ? <span id={`${id}-description`} className="ui-radio-card__description">{description}</span> : null}
      </span>
      <span className="ui-radio-card__dot" aria-hidden="true"><BaseRadio.Indicator className="ui-radio-card__indicator" /></span>
    </BaseRadio.Root>
  );
}

/** A short text option in a segmented row of a RadioGroup. */
export function RadioSegment({ className, ...props }: React.ComponentProps<typeof BaseRadio.Root>) {
  return <BaseRadio.Root data-slot="radio-segment" className={cn("ui-radio-segment", className as string)} {...props} />;
}
