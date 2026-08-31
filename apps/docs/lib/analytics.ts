import * as amplitude from '@amplitude/analytics-browser';

// The name says what happened; what it happened to is a property. Splitting one
// action into an event per target is how a stream stops being readable.
export type AnalyticsEvent =
  | { name: 'page_view'; path: string }
  | { name: 'cta_click'; cta: string; surface: string }
  | { name: 'form_submit'; form: string; result: 'success' | 'failed' };

const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;

export const startAnalytics = () => {
  if (!apiKey) return;
  amplitude.init(apiKey, {
    // Page views are sent by hand from the path. Left on, autocapture names
    // every page after its title, and this site gives them all the same one.
    autocapture: { pageViews: false },
  });
};

export const track = ({ name, ...properties }: AnalyticsEvent) => {
  if (!apiKey) return;
  amplitude.track(name, properties);
};
