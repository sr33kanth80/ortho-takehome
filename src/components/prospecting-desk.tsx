"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Mail,
  Pause,
  Play,
  Plus,
  Search,
  Target,
  UserRoundSearch,
  X,
} from "lucide-react";

type BusinessProfile = {
  businessName: string;
  website: string | null;
  offer: string;
  valueProposition: string;
  targetIndustries: string[];
  targetLocations: string[];
  companySizes: string[];
  buyerRoles: string[];
  buyingSignals: string[];
  exclusions: string[];
  exampleCustomers: string[];
  notes: string | null;
};

type Mission = {
  id: string;
  name: string;
  brief: string;
  status: "draft" | "running" | "paused" | "completed" | "failed";
  targetCount: number;
  maxSpendCents: number;
  spentCents: number;
  strategy: string[];
  lastSummary: string | null;
  lastError: string | null;
  lastRunAt: string | null;
  prospectCount: number;
  approvedCount: number;
  contactCount: number;
};

type Contact = {
  id: string;
  fullName: string;
  title: string;
  linkedinUrl: string | null;
  email: string | null;
  phone: string | null;
  emailStatus: "unverified" | "valid" | "risky" | "invalid" | "unknown";
  source: string;
  confidence: number;
  rationale: string;
  preferred: boolean;
};

type Account = {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  location: string | null;
  employeeCount: number | null;
  description: string;
  fitScore: number;
  signalScore: number;
  overallScore: number;
  status: "new" | "approved" | "rejected" | "archived";
  contactStatus: "not_started" | "searching" | "found" | "unavailable";
  rationale: string;
  whyNow: string;
  outreachAngle: string;
  evidence: Array<{ label: string; url?: string; observedAt?: string }>;
  rejectionReason: string | null;
  contacts: Contact[];
};

export type ProspectingView = {
  profile: BusinessProfile | null;
  missions: Mission[];
  selectedMission: Mission | null;
  accounts: Account[];
};

type Tab = "pipeline" | "brief";

const EMPTY_PROFILE: BusinessProfile = {
  businessName: "",
  website: "",
  offer: "",
  valueProposition: "",
  targetIndustries: [],
  targetLocations: [],
  companySizes: [],
  buyerRoles: [],
  buyingSignals: [],
  exclusions: [],
  exampleCustomers: [],
  notes: "",
};

const listFields: Array<{ key: keyof BusinessProfile; label: string; hint: string }> = [
  { key: "targetIndustries", label: "Target industries", hint: "Battery manufacturing, energy storage" },
  { key: "targetLocations", label: "Geographies", hint: "United States, Midwest" },
  { key: "companySizes", label: "Company sizes", hint: "50–500 employees, Series B+" },
  { key: "buyerRoles", label: "Likely buyers", hint: "VP Engineering, Head of Thermal Systems" },
  { key: "buyingSignals", label: "Buying signals", hint: "New plant, hiring thermal engineers, recent funding" },
  { key: "exclusions", label: "Exclude", hint: "Consultancies, consumer-only businesses" },
  { key: "exampleCustomers", label: "Best-fit examples", hint: "Existing customers or dream accounts" },
];

function asList(value: string) {
  return value.split(/[,\n]/).map((part) => part.trim()).filter(Boolean);
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

function ScoreStamp({ score }: { score: number }) {
  return (
    <div className={`prospect-score ${score >= 80 ? "high" : score >= 60 ? "medium" : "low"}`} aria-label={`${score} percent match`}>
      <strong>{score}</strong>
      <span>match</span>
    </div>
  );
}

export function ProspectingDesk({ initial, userEmail }: { initial: ProspectingView; userEmail: string }) {
  const [view, setView] = useState<Tab>(initial.profile ? "pipeline" : "brief");
  const [data, setData] = useState(initial);
  const [profileDraft, setProfileDraft] = useState<BusinessProfile>(initial.profile ?? EMPTY_PROFILE);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [newMissionOpen, setNewMissionOpen] = useState(false);
  const [missionDraft, setMissionDraft] = useState({ name: "", brief: "", targetCount: 25, maxSpendCents: 300 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const selected = data.selectedMission;
  const metrics = useMemo(() => ({
    total: selected?.prospectCount ?? 0,
    approved: selected?.approvedCount ?? 0,
    contacts: selected?.contactCount ?? 0,
    average: data.accounts.length ? Math.round(data.accounts.reduce((sum, account) => sum + account.overallScore, 0) / data.accounts.length) : 0,
  }), [data.accounts, selected]);

  const refresh = async (missionId?: string) => {
    const suffix = missionId ? `?mission=${encodeURIComponent(missionId)}` : "";
    const next = await readJson<ProspectingView>(await fetch(`/api/prospecting/overview${suffix}`, { cache: "no-store" }));
    setData(next);
  };

  const selectMission = async (id: string) => {
    setBusy("select");
    try {
      await refresh(id);
      setView("pipeline");
      setExpandedId(null);
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async () => {
    setBusy("profile");
    setNotice(null);
    try {
      const payload = { ...profileDraft, website: profileDraft.website || null, notes: profileDraft.notes || null };
      await readJson(await fetch("/api/prospecting/profile", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      }));
      await refresh(selected?.id);
      setNotice({ kind: "ok", text: "Business brief saved. Meridian will use it in every future mission." });
      setView("pipeline");
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const createMission = async () => {
    setBusy("create");
    setNotice(null);
    try {
      const { mission } = await readJson<{ mission: Mission }>(await fetch("/api/prospecting/missions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(missionDraft),
      }));
      setNewMissionOpen(false);
      setMissionDraft({ name: "", brief: "", targetCount: 25, maxSpendCents: 300 });
      await refresh(mission.id);
      setNotice({ kind: "ok", text: "Mission created. The first research batch is ready to run." });
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const runMission = async () => {
    if (!selected) return;
    setBusy("run");
    setNotice({ kind: "ok", text: "Meridian is researching live sources. This bounded batch may take a minute." });
    try {
      const { result } = await readJson<{ result: { inserted: number; costCents: number; summary: string } }>(await fetch(`/api/prospecting/missions/${selected.id}/run`, { method: "POST" }));
      await refresh(selected.id);
      setNotice({ kind: "ok", text: `${result.inserted} new prospect${result.inserted === 1 ? "" : "s"} saved for ${(result.costCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}. ${result.summary}` });
    } catch (error) {
      await refresh(selected.id).catch(() => undefined);
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const review = async (accountId: string, status: "approved" | "rejected" | "new", reason?: string) => {
    if (!selected) return;
    setBusy(`review-${accountId}`);
    try {
      await readJson(await fetch(`/api/prospecting/prospects/${accountId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason: reason || null }),
      }));
      setRejectingId(null);
      setRejectReason("");
      await refresh(selected.id);
      setNotice({ kind: "ok", text: status === "approved" ? "Approved. Future research will see this as positive fit evidence." : status === "rejected" ? "Rejected. The reason will inform the next batch." : "Review reset." });
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const findContacts = async (accountId: string) => {
    if (!selected) return;
    setBusy(`contact-${accountId}`);
    setNotice({ kind: "ok", text: "Running the contact waterfall against live sources." });
    try {
      const { result } = await readJson<{ result: { contacts: Contact[]; costCents: number } }>(await fetch(`/api/prospecting/prospects/${accountId}/contacts`, { method: "POST" }));
      await refresh(selected.id);
      setNotice({ kind: "ok", text: result.contacts.length ? `${result.contacts.length} contact${result.contacts.length === 1 ? "" : "s"} found. Paid lookups cost ${(result.costCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.` : "No contact met the evidence standard. Meridian saved no guessed data." });
    } catch (error) {
      await refresh(selected.id).catch(() => undefined);
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="prospecting-shell">
      <aside className="prospecting-rail">
        <Link className="prospecting-brand" href="/">
          <span className="prospecting-compass" aria-hidden>✦</span>
          <span>Meridian</span>
        </Link>
        <p className="prospecting-rail-kicker">Customer-finding desk</p>

        <nav aria-label="Prospecting navigation">
          <button type="button" className={view === "pipeline" ? "active" : ""} onClick={() => setView("pipeline")}>
            <Target size={15} /> Mission board
          </button>
          <button type="button" className={view === "brief" ? "active" : ""} onClick={() => setView("brief")}>
            <Search size={15} /> Business brief
          </button>
        </nav>

        <div className="prospecting-mission-list">
          <div className="prospecting-list-label"><span>Missions</span><button type="button" title="New mission" onClick={() => setNewMissionOpen(true)} disabled={!data.profile}><Plus size={14} /></button></div>
          {data.missions.map((mission) => (
            <button key={mission.id} type="button" className={selected?.id === mission.id ? "selected" : ""} onClick={() => void selectMission(mission.id)} disabled={busy === "select"}>
              <span className={`mission-dot ${mission.status}`} />
              <span><strong>{mission.name}</strong><small>{mission.prospectCount}/{mission.targetCount} accounts</small></span>
            </button>
          ))}
          {!data.missions.length && <p>No missions yet. Write the brief, then open your first search.</p>}
        </div>

        <div className="prospecting-rail-foot">
          <p>{userEmail}</p>
          <Link href="/"><ArrowLeft size={13} /> Back to research chat</Link>
        </div>
      </aside>

      <main className="prospecting-main">
        {notice && <div className={`prospecting-notice ${notice.kind}`}><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)}><X size={14} /></button></div>}
        {view === "brief" ? (
          <BusinessBrief draft={profileDraft} setDraft={setProfileDraft} onSave={saveProfile} busy={busy === "profile"} isNew={!data.profile} />
        ) : (
          <MissionBoard
            profile={data.profile}
            mission={selected}
            accounts={data.accounts}
            metrics={metrics}
            busy={busy}
            expandedId={expandedId}
            rejectingId={rejectingId}
            rejectReason={rejectReason}
            onOpenBrief={() => setView("brief")}
            onNewMission={() => setNewMissionOpen(true)}
            onRun={() => void runMission()}
            onExpand={setExpandedId}
            onReview={(id, status, reason) => void review(id, status, reason)}
            onRejecting={setRejectingId}
            onRejectReason={setRejectReason}
            onFindContacts={(id) => void findContacts(id)}
          />
        )}
      </main>

      {newMissionOpen && (
        <div className="prospecting-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewMissionOpen(false); }}>
          <section className="mission-composer" role="dialog" aria-modal="true" aria-labelledby="new-mission-title">
            <button className="mission-composer-close" type="button" onClick={() => setNewMissionOpen(false)}><X size={16} /></button>
            <span>New search commission</span>
            <h2 id="new-mission-title">What should Meridian go find?</h2>
            <label>Mission name<input value={missionDraft.name} onChange={(event) => setMissionDraft({ ...missionDraft, name: event.target.value })} placeholder="Midwest battery manufacturers" /></label>
            <label>Search brief<textarea value={missionDraft.brief} onChange={(event) => setMissionDraft({ ...missionDraft, brief: event.target.value })} placeholder="Find manufacturers expanding production that may need thermal simulation support. Prioritize observable growth signals and engineering leadership." /></label>
            <div className="mission-composer-row">
              <label>Target accounts<input type="number" min={1} max={100} value={missionDraft.targetCount} onChange={(event) => setMissionDraft({ ...missionDraft, targetCount: Number(event.target.value) })} /></label>
              <label>Mission budget ($)<input type="number" min={0.01} step={0.01} value={missionDraft.maxSpendCents / 100} onChange={(event) => setMissionDraft({ ...missionDraft, maxSpendCents: Math.max(1, Math.round(Number(event.target.value) * 100)) })} /></label>
            </div>
            <button className="meridian-primary-button" type="button" onClick={() => void createMission()} disabled={busy === "create" || !missionDraft.name.trim() || !missionDraft.brief.trim()}>
              {busy === "create" ? "Opening…" : "Open mission"}<span aria-hidden>→</span>
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function BusinessBrief({ draft, setDraft, onSave, busy, isNew }: { draft: BusinessProfile; setDraft: (profile: BusinessProfile) => void; onSave: () => void; busy: boolean; isNew: boolean }) {
  return (
    <div className="brief-page">
      <header className="prospecting-header">
        <div><p>01 / Assignment desk</p><h1>{isNew ? "Teach Meridian your business." : "Your customer thesis."}</h1></div>
        <span className="prospecting-folio">Living brief · used in every mission</span>
      </header>
      <div className="brief-intro">
        <p>Meridian turns this brief into search criteria, qualification rules, buyer roles, and signal tests. Be specific enough that a researcher could distinguish a good lead from a merely famous company.</p>
      </div>
      <section className="brief-sheet">
        <div className="brief-two">
          <label>Business name<input value={draft.businessName} onChange={(event) => setDraft({ ...draft, businessName: event.target.value })} placeholder="Northstar Thermal" /></label>
          <label>Website <span>optional</span><input value={draft.website ?? ""} onChange={(event) => setDraft({ ...draft, website: event.target.value })} placeholder="northstarthermal.com" /></label>
        </div>
        <label>What do you sell?<textarea value={draft.offer} onChange={(event) => setDraft({ ...draft, offer: event.target.value })} placeholder="We provide battery-pack thermal simulation and design consulting for manufacturers bringing new storage products to production." /></label>
        <label>Why does a customer choose you?<textarea value={draft.valueProposition} onChange={(event) => setDraft({ ...draft, valueProposition: event.target.value })} placeholder="We reduce prototype cycles and thermal risk before expensive physical validation." /></label>
        <div className="brief-grid">
          {listFields.map((field) => (
            <label key={field.key}>{field.label}<textarea className="compact" value={(draft[field.key] as string[]).join(", ")} onChange={(event) => setDraft({ ...draft, [field.key]: asList(event.target.value) })} placeholder={field.hint} /></label>
          ))}
          <label>Context for the agent <span>optional</span><textarea className="compact" value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Deal size, sales cycle, constraints, language, or anything a good researcher should know." /></label>
        </div>
        <div className="brief-submit"><p>Edits affect future batches. Existing scored prospects remain unchanged so review history stays auditable.</p><button className="meridian-primary-button" type="button" onClick={onSave} disabled={busy || !draft.businessName.trim() || !draft.offer.trim() || !draft.valueProposition.trim()}>{busy ? "Saving…" : "Save customer thesis"}<span>→</span></button></div>
      </section>
    </div>
  );
}

function MissionBoard({ profile, mission, accounts, metrics, busy, expandedId, rejectingId, rejectReason, onOpenBrief, onNewMission, onRun, onExpand, onReview, onRejecting, onRejectReason, onFindContacts }: {
  profile: BusinessProfile | null; mission: Mission | null; accounts: Account[]; metrics: { total: number; approved: number; contacts: number; average: number }; busy: string | null;
  expandedId: string | null; rejectingId: string | null; rejectReason: string; onOpenBrief: () => void; onNewMission: () => void; onRun: () => void; onExpand: (id: string | null) => void;
  onReview: (id: string, status: "approved" | "rejected" | "new", reason?: string) => void; onRejecting: (id: string | null) => void; onRejectReason: (value: string) => void; onFindContacts: (id: string) => void;
}) {
  if (!profile) return <EmptyState eyebrow="Before the search" title="Give the agent a customer thesis." copy="Describe what you sell, who benefits, and what signals indicate a real buying opportunity. Meridian will use that as the standard for every prospect." action="Write the business brief" onAction={onOpenBrief} />;
  if (!mission) return <EmptyState eyebrow="The desk is ready" title="Commission your first customer search." copy="A mission is a durable research job with a target, a spend ceiling, and a reviewable pipeline. Meridian works in small batches so you can correct its judgment as it learns." action="Open a mission" onAction={onNewMission} />;

  const canRun = mission.status !== "running" && mission.prospectCount < mission.targetCount && mission.spentCents < mission.maxSpendCents;
  return (
    <div className="mission-page">
      <header className="prospecting-header mission">
        <div><p>02 / Active commission</p><h1>{mission.name}</h1><span>{mission.brief}</span></div>
        <div className="mission-header-actions">
          <a href={`/api/prospecting/missions/${mission.id}/export`}><Download size={14} /> Export CSV</a>
          <button type="button" onClick={onRun} disabled={!canRun || busy === "run"}>{busy === "run" || mission.status === "running" ? <Pause size={14} /> : <Play size={14} />}{busy === "run" || mission.status === "running" ? "Researching…" : accounts.length ? "Find next batch" : "Run first batch"}</button>
        </div>
      </header>

      <section className="prospecting-metrics">
        <article><span>Accounts found</span><strong>{metrics.total}<small> / {mission.targetCount}</small></strong><p>{Math.max(0, mission.targetCount - metrics.total)} remaining in this commission</p></article>
        <article><span>Human approved</span><strong>{metrics.approved}</strong><p>{metrics.total ? Math.round((metrics.approved / metrics.total) * 100) : 0}% acceptance rate</p></article>
        <article><span>Contacts found</span><strong>{metrics.contacts}</strong><p>Saved routes to decision-makers</p></article>
        <article><span>Average match</span><strong>{metrics.average}<small>%</small></strong><p>{mission.spentCents / 100 < 0.01 ? "$0.00" : (mission.spentCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} of {(mission.maxSpendCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} spent</p></article>
      </section>

      {mission.lastSummary && <div className="mission-dispatch"><span>Latest dispatch</span><p>{mission.lastSummary}</p></div>}
      {mission.lastError && <div className="mission-dispatch error"><span>Run needs attention</span><p>{mission.lastError}</p></div>}

      <section className="prospect-ledger">
        <div className="prospect-ledger-title"><div><span>Ranked field notes</span><h2>Prospect dossiers</h2></div><p>Approve what fits. Reject with a reason. Your decisions become evidence for the next batch.</p></div>
        {accounts.map((account, index) => {
          const expanded = expandedId === account.id;
          const contact = account.contacts[0];
          return (
            <article className={`prospect-dossier ${account.status}`} key={account.id}>
              <button type="button" className="dossier-summary" onClick={() => onExpand(expanded ? null : account.id)} aria-expanded={expanded}>
                <span className="dossier-index">{String(index + 1).padStart(2, "0")}</span>
                <ScoreStamp score={account.overallScore} />
                <span className="dossier-identity"><strong>{account.name}</strong><small>{[account.industry, account.location, account.employeeCount ? `${account.employeeCount.toLocaleString()} employees` : null].filter(Boolean).join(" · ")}</small></span>
                <span className="dossier-signal"><small>Why now</small>{account.whyNow}</span>
                <span className={`dossier-status ${account.status}`}>{account.status}</span>
                <ChevronDown size={16} className={expanded ? "rotated" : ""} />
              </button>
              {expanded && (
                <div className="dossier-body">
                  <div className="dossier-copy">
                    <section><span>Qualification note</span><p>{account.rationale}</p><div className="score-breakdown"><i>Fit <b>{account.fitScore}</b></i><i>Signal <b>{account.signalScore}</b></i></div></section>
                    <section><span>Suggested opening</span><p>{account.outreachAngle}</p></section>
                    <section><span>Evidence trail</span><ul>{account.evidence.map((item, evidenceIndex) => <li key={`${account.id}-evidence-${evidenceIndex}`}>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.label}<ExternalLink size={11} /></a> : item.label}{item.observedAt && <small>{item.observedAt}</small>}</li>)}</ul></section>
                  </div>
                  <aside className="contact-card">
                    <span>Decision-maker route</span>
                    {contact ? <><div className="contact-avatar">{contact.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div><h3>{contact.fullName}</h3><p>{contact.title}</p><div className="contact-links">{contact.email && <a href={`mailto:${contact.email}`}><Mail size={13} />{contact.email}<small>{contact.emailStatus}</small></a>}{contact.phone && <span>{contact.phone}</span>}{contact.linkedinUrl && <a href={contact.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn <ExternalLink size={11} /></a>}</div><small>{contact.rationale}</small></> : <><UserRoundSearch size={27} /><h3>No verified route saved</h3><p>The agent will search public role evidence, locate a profile, then use paid contact sources only when justified.</p></>}
                    <button type="button" onClick={() => onFindContacts(account.id)} disabled={busy === `contact-${account.id}`}>{busy === `contact-${account.id}` ? "Searching sources…" : contact ? "Refresh contacts" : "Find decision-maker"}</button>
                  </aside>
                  <div className="dossier-review">
                    {rejectingId === account.id ? <div className="reject-note"><input autoFocus value={rejectReason} onChange={(event) => onRejectReason(event.target.value)} placeholder="Why is this a poor fit?" /><button type="button" onClick={() => onReview(account.id, "rejected", rejectReason)} disabled={!rejectReason.trim() || busy === `review-${account.id}`}>Save rejection</button><button type="button" onClick={() => onRejecting(null)}>Cancel</button></div> : <><button type="button" className={account.status === "approved" ? "approved" : ""} onClick={() => onReview(account.id, account.status === "approved" ? "new" : "approved")} disabled={busy === `review-${account.id}`}><Check size={14} />{account.status === "approved" ? "Approved" : "Approve fit"}</button><button type="button" className={account.status === "rejected" ? "rejected" : ""} onClick={() => account.status === "rejected" ? onReview(account.id, "new") : onRejecting(account.id)} disabled={busy === `review-${account.id}`}><X size={14} />{account.status === "rejected" ? "Rejected" : "Reject"}</button></>}
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {!accounts.length && <div className="prospect-empty"><Target size={28} /><h3>No dossiers yet.</h3><p>Run the first bounded batch. Meridian will use live sources, save only evidence-backed accounts, and stop at the mission budget.</p><button type="button" onClick={onRun} disabled={!canRun || busy === "run"}>{busy === "run" ? "Researching…" : "Run first batch"}</button></div>}
      </section>
    </div>
  );
}

function EmptyState({ eyebrow, title, copy, action, onAction }: { eyebrow: string; title: string; copy: string; action: string; onAction: () => void }) {
  return <div className="prospecting-empty-state"><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p><button className="meridian-primary-button" type="button" onClick={onAction}>{action}<span>→</span></button><div className="empty-state-rule"><i>01</i><span>Define the customer</span><i>02</i><span>Research live signals</span><i>03</i><span>Review and teach</span></div></div>;
}
