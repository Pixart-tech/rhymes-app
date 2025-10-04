# SVG Embedded Image Visibility Investigation Prompt

Use this prompt to analyze why certain rhyme SVGs render almost invisible embedded images while the rest of the artwork appears correctly. Follow the steps below meticulously and document findings at each stage.

## 1. Embedded `<image>` Attributes
- Inspect every `<image>` element, especially the main illustration (e.g., bridge for "London Bridge is Falling Down").
- Record `x`, `y`, `width`, and `height` values; flag anything extremely small (≤ `0.1`) or unusually large relative to the canvas.
- Examine `transform` attributes for `scale`, `translate`, `rotate`, or `matrix` operations. Look for negative scales, near-zero scale factors, or translations that push the image outside the viewport.
- Capture any computed bounding box or CSS transformations reported by developer tools.

## 2. SVG ViewBox and Canvas Dimensions
- Note the `<svg>` tag's `viewBox`, `width`, and `height` attributes. Confirm the viewBox origin and size are consistent with the `<image>` placement.
- Compare the problematic SVG's canvas dimensions with a similar, working rhyme SVG. Document any discrepancies in aspect ratio or coordinate ranges.
- Verify that the embedded image coordinates fall within the viewBox bounds.

## 3. Clipping, Masking, and Group Effects
- Search for `<clipPath>`, `<mask>`, `<pattern>`, `<filter>`, or grouped `<g>` elements that reference the `<image>`.
- Temporarily disable these definitions (e.g., via browser dev tools) to determine whether they reduce the image's visibility.
- Check opacity settings and `display` / `visibility` attributes on parent groups.

## 4. Embedded Image Data Integrity
- If the `<image>` uses `href="data:image/...;base64,..."`, verify the Base64 data is complete and decodes without error.
- Decode the Base64 payload to ensure the binary data represents a valid PNG/JPEG and confirm the intrinsic dimensions.
- Compare the size of the Base64 string against working examples to detect truncation.

## 5. Units and Aspect Ratio Controls
- Identify the units used (`px`, `%`, `em`, etc.) for the `<image>` and the root SVG. Note any mixed units that could misalign scaling.
- Review `preserveAspectRatio` on the `<svg>` and `<image>` elements. Test alternative settings (e.g., `xMidYMid meet`) to see if aspect ratio constraints are compressing the image.

## 6. Cross-Browser Rendering Checks
- Load the SVG in multiple browsers (Chrome, Firefox, Safari, Edge). Document which browsers show the issue and capture screenshots.
- Use browser dev tools to check computed styles and rendering warnings (console messages) for the `<image>` element.

## 7. Potential Fix Experiments
- Adjust `width`/`height` or remove scaling transforms in a local copy to observe changes.
- Temporarily remove clipping/masking/group wrappers to confirm they are not causing the issue.
- Re-export the SVG from the original authoring tool (Inkscape, Illustrator, Figma) ensuring the embedded image is linked correctly and the Base64 data is intact.
- If issues persist, consider replacing the embedded image with an external `<image href="/path.png">` to test rendering.

## Documentation Template
For each affected SVG:
1. **File**: `<filename>`
2. **Observation**: Describe what renders and what is missing.
3. **Embedded Image Attributes**: Summarize width/height/transform findings.
4. **Canvas Comparison**: Note viewBox/canvas differences vs. working SVG.
5. **Clipping/Masking**: Record any elements affecting visibility.
6. **Data Integrity**: Base64 validation results.
7. **Browser Results**: List browsers tested and outcomes.
8. **Fix Attempts**: Document adjustments made and their effects.
9. **Conclusion**: Identify the likely root cause and recommended fix.

Follow this checklist to isolate the root cause of nearly invisible embedded images and ensure the SVG renders fully in the web application.
