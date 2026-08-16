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
  Send,
  Sparkles,
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

type IntakeTurn = { role: "user" | "assistant"; text: string };

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
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [intakeMessages, setIntakeMessages] = useState<IntakeTurn[]>([
    {
      role: "assistant",
      text: initial.profile
        ? `I know ${initial.profile.businessName}'s customer thesis. Tell me what to change, who to find next, or ask me to continue the selected mission.`
        : "Tell me what your business sells and the kinds of customers you want. I’ll ask only what I need, then turn it into a live prospecting mission.",
    },
  ]);
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
      setExpandedId(null);
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const sendIntake = async () => {
    const text = prompt.trim();
    if (!text || busy === "intake") return;
    const messages: IntakeTurn[] = [...intakeMessages, { role: "user" as const, text }].slice(-12);
    setIntakeMessages(messages);
    setPrompt("");
    setBusy("intake");
    setNotice(null);
    try {
      const { result } = await readJson<{ result: { action: string; reply: string; missionId: string | null; run: { inserted: number; costCents: number } | null } }>(await fetch("/api/prospecting/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, selectedMissionId: selected?.id ?? null }),
      }));
      setIntakeMessages((current) => [...current, { role: "assistant" as const, text: result.reply }].slice(-12));
      await refresh(result.missionId ?? selected?.id);
      if (result.action === "create_mission") setNotice({ kind: "ok", text: "Mission created from your conversation. No paid research ran yet." });
      if (result.action === "update_profile") setNotice({ kind: "ok", text: "Your living customer thesis has been updated." });
      if (result.run) setNotice({ kind: "ok", text: `${result.run.inserted} new prospect${result.run.inserted === 1 ? "" : "s"} saved for ${(result.run.costCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}.` });
    } catch (error) {
      setPrompt(text);
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

        <div className="prospecting-mission-list">
          <div className="prospecting-list-label"><span>Mission history</span></div>
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
        <UnifiedProspectingInput
          profile={data.profile}
          selectedMission={selected}
          messages={intakeMessages}
          prompt={prompt}
          busy={busy === "intake"}
          onPrompt={setPrompt}
          onSend={() => void sendIntake()}
        />
        {selected ? (
          <MissionBoard
            mission={selected}
            accounts={data.accounts}
            metrics={metrics}
            busy={busy}
            expandedId={expandedId}
            rejectingId={rejectingId}
            rejectReason={rejectReason}
            onRun={() => void runMission()}
            onExpand={setExpandedId}
            onReview={(id, status, reason) => void review(id, status, reason)}
            onRejecting={setRejectingId}
            onRejectReason={setRejectReason}
            onFindContacts={(id) => void findContacts(id)}
          />
        ) : <ConversationPrimer hasProfile={Boolean(data.profile)} onExample={setPrompt} />}
      </main>
    </div>
  );
}

function UnifiedProspectingInput({ profile, selectedMission, messages, prompt, busy, onPrompt, onSend }: {
  profile: BusinessProfile | null;
  selectedMission: Mission | null;
  messages: IntakeTurn[];
  prompt: string;
  busy: boolean;
  onPrompt: (value: string) => void;
  onSend: () => void;
}) {
  const examples = profile
    ? ["Find 25 Midwest manufacturers showing expansion signals", "Continue the selected mission", "Update our target buyer to VP Operations"]
    : ["We install commercial solar systems for warehouses in Texas. Find operations leaders at companies expanding their footprint.", "We sell cybersecurity audits to regional banks. Find 20 likely buyers with recent compliance or hiring signals."];
  return (
    <section className="unified-agent-shell" aria-labelledby="unified-agent-title">
      <div className="unified-agent-heading">
        <div><span>One conversation · live customer research</span><h1 id="unified-agent-title">Who should Meridian find?</h1></div>
        <div className="unified-agent-context">
          <i className={profile ? "ready" : ""} />
          <span>{profile ? `${profile.businessName} thesis loaded` : "Start with what you sell"}</span>
          {selectedMission && <small>{selectedMission.name} selected</small>}
        </div>
      </div>

      <div className="unified-agent-thread" aria-live="polite">
        {messages.slice(-4).map((message, index) => (
          <div className={`unified-turn ${message.role}`} key={`${message.role}-${index}-${message.text.slice(0, 20)}`}>
            <span>{message.role === "assistant" ? <Sparkles size={12} /> : "You"}</span>
            <p>{message.text}</p>
          </div>
        ))}
        {busy && <div className="unified-turn assistant thinking"><span><Sparkles size={12} /></span><p>Reading your intent and preparing the next safe action…</p></div>}
      </div>

      <div className="unified-composer">
        <textarea
          aria-label="Tell Meridian what customers to find"
          value={prompt}
          onChange={(event) => onPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder={profile ? "Describe the next customer search, revise your thesis, or tell Meridian to continue…" : "Tell me what you sell, who benefits, and what kinds of businesses I should find…"}
          disabled={busy}
        />
        <button type="button" onClick={onSend} disabled={busy || !prompt.trim()} aria-label="Send to Meridian"><Send size={17} /></button>
        <div className="unified-composer-foot"><span>Enter to send · Shift + Enter for a new line</span><span>Paid research only runs when you explicitly ask</span></div>
      </div>

      <div className="unified-examples">
        {examples.map((example) => <button type="button" key={example} onClick={() => onPrompt(example)} disabled={busy}>{example}</button>)}
      </div>
    </section>
  );
}

function ConversationPrimer({ hasProfile, onExample }: { hasProfile: boolean; onExample: (value: string) => void }) {
  return (
    <section className="conversation-primer">
      <div><span>How the conversation works</span><h2>{hasProfile ? "Your thesis is ready. Give Meridian a search." : "One message can become a complete customer mission."}</h2></div>
      <ol>
        <li><i>01</i><div><strong>Describe the outcome</strong><p>Say what you sell and who you believe should buy it. Meridian extracts the thesis without making you fill out a form.</p></div></li>
        <li><i>02</i><div><strong>Answer one useful question</strong><p>If the request is ambiguous, Meridian asks for the single missing detail instead of guessing.</p></div></li>
        <li><i>03</i><div><strong>Run when you are ready</strong><p>Ask it to begin or continue. Live Orthogonal calls stay bounded by the mission budget and every result becomes a reviewable dossier.</p></div></li>
      </ol>
      {hasProfile && <button type="button" onClick={() => onExample("Find 25 companies that match our customer thesis and show a credible reason to buy now.")}>Draft a new mission <span>→</span></button>}
    </section>
  );
}

function MissionBoard({ mission, accounts, metrics, busy, expandedId, rejectingId, rejectReason, onRun, onExpand, onReview, onRejecting, onRejectReason, onFindContacts }: {
  mission: Mission; accounts: Account[]; metrics: { total: number; approved: number; contacts: number; average: number }; busy: string | null;
  expandedId: string | null; rejectingId: string | null; rejectReason: string; onRun: () => void; onExpand: (id: string | null) => void;
  onReview: (id: string, status: "approved" | "rejected" | "new", reason?: string) => void; onRejecting: (id: string | null) => void; onRejectReason: (value: string) => void; onFindContacts: (id: string) => void;
}) {
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
