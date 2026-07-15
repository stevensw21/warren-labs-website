import { ArrowLeft, ArrowUpRight, Layers3, MapPinned, Waves } from "lucide-react";
import Link from "next/link";

const scope = [
  "Dive site map and GIS overlays",
  "Entry points, parking, and access notes",
  "Underwater features and depth contours",
  "Fish sightings and field observations",
  "Weather and water-temperature records",
];

export default function ScubaMapMaker() {
  return (
    <main className="map-maker">
      <header className="map-header">
        <Link href="/" className="back-link"><ArrowLeft size={17} /> Warren Labs</Link>
        <div><span>Project</span><strong>Scuba Map Maker</strong></div>
        <a className="project-github" href="https://github.com" target="_blank" rel="noreferrer">Project repository <ArrowUpRight size={14} /></a>
      </header>

      <section className="map-intro">
        <div>
          <p className="mono-label">Warren Labs project</p>
          <h1>Scuba Map Maker</h1>
          <p>A future home for detailed, useful records of the places beneath the surface.</p>
        </div>
        <div className="map-intro-note"><Waves size={18} /><span>Project foundation established. Mapping tools and live data will be added here later.</span></div>
      </section>

      <section className="project-overview">
        <div className="project-statement">
          <p className="mono-label">Overview</p>
          <h2>One place to turn dive experience into usable site knowledge.</h2>
          <p>Scuba Map Maker is being shaped as a practical reference for divers: begin with a map, then build a richer record through observations, site conditions, and underwater details.</p>
        </div>
        <div className="project-artifact" aria-label="Future map workspace placeholder">
          <MapPinned size={28} />
          <p>Future map workspace</p>
          <span>The interactive dive-site map will live in this area.</span>
        </div>
      </section>

      <section className="scope-section">
        <div><p className="mono-label">Planned scope</p><h2>Designed for the details that matter underwater.</h2></div>
        <ul>{scope.map((item) => <li key={item}><span /><p>{item}</p></li>)}</ul>
      </section>

      <section className="project-status">
        <Layers3 size={22} />
        <div><p className="mono-label">Current status</p><h2>Foundation in place.</h2><p>The site structure, project route, and visual direction are ready. The next phase is connecting real mapping data, documentation, screenshots, and downloadable tools as you build them.</p></div>
      </section>
    </main>
  );
}
