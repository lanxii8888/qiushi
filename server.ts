import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import * as cheerio from "cheerio";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("qiushi.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    url TEXT UNIQUE,
    author TEXT,
    date TEXT,
    issue TEXT,
    year INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS crawl_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_running INTEGER DEFAULT 0,
    last_run DATETIME,
    progress TEXT
  );
  INSERT OR IGNORE INTO crawl_status (id, is_running) VALUES (1, 0);
`);

// Migration: Add content column if it doesn't exist (for existing databases)
try {
  db.prepare("SELECT content FROM articles LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE articles ADD COLUMN content TEXT");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Get all articles
  app.get("/api/articles", (req, res) => {
    const year = req.query.year;
    let query = "SELECT * FROM articles";
    const params = [];
    if (year) {
      query += " WHERE year = ?";
      params.push(year);
    }
    query += " ORDER BY year DESC, date DESC";
    const articles = db.prepare(query).all(...params);
    res.json(articles);
  });

  // API: Get crawl status
  app.get("/api/crawl-status", (req, res) => {
    const status = db.prepare("SELECT * FROM crawl_status WHERE id = 1").get();
    res.json(status);
  });

  // API: Start crawling
  app.post("/api/crawl", async (req, res) => {
    const status = db.prepare("SELECT is_running FROM crawl_status WHERE id = 1").get() as { is_running: number };
    if (status.is_running) {
      return res.status(400).json({ error: "Crawler is already running" });
    }

    // Start crawling in background
    runCrawler();
    res.json({ message: "Crawler started" });
  });

  // API: Repair missing content
  app.post("/api/repair", async (req, res) => {
    const status = db.prepare("SELECT is_running FROM crawl_status WHERE id = 1").get() as { is_running: number };
    if (status.is_running) {
      return res.status(400).json({ error: "Crawler is already running" });
    }

    repairMissingContent();
    res.json({ message: "Repair started" });
  });

  // API: Get article content
  app.get("/api/articles/:id", (req, res) => {
    const article = db.prepare("SELECT * FROM articles WHERE id = ?").get(req.params.id);
    if (!article) return res.status(404).json({ error: "Article not found" });
    res.json(article);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

async function runCrawler() {
  db.prepare("UPDATE crawl_status SET is_running = 1, progress = 'Starting...' WHERE id = 1").run();
  
  try {
    const yearsToCrawl = [2024, 2025, 2026];
    const mainUrl = "https://www.qstheory.cn/qs/mulu.htm";
    
    updateProgress("Fetching main directory...");
    const response = await axios.get(mainUrl);
    const $ = cheerio.load(response.data);
    
    const yearLinks: { year: number, url: string }[] = [];
    $("a").each((i, el) => {
      const text = $(el).text();
      const href = $(el).attr("href");
      if (href) {
        const yearMatch = text.match(/(\d{4})年/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1]);
          if (yearsToCrawl.includes(year)) {
            yearLinks.push({ year, url: new URL(href, mainUrl).href });
          }
        }
      }
    });

    for (const yearLink of yearLinks) {
      updateProgress(`Crawling year ${yearLink.year}...`);
      await crawlYear(yearLink.year, yearLink.url);
    }

    db.prepare("UPDATE crawl_status SET is_running = 0, progress = 'Completed', last_run = CURRENT_TIMESTAMP WHERE id = 1").run();
  } catch (error: any) {
    console.error("Crawler error:", error);
    db.prepare("UPDATE crawl_status SET is_running = 0, progress = 'Error: ' || ? WHERE id = 1").run(error.message);
  }
}

async function crawlYear(year: number, url: string) {
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);
  
  const issueLinks: { issue: string, url: string }[] = [];
  $("a").each((i, el) => {
    const text = $(el).text();
    const href = $(el).attr("href");
    if (href && text.includes("期")) {
      issueLinks.push({ issue: text, url: new URL(href, url).href });
    }
  });

  for (const issueLink of issueLinks) {
    updateProgress(`Crawling ${issueLink.issue}...`);
    await crawlIssue(year, issueLink.issue, issueLink.url);
    // Add a small delay to be polite
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

async function crawlIssue(year: number, issue: string, url: string) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    // The structure of issue pages can vary, but usually articles are in a list
    // We'll look for links that look like article links
    // Often they are in a specific div or have a specific pattern
    
    const articles: any[] = [];
    
    // Common patterns for Qiushi article lists
    $(".highlight a, .list a, .content a").each((i, el) => {
      const title = $(el).text().trim();
      const href = $(el).attr("href");
      if (href && title && title.length > 5 && !href.includes("mulu.htm")) {
        articles.push({
          title,
          url: new URL(href, url).href,
          issue,
          year
        });
      }
    });

    // If no articles found with classes, try all links in the main content area
    if (articles.length === 0) {
      $("a").each((i, el) => {
        const title = $(el).text().trim();
        const href = $(el).attr("href");
        // Filter out navigation links
        if (href && title && title.length > 2 && href.includes(".htm") && !href.includes("mulu.htm") && !title.includes("期")) {
           articles.push({
            title,
            url: new URL(href, url).href,
            issue,
            year
          });
        }
      });
    }

    const insert = db.prepare(`
      INSERT OR IGNORE INTO articles (title, url, issue, year, content)
      VALUES (@title, @url, @issue, @year, @content)
    `);

    for (const article of articles) {
      // Check if article already exists and has content
      const existing = db.prepare("SELECT content FROM articles WHERE url = ?").get(article.url) as { content: string } | undefined;
      if (existing && existing.content && existing.content !== "Failed to fetch content") {
        continue;
      }

      updateProgress(`Fetching content: ${article.title.substring(0, 20)}...`);
      try {
        const artRes = await axios.get(article.url);
        const $art = cheerio.load(artRes.data);
        
        // Qiushi article content is usually in .content or .text-content or similar
        // We'll try to extract the main body
        let content = $art(".content, .text-content, .article-content, #content, .inner").html();
        
        if (!content) {
          // Fallback: try to find the largest text block or specific Qiushi structure
          // Sometimes it's in a div with class 'text'
          content = $art(".text").html();
        }

        if (!content) {
          // Fallback: try to find the main article container
          content = $art("article").html();
        }
        
        if (!content) {
          // Fallback: try to find all paragraphs in the main area
          content = $art("p").map((i, el) => $art(el).html()).get().join("<br>");
        }
        
        article.content = content;
        insert.run(article);
        // Small delay between articles
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error(`Failed to fetch content for ${article.url}`, e);
        insert.run({ ...article, content: "Failed to fetch content" });
      }
    }
  } catch (error) {
    console.error(`Error crawling issue ${issue}:`, error);
  }
}

async function repairMissingContent() {
  db.prepare("UPDATE crawl_status SET is_running = 1, progress = 'Starting repair...' WHERE id = 1").run();
  
  try {
    const articles = db.prepare("SELECT * FROM articles WHERE content IS NULL OR content = 'Failed to fetch content'").all() as Article[];
    
    updateProgress(`Repairing ${articles.length} articles...`);
    
    const update = db.prepare("UPDATE articles SET content = ? WHERE id = ?");

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      updateProgress(`Repairing (${i+1}/${articles.length}): ${article.title.substring(0, 20)}...`);
      
      try {
        const artRes = await axios.get(article.url);
        const $art = cheerio.load(artRes.data);
        
        let content = $art(".content, .text-content, .article-content, #content, .inner").html();
        if (!content) content = $art(".text").html();
        if (!content) content = $art("article").html();
        if (!content) content = $art("p").map((i, el) => $art(el).html()).get().join("<br>");
        
        update.run(content, article.id);
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error(`Failed to repair content for ${article.url}`, e);
      }
    }

    db.prepare("UPDATE crawl_status SET is_running = 0, progress = 'Repair Completed', last_run = CURRENT_TIMESTAMP WHERE id = 1").run();
  } catch (error: any) {
    console.error("Repair error:", error);
    db.prepare("UPDATE crawl_status SET is_running = 0, progress = 'Repair Error: ' || ? WHERE id = 1").run(error.message);
  }
}

interface Article {
  id: number;
  title: string;
  url: string;
  content: string;
}

function updateProgress(msg: string) {
  console.log(msg);
  db.prepare("UPDATE crawl_status SET progress = ? WHERE id = 1").run(msg);
}

startServer();
