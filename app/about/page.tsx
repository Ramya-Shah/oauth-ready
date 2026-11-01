import { LABEL_HELP, LABEL_TEXT } from "@/components/bits";
import { DIFFICULTY_RUBRIC } from "@/lib/schema";

export const metadata = { title: "How it works · OAuth Ready" };

export default function About() {
  return (
    <article style={{ maxWidth: 760 }}>
      <h1>How it works</h1>
      <p>
        To let users connect Gmail, Slack or HubSpot to your agent, you first register an <b>OAuth app</b> with that provider — your
        product's identity (client ID, secret, redirect URI, scopes). Every user who clicks “Connect” creates a <b>connection</b> through
        that one app. Creating the app is often minutes; getting it approved so <i>any</i> customer can connect can take weeks. That
        gap is what this tool is about.
      </p>

      <h2>What every guide answers first</h2>
      <ul>
        <li><b>Difficulty</b> on a fixed 1–5 rubric.</li>
        <li><b>Hands-on effort</b> (your team's hours) separately from <b>approval wait</b> (calendar days you can only wait on).</li>
        <li><b>The most likely blocker</b>, then steps split into <i>create → test with your own account → production</i>.</li>
        <li><b>Who does each step</b>: an agent, you, or the provider.</li>
      </ul>
      <table>
        <thead><tr><th>Level</th><th>Meaning</th></tr></thead>
        <tbody>{[1, 2, 3, 4, 5].map((n) => <tr key={n}><td>{n}</td><td>{DIFFICULTY_RUBRIC[n]}</td></tr>)}</tbody>
      </table>

      <h2>Evidence labels</h2>
      <table>
        <tbody>
          {(["tested", "sourced", "community", "uncertain"] as const).map((l) => (
            <tr key={l}><td><span className={`pill ${l}`}>{LABEL_TEXT[l]}</span></td><td>{LABEL_HELP[l]}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">The model never chooses a label. It cites a source number plus a verbatim quote, or a probe number; code then checks the quote against the fetched page text and the probe against this run's results, and downgrades anything that doesn't match.</p>

      <h2>The agent pipeline</h2>
      <ol>
        <li><b>Identify</b> the product and its official domain (Tavily search + Gemini).</li>
        <li><b>Search</b> the provider's own domain for app registration, review/verification and scopes, plus one broad search for community reports.</li>
        <li><b>Read</b> up to ~11 pages through a guarded fetcher (https only, public IPs only, redirect re-checks, size and time caps), following one hop of relevant links on official pages.</li>
        <li><b>Probe</b> live endpoints: <code>/.well-known/openid-configuration</code> discovery and the authorize endpoint with a deliberately invalid <code>client_id</code>. The response proves the endpoint and shows how it rejects unknown clients.</li>
        <li><b>Draft</b> the guide (Gemini, JSON only) from the fetched text and probe results — nothing else.</li>
        <li><b>Enforce evidence</b> in code, then save and give you a shareable link.</li>
      </ol>

      <h2>What an agent can and can't do here</h2>
      <p>
        An agent can research, draft copy (privacy policy, listing text, scope justifications), fill setup forms once <i>you</i> are signed
        in, configure redirect URIs and scopes, and run test OAuth flows. It can't sign up or sign in as you, accept legal terms, pay for a
        security assessment, or speed up a provider's review queue — those steps are marked <span className="pill you">🧑 You</span> or{" "}
        <span className="pill provider">⌛ Provider</span>.
      </p>

      <h2>Limits</h2>
      <ul>
        <li>Review timelines and costs are rarely documented; expect them to be community-sourced or uncertain.</li>
        <li>Runs on the free Gemini tier, so the model can be busy and fall back to a lighter model (shown on each guide).</li>
        <li>Some docs sites block automated fetching; then the search engine's page extract is used and marked as such.</li>
      </ul>
    </article>
  );
}
