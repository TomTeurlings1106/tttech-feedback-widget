import * as react from 'react';

type FeedbackWidgetProps = {
    /** TT Tech portal ingest endpoint, e.g. https://tt-tech-portal.vercel.app/api/v1/feedback/ingest */
    endpoint: string;
    /** Workspace+app-scoped API key (NEXT_PUBLIC, raw key with tt_ prefix). */
    apiKey: string;
    /** Speech recognition language. Default "nl-NL". */
    lang?: string;
    /** Optional context to attach to every submission (sessieId, starter, etc.). */
    contextHook?: () => Record<string, unknown>;
    /** Override Dutch labels (defaults below). */
    labels?: Partial<Labels>;
};
type Labels = {
    triggerLabel: string;
    modalTitle: string;
    placeholder: string;
    recordStart: string;
    recordStop: string;
    recording: string;
    screenshotAdd: string;
    screenshotReplace: string;
    screenshotRemove: string;
    submit: string;
    sending: string;
    cancel: string;
    sentTitle: string;
    sentBody: string;
    errorEmpty: string;
    errorNoSpeech: string;
    errorMicDenied: string;
    errorScreenshotTooBig: string;
    errorImageOnly: string;
};
declare function FeedbackWidget({ endpoint, apiKey, lang, contextHook, labels: labelOverrides, }: FeedbackWidgetProps): react.JSX.Element;

export { FeedbackWidget, type FeedbackWidgetProps };
