import React from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import OverviewView from "./views/OverviewView.jsx";
import RegistryView from "./views/RegistryView.jsx";
import SourcesView from "./views/SourcesView.jsx";
import DesignsView from "./views/DesignsView.jsx";
import LearnView from "./views/LearnView.jsx";
import AuthorView from "./views/AuthorView.jsx";
import TopicsView from "./views/TopicsView.jsx";
import BlogView from "./views/BlogView.jsx";
import SearchView from "./views/SearchView.jsx";
import HelpView from "./views/HelpView.jsx";

/* ------------------------------------------------------------------ *
 * Fabric Atlas — frontend for the local backend (http://localhost:8000,
 * proxied by Vite). Read/verify/inspect UI for the knowledge base plus
 * the reading portal (topics → blogs → search → help).
 * Authoring (ingest, design, diagrams, lessons, blogs) happens in the IDE
 * via the Claude Code / Codex agents — see the Author page.
 *
 * Themed to the Microsoft Fabric design language — tokens in theme.js.
 * ------------------------------------------------------------------ */

function OverviewRoute() {
  const navigate = useNavigate();
  return <OverviewView onOpenCapability={(id) => navigate(`/registry?cap=${id}`)} />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<OverviewRoute />} />
        <Route path="/registry" element={<RegistryView />} />
        <Route path="/sources" element={<SourcesView />} />
        <Route path="/designs" element={<DesignsView />} />
        <Route path="/learn" element={<LearnView />} />
        <Route path="/author" element={<AuthorView />} />
        <Route path="/topics" element={<TopicsView />} />
        <Route path="/topics/:slug" element={<TopicsView />} />
        <Route path="/blog/:slug" element={<BlogView />} />
        <Route path="/search" element={<SearchView />} />
        <Route path="/help" element={<HelpView />} />
        <Route path="/help/:page" element={<HelpView />} />
        <Route path="*" element={<OverviewRoute />} />
      </Route>
    </Routes>
  );
}
