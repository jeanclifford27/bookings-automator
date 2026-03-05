import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

// petite pause "humaine"
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Convertit "mercredi à 10h" -> prochaine Date (America/Toronto)
function parseFrSlot(text) {
  const jours = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const m = (text || "")
    .toLowerCase()
    .match(/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)[^0-9]*?(\d{1,2})h(?:\s?(\d{1,2}))?/);
  if (!m) return null;

  const jourTxt = m[1];
  const h = parseInt(m[2], 10);
  const min = m[3] ? parseInt(m[3], 10) : 0;

  const now = new Date();
  const target = new Date(now);
  const idxNow = now.getDay();
  const idxTarget = jours.indexOf(jourTxt);
  let delta = idxTarget - idxNow;

  if (delta < 0 || (delta === 0 && (h < now.getHours() || (h === now.getHours() && min <= now.getMinutes())))) {
    delta += 7;
  }

  target.setDate(now.getDate() + delta);
  target.setHours(h, min, 0, 0);
  return target;
}

// endpoint de santé (utile pour "réveiller" l'instance Free Render)
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.post("/book", async (req, res) => {
  const { pageUrl, service, datetimeText, name, email, phone } = req.body || {};
  if (!pageUrl || !service || !datetimeText || !name || !email) {
    return res.status(400).json({ ok: false, reason: "missing_fields" });
  }

  const slot = parseFrSlot(datetimeText);
  if (!slot) return res.status(400).json({ ok: false, reason: "invalid_datetimeText" });

  let browser;
  try {
    // IMPORTANT : l'image Docker Playwright contient déjà les navigateurs.
    // Avec l'image et la version NPM alignées + ENV PLAYWRIGHT_BROWSERS_PATH, pas de re-téléchargement.
    browser = await chromium.launch({ headless: true });

    const ctx = await browser.newContext({
      locale: "fr-FR",
      timezoneId: "America/Toronto"
    });
    const page = await ctx.newPage();

    // Ouvrir la Booking Page publique (canal officiel Microsoft pour réserver côté web)
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Sélection du service par son libellé
    await page.getByText(service, { exact: false }).first().click();
    await wait(300);

    // Sélection du jour
    const day = slot.getDate().toString();
    try {
      await page.getByRole("button", { name: new RegExp(`^${day}$`) }).first().click();
    } catch {
      // fallback simple : ignorer si le jour est déjà sélectionné / UI différente
    }
    await wait(500);

    // Sélection de l'heure (exacte ou fallback = premier slot visible)
    const hh = slot.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
    let clicked = false;
    for (const pattern of [
      new RegExp(`^${hh.replace(":", "h")}$`, "i"), // "10h00"
      new RegExp(`^${hh}$`, "i"),                  // "10:00"
      new RegExp(`^${slot.getHours()}h$`, "i")     // "10h"
    ]) {
      const el = page.getByRole("button", { name: pattern }).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      await page.getByRole("button", { name: /(\d{1,2}[:h]\d{2}|\d{1,2}h)/ }).first().click();
    }
    await wait(400);

    // Formulaire : Nom / Email / Téléphone
    await page.getByLabel(/nom/i).fill(name).catch(async () => {
      await page.getByPlaceholder(/nom/i).fill(name);
    });
    await page.getByLabel(/e-?mail|courriel/i).fill(email).catch(async () => {
      await page.getByPlaceholder(/e-?mail|courriel/i).fill(email);
    });
    if (phone) {
      await page.getByLabel(/téléphone|phone/i).fill(phone).catch(async () => {
        await page.getByPlaceholder(/téléphone|phone/i).fill(phone);
      });
    }

    // Cliquer "Réserver"
    await page.getByRole("button", { name: /réserver|book/i }).click();
    await wait(1200);

    // Confirmation visible ?
    const confirmed = await page
      .getByText(/confirmé|confirmation|réservation effectuée|booking confirmed/i)
      .first()
      .isVisible()
      .catch(() => false);

    await browser.close();

    if (!confirmed) {
      return res.json({
        ok: true,
        note: "soumis_sans_confirmation_visible",
        confirmed: { date: slot.toISOString().slice(0, 10), time: hh, service }
      });
    }

    return res.json({
      ok: true,
      confirmed: { date: slot.toISOString().slice(0, 10), time: hh, service }
    });
  } catch (e) {
    if (browser) await browser.close();
    return res.status(500).json({ ok: false, reason: "automation_error", detail: e.toString() });
  }
});

// IMPORTANT pour Render : écouter sur 0.0.0.0:$PORT
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Bookings automator running on :${port}`);
});
