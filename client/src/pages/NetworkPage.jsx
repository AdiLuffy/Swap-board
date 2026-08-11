import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { Loading, ErrorState, EmptyState } from "../components/States.jsx";

const CATEGORY_COLORS = {
  Cooking: "#c0392b", Craft: "#8a5a1e", Art: "#7d5296", Music: "#2f6f8f",
  Language: "#566e50", Tech: "#2c5f7c", Fitness: "#c17a2a", Gardening: "#4c7a3a",
  Finance: "#5a5a5a", "Life Skills": "#a1622b", Games: "#6a4c93",
};

export default function NetworkPage() {
  const [status, setStatus] = useState("loading");
  const [data, setData] = useState(null);
  const [category, setCategory] = useState("");
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api
      .network(category)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setData({ error: err.message });
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    if (status !== "ready" || !data || data.nodes.length === 0) return;
    const width = wrapRef.current.clientWidth;
    const height = 560;

    const svg = d3.select(svgRef.current).attr("viewBox", [0, 0, width, height]);
    svg.selectAll("*").remove();

    const nodes = data.nodes.map((d) => ({ ...d }));
    const links = data.edges.map((d) => ({ ...d }));

    const simulation = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id).distance(70).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-140))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(24));

    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d) => (d.type === "OFFERS" ? "#566e50" : "#8a5a1e"))
      .attr("stroke-opacity", 0.55)
      .attr("stroke-width", 1.4);

    const node = svg
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .style("cursor", (d) => (d.type === "person" ? "pointer" : "default"))
      .call(drag(simulation))
      .on("click", (event, d) => {
        if (d.type === "person") navigate(`/people/${d.id.replace("p_", "")}`);
      });

    node
      .append("circle")
      .attr("r", (d) => (d.type === "person" ? 9 : 6))
      .attr("fill", (d) => (d.type === "person" ? "#fbf6ea" : CATEGORY_COLORS[d.category] || "#999"))
      .attr("stroke", (d) => (d.type === "person" ? "#b6382f" : "#2a2016"))
      .attr("stroke-width", (d) => (d.type === "person" ? 2.2 : 1));

    node
      .append("text")
      .text((d) => d.label)
      .attr("x", 12)
      .attr("y", 4)
      .attr("font-family", "IBM Plex Mono, monospace")
      .attr("font-size", 10.5)
      .attr("fill", "#fff8ec");

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [status, data, navigate]);

  return (
    <div>
      <div className="toolbar">
        <select
          className="search-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by skill category"
        >
          <option value="">All categories</option>
          {Object.keys(CATEGORY_COLORS).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {status === "loading" && <Loading count={1} />}
      {status === "error" && <ErrorState detail={data?.error} onRetry={() => setCategory((c) => c)} />}
      {status === "ready" && data.nodes.length === 0 && (
        <EmptyState title="Nothing to show" detail="No offers or wants exist for this category yet." />
      )}
      {status === "ready" && data.nodes.length > 0 && (
        <div className="network-wrap" ref={wrapRef}>
          <svg ref={svgRef} style={{ width: "100%", height: 560, display: "block" }} />
        </div>
      )}
    </div>
  );
}

function drag(simulation) {
  function started(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function ended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  return d3.drag().on("start", started).on("drag", dragged).on("end", ended);
}
