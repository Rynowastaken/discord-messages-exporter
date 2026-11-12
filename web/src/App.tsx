import { useCallback, useEffect, useRef, useState } from "react";
import useJobs from "./hooks/useJobs";
import { useHashRoute } from "./hooks/useHashRoute";
import { api } from "./api";
import TopBar from "./components/TopBar";
import TokenPrompt from "./components/TokenPrompt";
import ConsolePage from "./pages/ConsolePage";
import DashboardPage from "./pages/DashboardPage";
import ExplorerPage from "./pages/ExplorerPage";
import InsightsPage from "./pages/InsightsPage";
import MessagesPage from "./pages/MessagesPage";
import type { Identity, StartPayload, TokenStatus } from "./types";

const ACTIVE = new Set(["queued", "resolving", "running", "stopping"]);

export default function App() {
  const jobsState = useJobs();
  const route = useHashRoute();
  const [sessionToken, setSessionToken] = useState("");
  const [sessionIsBot, setSessionIsBot] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [tokenPromptOpen, setTokenPromptOpen] = useState(false);
  const [tokenPromptShown, setTokenPromptShown] = useState(false);
  const identityRequest = useRef(0);
  const activeJob = jobsState.jobs.find((item) => ACTIVE.has(item.status));
  const section =
    route.name === "dashboard"
      ? "dashboard"
      : route.name === "export"
        ? "export"
        : "explorer";

  useEffect(() => {
    const titles: Record<string, string> = {
      dashboard: "Dashboard",
      export: "Export",
      explorer: "Explorer",
      messages: "Messages",
      insights: "Insights",
    };
    document.title = `${titles[route.name] ?? "Console"} · Discord Messages Exporter`;
  }, [route.name]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [route.name, "exportId" in route ? route.exportId : ""]);

  const fetchIdentity = useCallback(
    async (
      token?: string,
      isBot?: boolean,
      options: { reportError?: boolean } = {}
    ): Promise<Identity> => {
      const { reportError = true } = options;
      const requestId = ++identityRequest.current;
      setIdentityLoading(true);
      try {
        const data = await api.me(
          token ? { token, is_bot: Boolean(isBot) } : {}
        );
        if (requestId === identityRequest.current) {
          setIdentity(data.user);
          setIdentityError(null);
        }
        return data.user;
      } catch (err) {
        if (requestId === identityRequest.current && reportError) {
          setIdentityError(
            err instanceof Error ? err.message : String(err)
          );
        }
        throw err;
      } finally {
        if (requestId === identityRequest.current) setIdentityLoading(false);
      }
    },
    []
  );

  // A server token is shared by everyone using this console; verify it once
  // when the status poll first reports it. It takes precedence over any token
  // left in session state.
  useEffect(() => {
    if (jobsState.serverToken) {
      setSessionToken("");
      setSessionIsBot(false);
      fetchIdentity().catch(() => {});
    }
  }, [jobsState.serverToken, fetchIdentity]);

  // Prompt once on the first page load when there is no usable credential.
  useEffect(() => {
    if (jobsState.loading || tokenPromptShown || sessionToken) return;
    if (!jobsState.serverToken) {
      setTokenPromptOpen(true);
      setTokenPromptShown(true);
    }
  }, [jobsState.loading, jobsState.serverToken, sessionToken, tokenPromptShown]);

  // A saved keychain token that Discord rejects gets replaced, not retried.
  useEffect(() => {
    if (
      identityError &&
      identityError.toLowerCase().includes("rejected") &&
      !identityLoading &&
      jobsState.tokenSource === "stored" &&
      !tokenPromptShown
    ) {
      setTokenPromptOpen(true);
      setTokenPromptShown(true);
    }
  }, [
    identityError,
    identityLoading,
    jobsState.tokenSource,
    tokenPromptShown,
  ]);

  // With no server token and no session token there is no identity to show.
  useEffect(() => {
    if (!jobsState.serverToken && !sessionToken) {
      identityRequest.current += 1;
      setIdentity(null);
      setIdentityError(null);
      setIdentityLoading(false);
    }
  }, [jobsState.serverToken, sessionToken]);

  const handleToken = useCallback(
    async (token: string, isBot: boolean): Promise<Identity | null> => {
      const trimmed = String(token || "").trim();
      if (!trimmed) {
        identityRequest.current += 1;
        setSessionToken("");
        setSessionIsBot(false);
        setIdentityError(null);
        setIdentity(null);
        if (jobsState.serverToken) {
          await fetchIdentity().catch(() => {});
        } else {
          setIdentityLoading(false);
        }
        return null;
      }
      const user = await fetchIdentity(trimmed, isBot, {
        reportError: false,
      });
      setSessionToken(trimmed);
      setSessionIsBot(Boolean(isBot));
      return user;
    },
    [fetchIdentity, jobsState.serverToken]
  );

  async function handleStart(payload: StartPayload) {
    setSessionToken(payload.token ?? "");
    setSessionIsBot(Boolean(payload.is_bot));
    return jobsState.startJob(payload);
  }

  async function handleTokenConnected(status: TokenStatus) {
    if (status.configured && status.user) {
      setIdentity(status.user);
      setIdentityError(null);
      setSessionToken("");
      setSessionIsBot(false);
      setTokenPromptOpen(false);
    } else if (!status.configured) {
      setIdentity(null);
      setIdentityError(null);
      setSessionToken("");
      setSessionIsBot(false);
    }
    await jobsState.refresh();
  }

  return (
    <div className="app">
      <div className="app-backdrop" aria-hidden="true" />
      <div className="shell">
        <TopBar
          section={section}
          tokenSet={jobsState.serverToken || Boolean(sessionToken)}
          onTokenClick={() => setTokenPromptOpen(true)}
        />

        <div className="page">
          <main id="content">
          {route.name === "dashboard" ? (
            <DashboardPage
              jobsState={jobsState}
              identity={identity}
              identityError={identityError}
              identityLoading={identityLoading}
            />
          ) : null}

          {route.name === "export" ? (
            <ConsolePage
              jobsState={jobsState}
              activeJob={activeJob}
              sessionToken={sessionToken}
              sessionIsBot={sessionIsBot}
              identity={identity}
              identityError={identityError}
              identityLoading={identityLoading}
              onStart={handleStart}
              onToken={handleToken}
              onRequestToken={() => setTokenPromptOpen(true)}
            />
          ) : null}

          {route.name === "explorer" ? <ExplorerPage /> : null}

          {route.name === "messages" ? (
            <MessagesPage exportId={route.exportId} initialQuery={route.query} />
          ) : null}

          {route.name === "insights" ? (
            <InsightsPage exportId={route.exportId} />
          ) : null}
        </main>

        </div>
      </div>
      <TokenPrompt
        open={tokenPromptOpen}
        onClose={() => setTokenPromptOpen(false)}
        onConnected={(status) => {
          void handleTokenConnected(status);
        }}
      />
    </div>
  );
}
