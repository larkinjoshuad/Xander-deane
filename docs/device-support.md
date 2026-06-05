# Device Support Strategy

The product must run across computers, tablets, phones, and emerging wearable displays such as smart glasses. The UI shell now treats device behavior as a first-class runtime concern instead of only relying on generic responsive CSS.

## Supported Device Classes

| Device class | Primary constraints | Product response |
| --- | --- | --- |
| Computer | Large viewport, keyboard and pointer, hover available. | Full layout, two-column workspaces where useful, developer trace visible. |
| Tablet | Medium viewport, touch-first, often shared with keyboard. | Compact layout, large touch targets, one-column workspace flow. |
| Phone | Narrow viewport, coarse pointer, portrait-first. | Single-column layout, full-width actions, larger 52px controls, safe-area padding. |
| Smart glasses | Very small/glanceable viewport, gaze/voice likely, limited attention. | Glance mode, hidden developer trace, single-column content, 56px minimum targets, short status labels. |

## Runtime Contract

`DeviceProfile` describes the current device category, viewport, pixel ratio, supported input modes, presentation mode, and accessibility capabilities. The browser shell infers this profile at startup and on resize, then writes `data-device-profile` and `data-presentation-mode` attributes to the document so CSS can adapt without rewriting workspace renderers.

## UI Rules Added

1. Use safe-area-aware shell padding for phones and tablets.
2. Increase target sizes for coarse pointer and smart-glasses contexts.
3. Collapse subject, tutor, workspace, and sorting layouts to one column on smaller screens.
4. Hide the developer trace in glance mode so wearable displays prioritize tutor feedback and the active workspace.
5. Respect reduced-motion and forced-colors user preferences.
6. Show a visible device status chip so testers can verify the inferred mode during demos.

## Device QA Gate

Run the dependency-free preset gate before merging UI changes:

```bash
npm run test:device
```

The gate validates four viewport/device presets, confirms the expected `DeviceProfile` and layout policy for each class, and checks that the HTML/CSS hooks needed by the adaptive shell remain present. It does not replace real browser or physical-device QA; it prevents regressions while the product is still dependency-light.

## Next Steps

1. Keep Playwright browser automation running for desktop, tablet, phone, and smart-glasses viewport presets.
2. Add speech and gaze interaction mocks for hands-free workspace completion.
3. Connect `npm run test:device` to CI as the first device-specific QA script.
4. Validate the UI on actual iPad, Android tablet, iPhone, Android phone, and at least one wearable/webXR-class device before accepting real learners.
