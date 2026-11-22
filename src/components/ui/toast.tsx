import * as React from "react";
import { Toast } from "@base-ui/react/toast";
import { Icon, type IconName } from "@/components/ui/Icon";

export const ToastProvider = Toast.Provider;
export const createToastManager = Toast.createToastManager;

/** What a toast carries besides its title: a meaning icon, plus caller data such as an art key. */
export type ToastData = { icon: IconName } & Record<string, unknown>;

/**
 * Renders every queued toast, newest last, at the bottom of the nearest positioned container. Swipe down or wait to dismiss.
 * `media` may return art for a toast; without it the meaning icon shows.
 */
export function ToastViewport({ media }: { media?: (data: ToastData) => React.ReactNode }) {
  const { toasts } = Toast.useToastManager<ToastData>();
  return <Toast.Viewport data-slot="toast-viewport" className="ui-toast-viewport">
    {toasts.map(toast => <Toast.Root key={toast.id} toast={toast} swipeDirection="down" className="ui-toast">
      <Toast.Content className="ui-toast__content">
        <span className="ui-toast__media" aria-hidden="true">{toast.data ? media?.(toast.data) ?? <Icon name={toast.data.icon} /> : null}</span>
        <Toast.Title className="ui-toast__title" />
        <Toast.Close className="ui-toast__close" aria-label="Dismiss"><Icon name="cancel" /></Toast.Close>
      </Toast.Content>
    </Toast.Root>)}
  </Toast.Viewport>;
}
