/** Ticket 55: web results sit beside the case studies the answer cites, with a model-written summary under both; off, it is today's web card. */
export const oakWebBesideWork = false;
export const oakGalleryKey = "webBesideWork";

let forced: boolean | null = null;

export function forceOakWebBesideWork(on: boolean | null) {
  forced = on;
}

export const oakWebBesideWorkOn = () => forced ?? oakWebBesideWork;
