import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/projects/scuba-map-maker/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("resets Warren's scoped print root to a white full-width visible block", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  assert.match(styles, /@page \{ size: Letter landscape; margin: 9mm; \}/);
  const rootRule = [...styles.matchAll(/:scope\.app-shell \{[^}]+\}/g)].map((match) => match[0]).find((rule) => rule.includes("overflow: visible !important")) ?? "";
  assert.ok(rootRule, "expected a print-scoped app root rule");
  assert.match(rootRule, /display:\s*block !important/);
  assert.match(rootRule, /width:\s*100% !important/);
  assert.match(rootRule, /height:\s*auto !important/);
  assert.match(rootRule, /overflow:\s*visible !important/);
  assert.match(rootRule, /background:\s*#fff !important/);
  assert.match(rootRule, /font-family:\s*Arial, Helvetica, sans-serif !important/);
});

test("uses one 980x640 map sheet and sends the details appendix to page two", async () => {
  const [page, styles] = await Promise.all([readFile(pageUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(page, /className="print-map-sheet"/);
  assert.match(page, /className="print-sheet-header"/);
  assert.match(page, /className="print-sheet-footer"/);
  assert.match(page, /Details appendix/);
  assert.match(page, /Map position \(px\)/);
  assert.match(page, /const printPointTableChunks = printPoints\.length > 20/);
  assert.match(page, /<caption>Points — continued<\/caption>/);
  assert.match(page, /Ordered route-leg schedule/);
  assert.match(page, /Symbols used/);
  assert.match(styles, /\.map-stage, \.map-stage\.has-print-area, \.map-stage\.smart-callout-mode \{[^}]*width:\s*980px !important;[^}]*height:\s*640px !important;/);
  assert.match(styles, /\.print-details \{[^}]*break-before:\s*page;[^}]*page-break-before:\s*always;/);
  assert.match(styles, /\.print-details thead \{ display: table-header-group; \}/);
  assert.match(styles, /\.print-details tr \{ break-inside: avoid; page-break-inside: avoid; \}/);
  assert.match(styles, /\.print-point-table-chunk \{ break-inside: avoid; page-break-inside: avoid; \}/);
  assert.match(styles, /\.print-appendix-section:last-child \{ margin-bottom: 0; \}/);
});

test("prepares fonts and images, caps reference opacity, and restores the PDF title", async () => {
  const [page, styles] = await Promise.all([readFile(pageUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(page, /const prepareAndPrint = async \(\) =>/);
  assert.match(page, /document\.fonts\?\.ready/);
  assert.match(page, /waitForPrintImages/);
  assert.match(page, /window\.requestAnimationFrame\(\(\) => window\.requestAnimationFrame/);
  assert.match(page, /document\.title = printDocumentTitle\(project\.title\)/);
  assert.match(page, /document\.title = previousTitle/);
  assert.match(page, /Math\.min\(project\.reference\.opacity, 0\.35\)/);
  assert.match(styles, /\.reference-image \{ opacity: var\(--print-reference-opacity, \.35\) !important;/);
});

test("keeps map typography at the approved 9pt and 8.25pt physical sizes", async () => {
  const [page, styles] = await Promise.all([readFile(pageUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(page, /const PRINT_PRIMARY_TEXT_SIZE = 12;/);
  assert.match(page, /const PRINT_SECONDARY_TEXT_SIZE = 11;/);
  assert.match(styles, /\.smart-callout-label \{[^}]*font-size:\s*12px;/);
  assert.match(styles, /\.print-details table \{[^}]*font-size:\s*12px;/);
});

test("keeps primary route and feature labels above secondary depths without truncating the dense fixture", async () => {
  const [page, styles] = await Promise.all([readFile(pageUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(page, /"--print-feature-name-offset": `\$\{10 \/ effectivePrintScale\}px`/);
  assert.match(styles, /\.feature-name-label-print \{[^}]*z-index:\s*13 !important;/);
  assert.match(styles, /\.feature-name-label-print > span \{[^}]*-webkit-line-clamp:\s*3 !important;/);
  assert.match(page, /const printFeatureLabelBelow = .*index % 2 === 0/);
  assert.match(page, /printFeatureLabelBelow\(anchor, featureLabelIndex\) \? " feature-name-label-below"/);
  assert.match(styles, /\.feature-name-label-print\.feature-name-label-below \{[^}]*translate\(-50%, var\(--print-feature-name-offset/);
  assert.match(styles, /\.route-name-label \{[^}]*z-index:\s*14 !important;/);
  assert.match(styles, /\.print-symbol-legend \{[^}]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(page, /"--print-water-label-left": `\$\{printSource\.x \+ 12 \/ effectivePrintScale\}px`/);
  assert.match(page, /"--print-water-label-top": `\$\{printSource\.y \+ 14 \/ effectivePrintScale\}px`/);
});
