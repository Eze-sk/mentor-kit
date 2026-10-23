import puppeteer from "puppeteer";
import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_TOKEN,
});

interface TypeScraping {
  title: string;
  description: string;
  languages: string[];
  difficulty: string;
  pricing: string;
}

async function scraping(): Promise<TypeScraping[] | undefined> {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    await page.goto("https://www.frontendmentor.io/challenges", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const selectorCards = "#main li.isolate";

    await page.waitForSelector(selectorCards, { timeout: 10000 });

    const rawCards = await page.$$eval(selectorCards, (cards) => {
      return cards
        .map((li) => {
          const spans = Array.from(
            li.querySelectorAll<HTMLSpanElement>("span"),
          );

          const notPremium = spans.some(
            (span) => span.innerText.trim().toLocaleLowerCase() === "premium",
          );

          if (notPremium) return null;

          const title = li.querySelector("h2")?.innerText.trim() || "";
          const description = li.querySelector("p")?.innerText.trim() || "";

          const languages = [...li.querySelectorAll("ul > li")].map((el) =>
            el.textContent.trim(),
          );

          const validDifficulties = [
            "newbie",
            "junior",
            "intermediate",
            "advanced",
            "guru",
          ];

          const difficultySpan = spans.find((span) =>
            validDifficulties.includes(span.innerText.trim().toLowerCase()),
          );

          const validPricing = ["free", "free+"];

          const pricingSpan = spans.find((span) =>
            validPricing.includes(span.innerText.trim().toLowerCase()),
          );

          return {
            title,
            description,
            languages,
            difficulty: difficultySpan
              ? difficultySpan.innerText.trim().toLowerCase()
              : "",
            pricing: pricingSpan
              ? pricingSpan.innerText.trim().toLowerCase()
              : "",
          };
        })
        .filter((item) => item !== null);
    });

    await browser.close();

    console.info("✔️ Scraping completed successfully.");
    return rawCards;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
  }
}

async function initDB() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        languages TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        pricing TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.info("✔️ challenge board created");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
  }
}

async function main() {
  try {
    await initDB();

    const scrapingData = await scraping();

    if (!scrapingData || scrapingData.length === 0) {
      console.error("❌ No scraping data found");
      return;
    }

    const lastSaved = await db.execute(`
      SELECT title
      FROM challenges
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `);

    const lastTitle = lastSaved.rows[0]?.title;

    if (lastTitle && scrapingData[0]?.title === lastTitle) {
      console.info(
        "✔️ The data in the database and that obtained through scraping are identical. No action required.",
      );
      return;
    }

    console.info(
      `🔄 Synchronizing ${scrapingData.length} items with the database...`,
    );

    const statements = scrapingData.map((item) => {
      const slug = item.title.toLowerCase().trim().replace(/\s+/g, "-");

      const languages = JSON.stringify(item.languages);

      return {
        sql: `
          INSERT OR IGNORE INTO challenges (title, slug, description, languages, difficulty, pricing)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [
          item.title,
          slug,
          item.description,
          languages,
          item.difficulty,
          item.pricing,
        ],
      };
    });

    await db.batch(statements, "write");
    console.info(
      "✔️ Synchronization completed successfully. Duplicate items were automatically skipped.",
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
  }
}

main();
