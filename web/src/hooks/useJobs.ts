import { useCallback, useEffect, useRef, useState } from "react";
import { api, isActive } from "../api";
import type { Job, StartPayload } from "../types";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [serverToken, setServerToken] = useState(false);
  const [serverTokenIsBot, setServerTokenIsBot] = useState(false);
  const [tokenSource, setTokenSource] = useState<"env" | "stored" | "none">(
    "none"
  );
  const [serverOnline, setServerOnline] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollNonce, setPollNonce] = useState(0);

  const mounted = useRef(true);
  const selectedRef = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const refresh = useCallback(async () => {
    try {
      const status = await api.status();
      if (!mounted.current) return;
      const nextJobs = status.jobs ?? [];
      setJobs(nextJobs);
      setServerToken(Boolean(status.server_token));
      setServerTokenIsBot(Boolean(status.server_token_is_bot));
      setTokenSource(status.token_source ?? "none");
      setServerOnline(true);
      setError(null);
      const selectedStillExists =
        selectedRef.current !== null &&
        nextJobs.some((item) => item.id === selectedRef.current);
      if (selectedRef.current && !selectedStillExists) {
        setSelectedId(null);
        setJob(null);
      } else if (!selectedRef.current && nextJobs.length) {
        setSelectedId(nextJobs[0].id);
      }
    } catch (err) {
      if (mounted.current) {
        setServerOnline(false);
        setError(errorMessage(err));
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) {
      setJob(null);
      return undefined;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const data = await api.getJob(selectedId);
        if (cancelled) return;
        setJob(data.job);
        if (data.job && isActive(data.job.status)) {
          timer = setTimeout(tick, 1000);
        }
      } catch (err) {
        if (!cancelled) {
          if (errorMessage(err).toLowerCase().includes("job not found")) {
            setJob(null);
            setSelectedId(null);
            return;
          }
          setError(errorMessage(err));
          timer = setTimeout(tick, 2000);
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [selectedId, pollNonce]);

  const startJob = useCallback(
    async (payload: StartPayload): Promise<Job> => {
      setError(null);
      const data = await api.startJob(payload);
      setJob(data.job);
      setSelectedId(data.job.id);
      await refresh();
      return data.job;
    },
    [refresh]
  );

  const stopJob = useCallback(
    async (id: string): Promise<Job> => {
      const data = await api.stopJob(id);
      setJob((current) =>
        current && current.id === id ? { ...current, ...data.job } : current
      );
      await refresh();
      return data.job;
    },
    [refresh]
  );

  const resumeJob = useCallback(
    async (id: string, token: string, isBot: boolean): Promise<Job> => {
      const data = await api.resumeJob(id, token, isBot);
      setJob((current) =>
        current && current.id === id ? { ...current, ...data.job } : data.job
      );
      setPollNonce((value) => value + 1);
      await refresh();
      return data.job;
    },
    [refresh]
  );

  return {
    jobs,
    serverToken,
    serverTokenIsBot,
    tokenSource,
    serverOnline,
    job,
    selectedId,
    setSelectedId,
    startJob,
    stopJob,
    resumeJob,
    refresh,
    error,
    loading,
  };
}

export type UseJobs = ReturnType<typeof useJobs>;
