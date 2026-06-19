# @tttech/feedback-widget

Embeddable feedback widget for TT Tech client apps. Drop one component in, get a floating "Feedback" button that opens a modal with **text, voice, and screenshot** input — sent to the TT Tech portal.

```tsx
import { FeedbackWidget } from "@tttech/feedback-widget";

export default function App() {
  return (
    <>
      {/* …your app… */}
      <FeedbackWidget
        endpoint={process.env.NEXT_PUBLIC_TTTECH_FEEDBACK_ENDPOINT!}
        apiKey={process.env.NEXT_PUBLIC_TTTECH_FEEDBACK_KEY!}
      />
    </>
  );
}
```

## Install (GitHub install — no npm publish needed)

```bash
npm install github:TomTeurlings1106/tttech-feedback-widget
# or pin to a tag once we cut releases:
npm install github:TomTeurlings1106/tttech-feedback-widget#v0.1.0
```

## Configuration

Environment variables (recommended for Next.js apps):

```
NEXT_PUBLIC_TTTECH_FEEDBACK_ENDPOINT=https://tt-tech-portal.vercel.app/api/v1/feedback/ingest
NEXT_PUBLIC_TTTECH_FEEDBACK_KEY=tt_xxxxxxxx
```

Each (workspace, source_app) gets its own key — request one from Tom or via the portal admin flow (when wired).

## Props

| Prop          | Type                                  | Default | Description                                                |
| ------------- | ------------------------------------- | ------- | ---------------------------------------------------------- |
| `endpoint`    | `string`                              | —       | Portal ingest URL                                          |
| `apiKey`      | `string`                              | —       | Raw API key (sent in `x-tt-key` header)                    |
| `lang`        | `string`                              | `nl-NL` | BCP-47 lang code for speech recognition                    |
| `contextHook` | `() => Record<string, unknown>`       | —       | Optional context attached to every submission              |
| `labels`      | `Partial<Labels>`                     | —       | Override Dutch UI strings                                  |

## What it captures

- `message` — final text the user submitted
- `transcript` — raw voice transcript (if used; may differ from `message`)
- `pageUrl` — current URL when the widget submitted
- `screenshotDataUrl` — optional, client-side compressed JPEG (~220KB cap)
- `userAgent`, `viewportWidth`, `viewportHeight` — environment context
- `context` — whatever `contextHook()` returns

## Browser support

- Voice transcription uses the Web Speech API — works in Chromium-based browsers and Safari.
- Screenshot upload is client-side compressed via canvas; max dimension 1600px, JPEG quality steps down to fit the 220KB cap.

## License

MIT — copy, fork, embed.
