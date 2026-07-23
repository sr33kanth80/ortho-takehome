"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";

interface Settings {
  defaultPolicy: "allow" | "deny";
  maxCostPerCallCents: number;
  dailyUserLimitCents: number;
  monthlyCompanyLimitCents: number;
}

interface Policy {
  id: string;
  api: string;
  path: string;
  method: string;
  effect: "allow" | "deny";
}

interface Member {
  id: string;
  email: string;
  role: string;
  dynamicExecutionEnabled: boolean;
}

interface Execution {
  id: string;
  email: string;
  conversationId: string | null;
  api: string;
  path: string;
  method: string;
  status: string;
  estimatedCostCents: number;
  actualCostCents: number | null;
  durationMs: number | null;
  createdAt: string;
}

interface AuditEvent {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  actorEmail: string;
  createdAt: string;
}

export interface ManagementView {
  company: { id: string; name: string };
  settings: Settings;
  policies: Policy[];
  members: Member[];
  executions: Execution[];
  metrics: { total: number; succeeded: number; blocked: number; spendCents: number };
  audit: AuditEvent[];
}

interface ExecutionDetail extends Execution {
  policyDecision: string;
  requestPreview: unknown;
  responsePreview: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  upstreamRequestId: string | null;
  completedAt: string | null;
}

type Section = "pulse" | "access" | "catalog" | "executions" | "audit";

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? "Request failed");
  return body as T;
}

function money(cents: number | null | undefined) {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

function when(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function ManagementConsole({ initial, managerEmail }: { initial: ManagementView; managerEmail: string }) {
  const [data, setData] = useState(initial);
  const [section, setSection] = useState<Section>("pulse");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const successRate = data.metrics.total ? Math.round((data.metrics.succeeded / data.metrics.total) * 100) : 0;

  const refresh = async () => {
    const next = await jsonRequest<ManagementView>("/api/management/overview");
    setData(next);
  };

  const mutate = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
      await refresh();
      setNotice(message);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="management-shell">
      <aside className="management-rail">
        <Link href="/" className="management-brand" aria-label="Back to Meridian chat">
          <Compass />
          <span>Meridian</span>
        </Link>
        <p className="management-eyebrow">Company control room</p>
        <nav aria-label="Management sections">
          {([
            ["pulse", "01", "Company pulse"],
            ["access", "02", "Employee access"],
            ["catalog", "03", "API policy"],
            ["executions", "04", "Executions"],
            ["audit", "05", "Change ledger"],
          ] as const).map(([id, number, label]) => (
            <button key={id} onClick={() => setSection(id)} className={section === id ? "active" : ""}>
              <span>{number}</span>{label}
            </button>
          ))}
        </nav>
        <div className="management-rail-foot">
          <span>Manager</span>
          <p>{managerEmail}</p>
          <Link href="/">Return to employee view →</Link>
        </div>
      </aside>

      <main className="management-main">
        <header className="management-header">
          <div>
            <p>{data.company.name} · Dynamic API execution</p>
            <h1>{section === "pulse" ? "Company pulse" : section === "access" ? "Employee access" : section === "catalog" ? "API policy" : section === "executions" ? "Execution ledger" : "Change ledger"}</h1>
          </div>
          <div className="management-live"><i /> enforcement live</div>
        </header>

        {notice && <div className="management-notice" role="status">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}

        {section === "pulse" && (
          <Pulse data={data} successRate={successRate} settings={data.settings} busy={busy} onSave={(settings) => mutate(() => jsonRequest("/api/management/settings", { method: "PATCH", body: JSON.stringify(settings) }), "Company limits updated and recorded.")} />
        )}
        {section === "access" && (
          <Access members={data.members} busy={busy} onToggle={(member) => mutate(() => jsonRequest(`/api/management/members/${member.id}`, { method: "PATCH", body: JSON.stringify({ dynamicExecutionEnabled: !member.dynamicExecutionEnabled }) }), `${member.email} access updated.`)} />
        )}
        {section === "catalog" && (
          <Catalog policies={data.policies} defaultPolicy={data.settings.defaultPolicy} busy={busy} onAdd={(policy) => mutate(() => jsonRequest("/api/management/policies", { method: "POST", body: JSON.stringify(policy) }), "Endpoint policy saved.")} onDelete={(id) => mutate(() => jsonRequest(`/api/management/policies/${id}`, { method: "DELETE" }), "Endpoint policy removed.")} />
        )}
        {section === "executions" && (
          <Executions executions={data.executions} onOpen={async (id) => {
            try {
              const result = await jsonRequest<{ execution: ExecutionDetail }>(`/api/management/executions/${id}`);
              setDetail(result.execution);
            } catch (error) { setNotice((error as Error).message); }
          }} />
        )}
        {section === "audit" && <Audit events={data.audit} />}
      </main>
      {detail && <ExecutionDrawer execution={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Pulse({ data, successRate, settings, busy, onSave }: { data: ManagementView; successRate: number; settings: Settings; busy: boolean; onSave: (value: Settings) => void }) {
  const [form, setForm] = useState(settings);
  return <div className="management-stack">
    <section className="management-metrics" aria-label="This month">
      <Metric label="Executions" value={String(data.metrics.total)} note="this month" />
      <Metric label="API spend" value={money(data.metrics.spendCents)} note={`${money(settings.monthlyCompanyLimitCents)} ceiling`} />
      <Metric label="Success rate" value={`${successRate}%`} note={`${data.metrics.blocked} blocked by policy`} />
      <Metric label="Active employees" value={String(data.members.filter((member) => member.dynamicExecutionEnabled).length)} note={`of ${data.members.length} enrolled`} />
    </section>
    <section className="management-sheet">
      <div className="management-section-copy"><span>03 / Spend and usage limits</span><h2>Set the financial perimeter.</h2><p>Reservations happen before a paid API call, under a database lock. Parallel requests share the same limits.</p></div>
      <form className="management-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <label>Catalog default<select value={form.defaultPolicy} onChange={(event) => setForm({ ...form, defaultPolicy: event.target.value as Settings["defaultPolicy"] })}><option value="deny">Deny unless listed</option><option value="allow">Allow unless blocked</option></select></label>
        <label>Maximum per call <MoneyInput value={form.maxCostPerCallCents} onChange={(value) => setForm({ ...form, maxCostPerCallCents: value })} /></label>
        <label>Daily per employee <MoneyInput value={form.dailyUserLimitCents} onChange={(value) => setForm({ ...form, dailyUserLimitCents: value })} /></label>
        <label>Monthly company <MoneyInput value={form.monthlyCompanyLimitCents} onChange={(value) => setForm({ ...form, monthlyCompanyLimitCents: value })} /></label>
        <button disabled={busy}>Save limits <span>→</span></button>
      </form>
    </section>
  </div>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article><span>{label}</span><strong>{value}</strong><p>{note}</p></article>;
}

function MoneyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="management-money"><span>$</span><input type="number" min="0" step="0.01" value={(value / 100).toFixed(2)} onChange={(event) => onChange(Math.round(Number(event.target.value) * 100))} /></div>;
}

function Access({ members, busy, onToggle }: { members: Member[]; busy: boolean; onToggle: (member: Member) => void }) {
  return <section className="management-ledger"><div className="management-intro"><span>02 / Employee execution access</span><h2>Who may leave the built-in path?</h2><p>Suspension is checked again at execution time, even if an employee already started an agent turn.</p></div><div className="management-table"><div className="management-table-head"><span>Employee</span><span>Role</span><span>Dynamic execution</span></div>{members.map((member) => <div className="management-table-row" key={member.id}><span><strong>{member.email}</strong></span><span className="management-mono">{member.role}</span><span><button className={`management-toggle ${member.dynamicExecutionEnabled ? "on" : ""}`} disabled={busy} onClick={() => onToggle(member)} aria-pressed={member.dynamicExecutionEnabled}><i />{member.dynamicExecutionEnabled ? "Enabled" : "Suspended"}</button></span></div>)}</div></section>;
}

function Catalog({ policies, defaultPolicy, busy, onAdd, onDelete }: { policies: Policy[]; defaultPolicy: string; busy: boolean; onAdd: (policy: Omit<Policy, "id">) => void; onDelete: (id: string) => void }) {
  const [form, setForm] = useState<Omit<Policy, "id">>({ api: "", path: "", method: "GET", effect: "allow" });
  return <div className="management-stack"><section className="management-intro"><span>01 / API access policy</span><h2>The catalog has a company perimeter.</h2><p>The default is <strong>{defaultPolicy}</strong>. Explicit endpoint rules override it at discovery, inspection, and execution.</p></section><form className="policy-composer" onSubmit={(event: FormEvent) => { event.preventDefault(); onAdd(form); setForm({ ...form, api: "", path: "" }); }}><label>API slug<input required placeholder="tomba" value={form.api} onChange={(event) => setForm({ ...form, api: event.target.value })} /></label><label>Endpoint path<input required placeholder="/v1/companies/find" value={form.path} onChange={(event) => setForm({ ...form, path: event.target.value })} /></label><label>Method<select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>{["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => <option key={method}>{method}</option>)}</select></label><label>Decision<select value={form.effect} onChange={(event) => setForm({ ...form, effect: event.target.value as Policy["effect"] })}><option value="allow">Allow</option><option value="deny">Deny</option></select></label><button disabled={busy}>Save rule →</button></form><div className="management-table"><div className="management-table-head policy"><span>Endpoint</span><span>Method</span><span>Decision</span><span /></div>{policies.map((policy) => <div className="management-table-row policy" key={policy.id}><span><strong>{policy.api}</strong><small>{policy.path}</small></span><span className="management-mono">{policy.method}</span><span className={`policy-effect ${policy.effect}`}>{policy.effect}</span><span><button className="management-delete" disabled={busy} onClick={() => onDelete(policy.id)}>remove</button></span></div>)}{!policies.length && <p className="management-empty">No explicit endpoint rules yet.</p>}</div></div>;
}

function Executions({ executions, onOpen }: { executions: Execution[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => executions.filter((execution) => `${execution.api} ${execution.path} ${execution.email} ${execution.status}`.toLowerCase().includes(query.toLowerCase())), [executions, query]);
  return <section className="management-ledger"><div className="management-intro execution-intro"><div><span>Monitoring / last 100</span><h2>Every decision leaves a trail.</h2></div><input aria-label="Filter executions" placeholder="Filter employee, API, or status" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="management-table"><div className="management-table-head execution"><span>When / employee</span><span>Endpoint</span><span>Status</span><span>Cost</span></div>{visible.map((execution) => <button className="management-table-row execution" key={execution.id} onClick={() => onOpen(execution.id)}><span><strong>{when(execution.createdAt)}</strong><small>{execution.email}</small></span><span><strong>{execution.api}</strong><small>{execution.method} {execution.path}</small></span><span className={`execution-status ${execution.status}`}>{execution.status}</span><span className="management-mono">{money(execution.actualCostCents ?? execution.estimatedCostCents)}</span></button>)}{!visible.length && <p className="management-empty">No executions match this view.</p>}</div></section>;
}

function Audit({ events }: { events: AuditEvent[] }) {
  return <section className="management-ledger"><div className="management-intro"><span>Append-only governance history</span><h2>Policy changes are evidence.</h2><p>Every manager mutation records the actor, target, and time. Audit events cannot be edited from this workspace.</p></div><ol className="audit-list">{events.map((event) => <li key={event.id}><i /><div><strong>{event.action.replaceAll(".", " ")}</strong><p>{event.targetType} · {event.targetId}</p></div><span>{event.actorEmail}<small>{when(event.createdAt)}</small></span></li>)}{!events.length && <p className="management-empty">No governance changes recorded yet.</p>}</ol></section>;
}

function ExecutionDrawer({ execution, onClose }: { execution: ExecutionDetail; onClose: () => void }) {
  return <div className="execution-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="execution-drawer" aria-label="Execution investigation"><button className="drawer-close" onClick={onClose}>Close ×</button><p className="management-eyebrow">Execution investigation</p><h2>{execution.api}</h2><p className="drawer-path">{execution.method} {execution.path}</p><div className="drawer-facts"><span>Status<strong className={`execution-status ${execution.status}`}>{execution.status}</strong></span><span>Employee<strong>{execution.email}</strong></span><span>Cost<strong>{money(execution.actualCostCents ?? execution.estimatedCostCents)}</strong></span><span>Duration<strong>{execution.durationMs ? `${execution.durationMs} ms` : "—"}</strong></span></div><DrawerBlock label="Policy decision" value={execution.policyDecision} /><DrawerBlock label="Validated request preview" value={execution.requestPreview} /><DrawerBlock label="Response preview" value={execution.responsePreview} />{execution.errorMessage && <DrawerBlock label={`Error · ${execution.errorCode}`} value={execution.errorMessage} />}<div className="drawer-id"><span>Meridian execution ID</span><code>{execution.id}</code><span>Upstream request ID</span><code>{execution.upstreamRequestId ?? "not provided"}</code></div>{execution.conversationId && <Link className="drawer-link" href={`/?conversation=${encodeURIComponent(execution.conversationId)}`}>Open employee conversation →</Link>}</aside></div>;
}

function DrawerBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return <section className="drawer-block"><span>{label}</span><pre>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre></section>;
}

function Compass() {
  return <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden><path d="M12 1 Q13 11 23 12 Q13 13 12 23 Q11 13 1 12 Q11 11 12 1 Z" fill="currentColor" /></svg>;
}
