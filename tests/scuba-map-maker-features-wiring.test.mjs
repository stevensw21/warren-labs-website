import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

function blockAt(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Expected ${marker}`);
  const openIndex = source.indexOf("{", markerIndex);
  assert.notEqual(openIndex, -1, `Expected a block after ${marker}`);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(markerIndex, index + 1);
  }
  assert.fail(`Unclosed block after ${marker}`);
}

function firstBlockAt(source, markers) {
  const marker = markers.find((candidate) => source.includes(candidate));
  assert.ok(marker, `Expected one of: ${markers.join(", ")}`);
  return blockAt(source, marker);
}

function selfClosingElementAt(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Expected ${marker}`);
  const start = source.lastIndexOf("<", markerIndex);
  const end = source.indexOf("/>", markerIndex);
  assert.ok(start >= 0 && end > markerIndex, `Expected a self-closing element around ${marker}`);
  return source.slice(start, end + 2);
}

function assertQuotedMember(source, member) {
  assert.match(source, new RegExp(`(?:^|\\|\\s*)"${member}"(?:\\s*\\||$)`));
}

test("wires geographic features into tools, survey tabs, screen layers, and PDF settings", async () => {
  const page = await readFile(pageUrl, "utf8");
  const toolType = page.match(/type Tool = ([^;]+);/)?.[1] ?? "";
  const surveyTabType = page.match(/type SurveyTab = ([^;]+);/)?.[1] ?? "";
  const layerType = blockAt(page, "type LayerVisibility =");
  const exportType = blockAt(page, "type ExportSettings =");
  const defaultExportSettings = blockAt(page, "const DEFAULT_EXPORT_SETTINGS");
  const defaultVisibleLayers = blockAt(page, "useState<LayerVisibility>");

  assertQuotedMember(toolType, "feature");
  assertQuotedMember(surveyTabType, "features");
  assert.match(layerType, /geographicFeatures: boolean/);
  assert.match(layerType, /geographicFeatureLabels: boolean/);
  assert.match(exportType, /geographicFeatures: boolean/);
  assert.match(exportType, /geographicFeatureLabels: boolean/);
  assert.match(defaultExportSettings, /geographicFeatures: true/);
  assert.match(defaultExportSettings, /geographicFeatureLabels: true/);
  assert.match(defaultVisibleLayers, /geographicFeatures: true/);
  assert.match(defaultVisibleLayers, /geographicFeatureLabels: true/);

  const featureInkToggle = selfClosingElementAt(page, "checked={visibleLayers.geographicFeatures}");
  const featureLabelToggle = selfClosingElementAt(page, "checked={visibleLayers.geographicFeatureLabels}");
  assert.match(featureInkToggle, /geographicFeatures: event\.target\.checked/);
  assert.match(featureLabelToggle, /geographicFeatureLabels: event\.target\.checked/);
  assert.match(page, /\[\s*"geographicFeatures",\s*"Map features"\s*\]/);
  assert.match(page, /\[\s*"geographicFeatureLabels",\s*"Feature labels"\s*\]/);

  const drawFeatureButtons = page.match(/<DockButton\b[^>]*\blabel="Draw Feature"[^>]*\/>/g) ?? [];
  assert.equal(drawFeatureButtons.length, 1, "the tool dock should expose exactly one Draw Feature action");
  assert.match(drawFeatureButtons[0], /onClick=/);

  for (const [mode, label] of [["freehand", "Freehand"], ["spline", "Smooth spline"], ["polyline", "Connected line"]]) {
    assert.match(page, new RegExp(`beginFeatureDrawing\\("${mode}"\\)[\\s\\S]{0,100}${label}`));
  }
});

test("keeps feature drafts outside persisted projects and commits each finished drawing once", async () => {
  const page = await readFile(pageUrl, "utf8");
  const projectType = blockAt(page, "type Project =");
  const pointerUp = blockAt(page, "const onStagePointerUp");
  const commitFeature = firstBlockAt(page, [
    "const commitFeatureDraft =",
    "const commitFeatureDrawing =",
    "const finishFeatureDrawing =",
  ]);

  assert.doesNotMatch(projectType, /FeatureDraft|featureDraft/i);
  assert.match(page, /const \[(?:featureDraft|geographicFeatureDraft), set(?:FeatureDraft|GeographicFeatureDraft)\] = useState<[^>]*FeatureDraft[^>]*>\(null\)/);
  assert.match(pointerUp, /featureFreehand/i);
  assert.match(pointerUp, /(?:finish|commit)\w*Feature\w*(?:Ref\.current)?\(/i);
  assert.equal(commitFeature.match(/\bmutate\(/g)?.length ?? 0, 1, "finishing a feature must create one undoable project mutation");

  const controls = page.match(/<div\b(?=[^>]*className="[^"]*\bfeature-draw-controls\b[^"]*")(?=[^>]*aria-label="Feature drawing controls")[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.ok(controls, "feature drawing controls should be anchored in their own labeled container");
  assert.match(controls, /className="[^"]*print-hidden[^"]*"/);
  assert.match(controls, /<button[^>]*>Undo<\/button>/);
  assert.match(controls, /<button[^>]*>Finish<\/button>/);
  assert.match(controls, /<button[^>]*>Cancel<\/button>/);

  assert.match(page, /event\.key === "Escape"[\s\S]{0,800}(?:cancel\w*Feature|setFeatureDraft\(null\))/i);
  assert.match(page, /event\.key === "Enter"[\s\S]{0,500}(?:finish|commit)\w*Feature/i);
  assert.match(page, /event\.key === "Backspace"[\s\S]{0,500}(?:undo\w*Feature|points\.slice\(0, -1\))/i);
});

test("renders geographic feature ink, labels, and a full-length independent hit path", async () => {
  const [page, styles] = await Promise.all([readFile(pageUrl, "utf8"), readFile(stylesUrl, "utf8")]);

  assert.match(page, /<svg\b(?=[^>]*feature-layer)(?=[^>]*visibleLayers\.geographicFeatures)(?=[^>]*exportSettings\.geographicFeatures)[^>]*>/);
  assert.match(page, /<path\b(?=[^>]*\bfeature-path\b)(?=[^>]*d=\{[^}]+\})[^>]*\/>/);

  const hitPath = selfClosingElementAt(page, "feature-hit-path");
  assert.match(hitPath, /print-hidden/);
  assert.match(hitPath, /d=\{[^}]+\}/);
  assert.match(hitPath, /(?:onClick|onPointerDown)=/);
  assert.match(page, /"--feature-hit-width": `\$\{44 \/ zoom\}px`/);
  assert.match(page, /"--feature-anchor-hit-size": `\$\{44 \/ zoom\}px`/);
  assert.match(styles, /\.feature-hit-path\s*\{[^}]*stroke-width:\s*var\(--feature-hit-width[^}]*pointer-events:\s*stroke/s);

  assert.match(page, /<[^>]+(?=[^>]*feature(?:-name)?-label)(?=[^>]*visibleLayers\.geographicFeatureLabels)[^>]*>/);
  assert.match(page, /<[^>]+(?=[^>]*feature(?:-name)?-label)(?=[^>]*exportSettings\.geographicFeatureLabels)[^>]*>/);
  assert.match(page, /setSurveyTab\("features"\)/);
  assert.match(page, /setSelectedFeatureId\(/);
  assert.doesNotMatch(hitPath, /route-symbol-clearance-mask|route-symbol-cutout/);
});

test("provides a feature inspector for naming, restyling, closing, redrawing, and deletion", async () => {
  const page = await readFile(pageUrl, "utf8");

  assert.match(page, /<button\b(?=[^<]*role="tab")(?=[^<]*aria-selected=\{surveyTab === "features"\})[^<]*>Features<\/button>/);
  assert.match(page, /surveyTab === "features"/);
  assert.match(page, /selectedFeature/);

  for (const label of ["Feature name", "Line color", "Line width", "Line style", "Closed loop"]) {
    assert.ok(page.includes(label), `Expected ${label}`);
  }
  assert.match(page, /solid:\s*"Solid"/);
  assert.match(page, /dashed:\s*"Dashed"/);
  assert.match(page, /dotted:\s*"Dotted"/);
  assert.match(page, /Object\.entries\(GEOGRAPHIC_FEATURE_DASH_LABELS\)/);
  assert.match(page, /type="checkbox"[^>]*checked=\{[^}]*\.closed\}/);
  assert.match(page, /feature\.closed \? "Closed" : "Open"/);
  assert.match(page, /type="color"[^<]*value=\{selectedFeature\.style\.color\}/);
  assert.match(page, /type="range"[^<]*value=\{selectedFeature\.style\.width\}/);
  assert.match(page, /checked=\{selectedFeature\.style\.dash === dash\}/);
  assert.match(page, /onChange=\{\(event\) => updateGeographicFeature\(selectedFeature\.id,[^<]*closed: event\.target\.checked/);
  assert.match(page, /selectedFeature\.mode === "freehand"[\s\S]{0,500}>Redraw freehand<\/button>/);
  assert.match(page, />Delete feature<\/button>/);
  assert.match(page, /(?:redraw|beginRedraw)\w*Feature/i);
  assert.match(page, /delete\w*Feature/i);
});

test("keeps feature editing affordances out of printed maps", async () => {
  const [page, styles] = await Promise.all([readFile(pageUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  const printStyles = blockAt(styles, "@media print");

  assert.match(page, /<[^>]+(?=[^>]*feature-draw-controls)(?=[^>]*print-hidden)[^>]*>/);
  assert.match(page, /<[^>]+(?=[^>]*feature-mode-picker)(?=[^>]*print-hidden)[^>]*>/);
  assert.match(page, /<[^>]+(?=[^>]*feature-hit-path)(?=[^>]*print-hidden)[^>]*>/);
  assert.match(page, /<[^>]+(?=[^>]*feature-anchor-handle)(?=[^>]*print-hidden)[^>]*>/);
  assert.match(page, /<[^>]+(?=[^>]*feature-draft)(?=[^>]*print-hidden)[^>]*>/);
  assert.match(printStyles, /\.print-hidden[^}]*display:\s*none\s*!important/);
  assert.match(styles, /\.feature-draw-controls\s*\{[^}]*position:\s*absolute[^}]*bottom:/s);
});
