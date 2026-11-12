import { useEffect, useState } from "react";
import { ArrowUp, Folder, HardDrive, Home, LoaderCircle } from "lucide-react";
import { api } from "../api";
import { humanizeError } from "../lib/errors";
import type { DirectoryListing } from "../types";

interface FolderBrowserProps {
  initialPath?: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export default function FolderBrowser({
  initialPath,
  onClose,
  onSelect,
}: FolderBrowserProps) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function open(path: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.directories(path);
      setListing(data.listing);
      if (data.listing.error) setError(data.listing.error);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void open(initialPath ?? "");
    // The picker is mounted fresh each time it is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="folder-browser" aria-label="Choose export folder">
      <div className="folder-browser-head">
        <button
          type="button"
          className="folder-nav"
          onClick={() => listing?.parent && void open(listing.parent)}
          disabled={!listing?.parent || loading}
          aria-label="Parent folder"
          title="Parent folder"
        >
          <ArrowUp size={15} strokeWidth={1.5} />
        </button>
        <span className="folder-path" title={listing?.path}>
          <HardDrive size={13} strokeWidth={1.5} aria-hidden="true" />
          {listing?.path ?? "Loading…"}
        </span>
        <button
          type="button"
          className="folder-nav"
          onClick={() => listing?.home && void open(listing.home)}
          disabled={!listing?.home || loading}
          aria-label="Home folder"
          title="Home folder"
        >
          <Home size={15} strokeWidth={1.5} />
        </button>
      </div>

      <div className="folder-list" role="group" aria-label="Folders">
        {loading ? (
          <span className="folder-list-note">
            <LoaderCircle size={15} strokeWidth={1.5} className="spin" />
            Reading folders…
          </span>
        ) : listing?.entries.length ? (
          listing.entries.map((entry) => (
            <button
              type="button"
              className="folder-entry"
              key={entry.path}
              onClick={() => void open(entry.path)}
              title={entry.path}
            >
              <Folder size={15} strokeWidth={1.5} aria-hidden="true" />
              <span>{entry.name}</span>
            </button>
          ))
        ) : (
          <span className="folder-list-note">No subfolders here.</span>
        )}
        {listing?.truncated ? (
          <span className="folder-list-note">
            Showing the first 500 folders.
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="console-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="folder-browser-actions">
        <button type="button" className="soft-button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!listing || Boolean(error) || loading}
          onClick={() => listing && onSelect(listing.path)}
        >
          Use this folder
        </button>
      </div>
    </div>
  );
}
