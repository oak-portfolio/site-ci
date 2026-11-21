import * as React from "react";
import { Questionnaire as Base } from "@shadcn/react/questionnaire";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";

/** Picking a single choice moves on after this long, as in beautiful-ui ApprovalCard; a delay, not motion, so it holds under reduced motion. */
const advanceDelay = 480;

/**
 * One structured question at a time with progress, letter shortcuts and Previous, Skip, Next and Submit. Ported from shadcn Questionnaire.
 * Choosing a radio answer presses the visible Next after 480ms; any other key or pointer input first cancels it, and the last question,
 * which has no Next, never moves by itself.
 */
export function Questionnaire({ className, ...props }: React.ComponentProps<typeof Base.Root>) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = () => clearTimeout(timer.current);
  React.useEffect(() => cancel, []);
  return <Base.Root data-slot="questionnaire" className={cn("ui-questionnaire", className)}
    // Capture runs before the primitive's letter shortcut clicks a choice, so the shortcut's own change schedules a fresh advance.
    onKeyDownCapture={cancel} onPointerDownCapture={cancel}
    onChangeCapture={event => {
      cancel();
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "radio" || !input.checked) return;
      const form = event.currentTarget;
      timer.current = setTimeout(() => {
        const next = form.querySelector<HTMLButtonElement>('[data-slot="questionnaire-nav"] [data-questionnaire-next][data-visible]');
        if (next && !next.disabled) next.click();
      }, advanceDelay);
    }} {...props} />;
}

export function QuestionnaireProgress({ className, ...props }: React.ComponentProps<typeof Base.Progress>) {
  return <Base.Progress data-slot="questionnaire-progress" className={cn("ui-questionnaire__progress", className as string)} {...props} />;
}

export function QuestionnaireItem({ className, ...props }: React.ComponentProps<typeof Base.Item>) {
  return <Base.Item data-slot="questionnaire-item" className={cn("ui-questionnaire__item", className)} {...props} />;
}

export function QuestionnaireTitle({ className, ...props }: React.ComponentProps<typeof Base.Title>) {
  return <Base.Title data-slot="questionnaire-title" className={cn("ui-questionnaire__title", className as string)} {...props} />;
}

export function QuestionnaireDescription({ className, ...props }: React.ComponentProps<typeof Base.Description>) {
  return <Base.Description data-slot="questionnaire-description" className={cn("ui-questionnaire__description", className as string)} {...props} />;
}

export function QuestionnaireChoices({ className, ...props }: React.ComponentProps<typeof Base.Choices>) {
  return <Base.Choices data-slot="questionnaire-choices" className={cn("ui-questionnaire__choices", className as string)} {...props} />;
}

/** A selectable card: visually hidden native input, an optional semantic icon, label, letter shortcut and a check when chosen. */
export function QuestionnaireChoice({ className, children, icon, ...props }: React.ComponentProps<typeof Base.Choice> & { icon?: IconName }) {
  return (
    <Base.Choice data-slot="questionnaire-choice" className={cn("ui-questionnaire__choice", className as string)} {...props}>
      <Base.ChoiceInput className="ui-questionnaire__choice-input" />
      {icon ? <span className="ui-questionnaire__icon" aria-hidden="true"><Icon name={icon} /></span> : null}
      <Base.ChoiceShortcut className="ui-questionnaire__shortcut" />
      <Base.ChoiceLabel className="ui-questionnaire__choice-label">{children}</Base.ChoiceLabel>
      <span className="ui-questionnaire__check" aria-hidden="true"><Icon name="checkmark" /></span>
    </Base.Choice>
  );
}

export function QuestionnaireInput({ className, ...props }: React.ComponentProps<typeof Base.Input>) {
  return <Base.Input data-slot="questionnaire-input" className={cn("ui-questionnaire__input", className as string)} {...props} />;
}

export function QuestionnaireError({ className, ...props }: React.ComponentProps<typeof Base.Error>) {
  return <Base.Error data-slot="questionnaire-error" className={cn("ui-questionnaire__error", className as string)} {...props} />;
}

/** Navigation renders on the house Button; the built-in labels and the Enter shortcut stay. */
export function QuestionnaireNav({ children }: { children?: React.ReactNode }) {
  return (
    <div data-slot="questionnaire-nav" className="ui-questionnaire__nav">
      <Base.Previous render={<Button type="button" variant="ghost" size="sm" />} />
      <span className="ui-questionnaire__spacer" />
      <Base.Skip data-questionnaire-skip="" render={<Button type="button" variant="ghost" size="sm" />} />
      <Base.Next data-questionnaire-next="" render={<Button type="button" variant="secondary" size="sm" />} />
      {children}
    </div>
  );
}

/**
 * Submit on the house rules: an optional last question left blank is skipped, then the questionnaire submits. The
 * primitive treats a blank optional item as unanswered, so Submit otherwise only refocused the empty field (live QA, October 13).
 */
export function QuestionnaireSubmit({ render, children }: Pick<React.ComponentProps<typeof Base.Submit>, "render" | "children">) {
  return <Base.Submit render={render} onClick={event => {
    const form = event.currentTarget.closest("form");
    const active = form?.querySelector<HTMLFieldSetElement>("fieldset[data-active]");
    const answered = active && [...active.querySelectorAll<HTMLInputElement>("input, textarea")]
      .some(input => input.type === "radio" || input.type === "checkbox" ? input.checked : input.value.trim().length > 0);
    const skip = form?.querySelector<HTMLButtonElement>('[data-slot="questionnaire-nav"] [data-visible][data-questionnaire-skip]');
    if (active && !answered && skip && !skip.disabled) { event.preventDefault(); skip.click(); }
  }}>{children}</Base.Submit>;
}
