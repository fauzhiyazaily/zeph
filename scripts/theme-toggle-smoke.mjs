import { chromium } from "playwright";

const baseUrl = process.env.ZEPH_BASE_URL ?? "http://localhost:3000";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function readThemeState(page) {
  return page.evaluate(() => ({
    dataTheme: document.documentElement.getAttribute("data-theme"),
    storedTheme: window.localStorage.getItem("zeph-theme"),
  }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

page.on("pageerror", (err) => {
  console.error("PAGEERROR:", err.message);
});
page.on("console", (msg) => {
  if (msg.type() === "error") {
    console.error("BROWSER_CONSOLE_ERROR:", msg.text());
  }
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);

  const toggles = page.locator("button.theme-toggle");
  const toggleCount = await toggles.count();
  console.log("INFO:", { url: page.url(), toggleCount });

  if (toggleCount === 0) {
    fail("No theme toggle button found.");
    await browser.close();
    process.exit(process.exitCode ?? 1);
  }

  const diagnostics = await page.evaluate(() => {
    const btn = document.querySelector("button.theme-toggle");
    const sidebar = document.querySelectorAll(".finance-sidebar").length;
    if (!btn) {
      return { hasButton: false, sidebar };
    }

    const style = window.getComputedStyle(btn);
    const matchingRules = [];

    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }

      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText.includes(".theme-toggle-floating")) {
          matchingRules.push({
            media: "all",
            selector: rule.selectorText,
            display: rule.style.display || null,
          });
        }

        if (rule instanceof CSSMediaRule && rule.cssText.includes(".theme-toggle-floating")) {
          for (const nested of Array.from(rule.cssRules)) {
            if (nested instanceof CSSStyleRule && nested.selectorText.includes(".theme-toggle-floating")) {
              matchingRules.push({
                media: rule.conditionText,
                selector: nested.selectorText,
                display: nested.style.display || null,
              });
            }
          }
        }
      }
    }

    return {
      hasButton: true,
      sidebar,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      disabled: btn.hasAttribute("disabled"),
      classes: btn.className,
      inlineDisplay: btn.style.display || null,
      hiddenAttr: btn.hasAttribute("hidden"),
      outerHTML: btn.outerHTML,
      rect: btn.getBoundingClientRect().toJSON(),
      matchingRules,
      mediaPrint: window.matchMedia("print").matches,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  console.log("INFO: toggle diagnostics", diagnostics);

  // Prefer visible enabled toggle if multiple are rendered.
  const visibleToggle = page.locator("button.theme-toggle:visible").first();
  await visibleToggle.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(() => {
    const btn = document.querySelector("button.theme-toggle");
    return !!btn && !(btn).hasAttribute("disabled");
  });

  const before = await readThemeState(page);

  await visibleToggle.click();
  await page.waitForTimeout(250);

  const afterClick = await readThemeState(page);

  if (before.dataTheme === afterClick.dataTheme) {
    fail(`Theme did not change after click. before=${before.dataTheme} after=${afterClick.dataTheme}`);
  }

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(250);

  const afterReload = await readThemeState(page);

  if (!afterReload.storedTheme) {
    fail("No theme value was persisted to localStorage (zeph-theme).");
  }

  if (afterReload.dataTheme !== afterClick.dataTheme) {
    fail(`Theme did not persist across reload. afterClick=${afterClick.dataTheme} afterReload=${afterReload.dataTheme}`);
  }

  console.log("PASS: Theme toggle is present, switches theme, and persists across reload.");
  console.log("DETAILS:", { before, afterClick, afterReload, toggleCount });
} catch (error) {
  try {
    await page.screenshot({ path: "theme-toggle-smoke-fail.png", fullPage: true });
    console.error("INFO: Saved screenshot to theme-toggle-smoke-fail.png");
  } catch {
    // ignore screenshot failures
  }
  fail(`Smoke test crashed: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
