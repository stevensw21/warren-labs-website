"use client";

import Image from "next/image";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Github,
  Map,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

const navItems = ["Home", "Projects", "Tools", "Articles", "About", "Contact"];

const projects = [
  { title: "Scuba Map Maker", description: "A working surface for documenting dive sites, underwater features, and field observations.", status: "Available now", icon: Map, art: "topography" },
];

const articles = [
  { date: "May 12, 2026", time: "6 min read", title: "Designing a dive-site mapping workflow", summary: "A practical approach to turning survey data into clean, usable maps." },
  { date: "Apr 28, 2026", time: "5 min read", title: "Reliable laboratory automation, one utility at a time", summary: "Small, dependable tools that make lab work safer and more reproducible." },
  { date: "Apr 14, 2026", time: "7 min read", title: "Notes from building practical AI tools", summary: "Lessons learned while shipping useful AI features in real-world workflows." },
];

function ProjectArt({ type, Icon }: { type: string; Icon: typeof Map }) {
  return (
    <div className={`project-art ${type}`} aria-hidden="true">
      <div className="art-grid" />
      <div className="art-line line-one" />
      <div className="art-line line-two" />
      <div className="art-line line-three" />
      <Icon strokeWidth={1.2} />
    </div>
  );
}

export default function Home() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("Home");

  const navigate = (item: string) => {
    setActive(item);
    setOpen(false);
    const target = item === "Home" ? "home" : item.toLowerCase();
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main id="home">
      <header className="site-header">
        <button className="wordmark" onClick={() => navigate("Home")} aria-label="Warren Labs home">Warren Labs</button>
        <nav className={open ? "nav-links is-open" : "nav-links"} aria-label="Primary navigation">
          {navItems.map((item) => (
            <button key={item} className={active === item ? "active" : ""} onClick={() => navigate(item)}>{item}</button>
          ))}
        </nav>
        <button className="menu-button" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation">
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title">Warren Labs</h1>
          <p className="hero-statement">Engineering.<br className="mobile-break" /> Automation. Exploration.</p>
          <p className="hero-summary">Practical tools for science, engineering, diving, and AI.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="/projects/scuba-map-maker">Open Scuba Map Maker <ArrowDownRight size={17} /></a>
            <button className="button button-secondary" onClick={() => navigate("About")}>About Me <ArrowRight size={17} /></button>
          </div>
        </div>
        <div className="hero-art">
          <Image src="/images/warren-labs-terrain.png" alt="Topographic terrain model with blue and jade route lines" width={1536} height={1024} priority />
        </div>
      </section>

      <section className="projects-section" id="projects" aria-labelledby="projects-title">
        <div className="section-intro">
          <h2 id="projects-title">Featured Projects</h2>
          <p>The first active Warren Labs project.</p>
        </div>
        <div className="project-list">
          {projects.map((project) => {
            const Icon = project.icon;
            return (
              <article className="project" key={project.title}>
                <ProjectArt type={project.art} Icon={Icon} />
                <div className="project-body">
                  <div>
                    <h3>{project.title}</h3>
                    <p>{project.description}</p>
                  </div>
                  <div className="project-bottom">
                    <span>{project.status}</span>
                    <div className="project-links">
                      <a href="https://github.com" target="_blank" rel="noreferrer"><Github size={15} /> GitHub <ArrowUpRight size={15} /></a>
                      <a href="/projects/scuba-map-maker">Open project <ArrowUpRight size={15} /></a>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="articles-section" id="articles" aria-labelledby="articles-title">
        <div className="rule-detail"><span /></div>
        <h2 id="articles-title">Latest Articles</h2>
        <div className="article-list">
          {articles.map((article) => (
            <a className="article" href="#articles" key={article.title}>
              <div className="article-meta"><span>{article.date}</span><em>{article.time}</em></div>
              <div className="article-marker" />
              <div className="article-copy"><h3>{article.title}</h3><p>{article.summary}</p></div>
              <ArrowRight className="article-arrow" size={29} strokeWidth={1.2} />
            </a>
          ))}
        </div>
      </section>

      <section className="about-strip" id="about">
        <p>Warren Labs is an ongoing platform for work that benefits from methodical engineering, grounded experimentation, and a little curiosity.</p>
        <a href="mailto:hello@warren-labs.com">Start a conversation <ArrowUpRight size={17} /></a>
      </section>

      <footer id="contact">
        <div className="footer-rule"><span /></div>
        <div className="footer-grid">
          <div><h2>Warren Labs</h2><p>Building practical tools for science, engineering, diving, and AI.</p></div>
          <div className="footer-links"><a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a><a href="#contact">LinkedIn</a><a href="mailto:hello@warren-labs.com">Email</a></div>
        </div>
        <p className="copyright">© 2026 Warren Labs</p>
      </footer>
    </main>
  );
}
