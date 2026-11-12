import type { ReactNode } from "react";
import type { Identity } from "../types";

interface GreetingProps {
  identity: Identity | null;
  identityError: string | null;
  identityLoading: boolean;
  serverToken: boolean;
  statusLoading: boolean;
  serverOnline: boolean;
}

export default function Greeting({
  identity,
  identityError,
  identityLoading,
  serverToken,
  statusLoading,
  serverOnline,
}: GreetingProps) {
  const name = identity
    ? identity.global_name?.trim() || identity.username || "there"
    : "sign in";
  const hour = new Date().getHours();
  const partOfDay =
    hour < 5
      ? "good night"
      : hour < 12
        ? "good morning"
        : hour < 18
          ? "good afternoon"
          : "good evening";

  let meta: ReactNode;
  let metaError = false;
  if (identity) {
    meta = (
      <>
        Signed in as @{identity.username} · {identity.bot ? "bot" : "user"}
      </>
    );
  } else if (identityLoading) {
    meta = "Checking the token…";
  } else if (identityError) {
    meta = serverToken
      ? "The server token could not be verified."
      : "The token could not be verified.";
    metaError = true;
  } else if (serverToken) {
    meta = "Using the server token";
  } else if (statusLoading) {
    meta = "Checking the server…";
  } else if (!serverOnline) {
    meta = "Server unreachable.";
    metaError = true;
  } else {
    meta = "No token configured.";
  }

  return (
    <section className="greeting">
      <h1 className="greeting-title">
        {partOfDay}, <span className="greeting-name">{name}</span>
      </h1>
      <p className="greeting-sub">
        One author, one channel, or a whole server — resumable, paced, and
        searchable.
      </p>
      <p
        className={`greeting-meta${metaError ? " greeting-meta--error" : ""}`}
        aria-live="polite"
      >
        {meta}
      </p>
    </section>
  );
}
