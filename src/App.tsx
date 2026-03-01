import React, { useState, useEffect, useCallback } from "react";
import { 
  Search, 
  Download, 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  BookOpen,
  ExternalLink,
  Filter,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Article {
  id: number;
  title: string;
  url: string;
  author: string;
  date: string;
  issue: string;
  year: number;
  content: string | null;
  created_at: string;
}

interface CrawlStatus {
  is_running: number;
  last_run: string | null;
  progress: string;
}

export default function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [status, setStatus] = useState<CrawlStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [viewingArticle, setViewingArticle] = useState<boolean>(false);

  const fetchArticles = useCallback(async () => {
    try {
      const response = await fetch("/api/articles");
      const data = await response.json();
      setArticles(data);
    } catch (error) {
      console.error("Failed to fetch articles:", error);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/crawl-status");
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  }, []);

  const openArticle = async (article: Article) => {
    try {
      setViewingArticle(true);
      const response = await fetch(`/api/articles/${article.id}`);
      const data = await response.json();
      setSelectedArticle(data);
    } catch (error) {
      console.error("Failed to fetch article detail:", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchArticles(), fetchStatus()]);
      setLoading(false);
    };
    init();

    // Poll status if running
    const interval = setInterval(() => {
      fetchStatus();
      if (status?.is_running) {
        fetchArticles();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchArticles, fetchStatus, status?.is_running]);

  const startCrawl = async () => {
    try {
      await fetch("/api/crawl", { method: "POST" });
      fetchStatus();
    } catch (error) {
      console.error("Failed to start crawl:", error);
    }
  };

  const filteredArticles = articles.filter(article => {
    const matchesYear = filterYear === "all" || article.year.toString() === filterYear;
    const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          article.issue.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesYear && matchesSearch;
  });

  const exportToCSV = () => {
    const headers = ["ID", "Title", "URL", "Issue", "Year", "Created At"];
    const rows = filteredArticles.map(a => [
      a.id,
      `"${a.title.replace(/"/g, '""')}"`,
      a.url,
      `"${a.issue}"`,
      a.year,
      a.created_at
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `qiushi_articles_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter uppercase italic font-serif">Qiushi Crawler</h1>
          <p className="text-sm opacity-60 mt-1 font-mono uppercase tracking-widest">求是杂志文章采集系统 (2024-2026)</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={startCrawl}
            disabled={status?.is_running === 1}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border border-[#141414] transition-all hover:bg-[#141414] hover:text-[#E4E3E0] disabled:opacity-50 disabled:cursor-not-allowed",
              status?.is_running && !status.progress.includes("Repair") && "bg-[#141414] text-[#E4E3E0]"
            )}
          >
            {status?.is_running && !status.progress.includes("Repair") ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span className="font-mono text-xs uppercase font-bold">
              {status?.is_running && !status.progress.includes("Repair") ? "Crawling..." : "Start Crawl"}
            </span>
          </button>
          <button 
            onClick={async () => {
              await fetch("/api/repair", { method: "POST" });
              fetchStatus();
            }}
            disabled={status?.is_running === 1}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border border-[#141414] transition-all hover:bg-[#141414] hover:text-[#E4E3E0] disabled:opacity-50 disabled:cursor-not-allowed",
              status?.is_running && status.progress.includes("Repair") && "bg-[#141414] text-[#E4E3E0]"
            )}
          >
            {status?.is_running && status.progress.includes("Repair") ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="font-mono text-xs uppercase font-bold">
              {status?.is_running && status.progress.includes("Repair") ? "Repairing..." : "Fetch Content"}
            </span>
          </button>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 border border-[#141414] transition-all hover:bg-[#141414] hover:text-[#E4E3E0]"
          >
            <Download className="w-4 h-4" />
            <span className="font-mono text-xs uppercase font-bold">Export CSV</span>
          </button>
        </div>
      </header>

      {/* Status Bar */}
      <div className="border-b border-[#141414] bg-[#141414] text-[#E4E3E0] px-6 py-2 flex justify-between items-center text-[10px] font-mono uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="opacity-50">Status:</span>
            <span className={cn(status?.is_running ? "text-emerald-400" : "text-white")}>
              {status?.is_running ? "Active" : "Idle"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-50">Progress:</span>
            <span>{status?.progress || "No active task"}</span>
          </div>
        </div>
        <div>
          <span className="opacity-50">Last Run:</span>
          <span>{status?.last_run ? new Date(status.last_run).toLocaleString() : "Never"}</span>
        </div>
      </div>

      <main className="p-6">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
            <input 
              type="text" 
              placeholder="SEARCH ARTICLES OR ISSUES..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent border border-[#141414] pl-10 pr-4 py-2 font-mono text-xs uppercase focus:outline-none focus:ring-1 focus:ring-[#141414]"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex items-center border border-[#141414] px-3">
              <Filter className="w-3 h-3 mr-2 opacity-50" />
              <select 
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="bg-transparent font-mono text-xs uppercase focus:outline-none cursor-pointer py-2"
              >
                <option value="all">All Years</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[2024, 2025, 2026].map(year => {
            const count = articles.filter(a => a.year === year).length;
            return (
              <div key={year} className="border border-[#141414] p-4 flex justify-between items-center">
                <div>
                  <h3 className="font-serif italic text-xl">{year}</h3>
                  <p className="text-[10px] font-mono uppercase opacity-50 tracking-widest">Total Articles</p>
                </div>
                <div className="text-3xl font-bold font-mono">{count}</div>
              </div>
            );
          })}
        </div>

        {/* Table */}
        <div className="border border-[#141414] overflow-hidden">
          <div className="grid grid-cols-[60px_1fr_150px_100px_40px] border-b border-[#141414] bg-[#141414] text-[#E4E3E0] p-3 text-[10px] font-mono uppercase tracking-widest">
            <div>ID</div>
            <div>Title / Issue</div>
            <div>Scraped At</div>
            <div>Year</div>
            <div></div>
          </div>
          
          <div className="max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center font-mono text-xs uppercase opacity-50 animate-pulse">
                Loading database...
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="p-12 text-center font-mono text-xs uppercase opacity-50">
                No articles found matching criteria.
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filteredArticles.map((article, idx) => (
                  <motion.div 
                    key={article.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.5) }}
                    onClick={() => openArticle(article)}
                    className="grid grid-cols-[60px_1fr_150px_100px_40px] border-b border-[#141414] last:border-0 p-3 items-center hover:bg-[#141414] hover:text-[#E4E3E0] group transition-colors cursor-pointer"
                  >
                    <div className="font-mono text-[10px] opacity-50 group-hover:opacity-100">{article.id}</div>
                    <div>
                      <h4 className="font-medium text-sm leading-tight mb-1">{article.title}</h4>
                      <div className="flex items-center gap-2 text-[10px] font-mono uppercase opacity-50 group-hover:opacity-80">
                        <BookOpen className="w-3 h-3" />
                        {article.issue}
                      </div>
                    </div>
                    <div className="font-mono text-[10px] opacity-50 group-hover:opacity-100">
                      {new Date(article.created_at).toLocaleDateString()}
                    </div>
                    <div className="font-mono text-[10px] opacity-50 group-hover:opacity-100">
                      {article.year}
                    </div>
                    <div>
                      <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </main>

      {/* Article Viewer Modal */}
      <AnimatePresence>
        {viewingArticle && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#141414]/80 backdrop-blur-sm p-4 md:p-12"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#E4E3E0] w-full max-w-4xl h-full flex flex-col border border-[#141414] shadow-2xl"
            >
              <div className="border-b border-[#141414] p-4 flex justify-between items-center bg-[#141414] text-[#E4E3E0]">
                <div className="font-mono text-[10px] uppercase tracking-widest">
                  {selectedArticle?.issue} / {selectedArticle?.year}
                </div>
                <button 
                  onClick={() => {
                    setViewingArticle(false);
                    setSelectedArticle(null);
                  }}
                  className="hover:opacity-50 transition-opacity"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 md:p-16">
                {!selectedArticle ? (
                  <div className="h-full flex items-center justify-center">
                    <RefreshCw className="w-8 h-8 animate-spin opacity-20" />
                  </div>
                ) : (
                  <article className="max-w-2xl mx-auto">
                    <h2 className="text-3xl md:text-5xl font-serif italic font-bold mb-8 leading-tight">
                      {selectedArticle.title}
                    </h2>
                    <div className="border-y border-[#141414]/10 py-4 mb-12 flex justify-between items-center text-[10px] font-mono uppercase tracking-widest opacity-60">
                      <div>Source: Qiushi Theory</div>
                      <a 
                        href={selectedArticle.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:underline"
                      >
                        Original Link <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    
                    <div 
                      className="prose prose-stone max-w-none article-content-body"
                      dangerouslySetInnerHTML={{ __html: selectedArticle.content || "No content available." }}
                    />
                  </article>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="p-6 border-t border-[#141414] mt-12 flex justify-between items-center text-[10px] font-mono uppercase tracking-widest opacity-40">
        <div>Qiushi Theory Crawler v1.1.0</div>
        <div>Built for Lanxisama</div>
      </footer>

      <style>{`
        .article-content-body p {
          margin-bottom: 1.5rem;
          line-height: 1.8;
          font-size: 1.1rem;
        }
        .article-content-body h1, .article-content-body h2, .article-content-body h3 {
          font-family: serif;
          font-style: italic;
          font-weight: bold;
          margin-top: 2rem;
          margin-bottom: 1rem;
        }
        .article-content-body img {
          max-width: 100%;
          height: auto;
          margin: 2rem auto;
          border: 1px solid #141414;
        }
      `}</style>
    </div>
  );
}
