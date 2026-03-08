"use client";

// =============================================================================
// NORMA CMO Agent — Human Review Dashboard
// Next.js 14 App Router | Dark theme | Real-time via Supabase
// =============================================================================

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PostStatus = "draft" | "scheduled" | "paused" | "published" | "failed" | "deleted";

interface ContentCalendarRow {
  id: string;
  platform: string;
  content_type: string;
  body: string;
  media_urls: string[];
  hashtags: string[];
  status: PostStatus;
  scheduled_for: string | null;
  published_at: string | null;
  platform_post_id: string | null;
  generation_prompt: string | null;
  human_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface EditState {
  postId: string;
  body: string;
  human_notes: string;
}

interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  text: string;
}

// ---------------------------------------------------------------------------
// Supabase client (lazy singleton — avoids re-creating on re-renders)
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.",
    );
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function formatScheduledTime(iso: string | null): string {
  if (!iso) return "Unscheduled";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

function formatPublishedTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffHours < 1) {
    const mins = Math.floor(diffMs / 60000);
    return `${mins}m ago`;
  }
  if (diffHours < 24) {
    return `${Math.floor(diffHours)}h ago`;
  }
  if (diffDays < 7) {
    return `${Math.floor(diffDays)}d ago`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function tweetCharCount(text: string): number {
  // Simplified: Twitter counts URLs as 23 chars regardless of actual length.
  // This approximation is good enough for the dashboard.
  return text.replace(/https?:\/\/\S+/g, "                       ").length;
}

function isOverLimit(text: string): boolean {
  return tweetCharCount(text) > 280;
}

function getPlatformIcon(platform: string): string {
  const icons: Record<string, string> = {
    twitter: "𝕏",
    instagram: "📸",
    linkedin: "in",
    tiktok: "♪",
    facebook: "f",
  };
  return icons[platform] ?? platform.charAt(0).toUpperCase();
}

function getPlatformColor(platform: string): string {
  const colors: Record<string, string> = {
    twitter: "bg-zinc-800 text-zinc-200 border border-zinc-700",
    instagram: "bg-pink-950 text-pink-300 border border-pink-800",
    linkedin: "bg-blue-950 text-blue-300 border border-blue-800",
    tiktok: "bg-zinc-900 text-white border border-zinc-600",
    facebook: "bg-blue-950 text-blue-300 border border-blue-800",
  };
  return colors[platform] ?? "bg-zinc-800 text-zinc-300 border border-zinc-700";
}

function getStatusBadge(status: PostStatus): { label: string; className: string } {
  const map: Record<PostStatus, { label: string; className: string }> = {
    draft: {
      label: "Draft",
      className: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    },
    scheduled: {
      label: "Scheduled",
      className: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    },
    paused: {
      label: "Paused",
      className: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    },
    published: {
      label: "Published",
      className: "bg-green-500/20 text-green-400 border border-green-500/30",
    },
    failed: {
      label: "Failed",
      className: "bg-red-500/20 text-red-400 border border-red-500/30",
    },
    deleted: {
      label: "Deleted",
      className: "bg-zinc-700/50 text-zinc-500 border border-zinc-700",
    },
  };
  return map[status] ?? { label: status, className: "bg-zinc-700 text-zinc-400" };
}

// ---------------------------------------------------------------------------
// Toast Component
// ---------------------------------------------------------------------------

function Toast({ messages, onDismiss }: { messages: ToastMessage[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex items-start gap-3 rounded-lg px-4 py-3 shadow-xl border text-sm font-medium
            ${msg.type === "success" ? "bg-green-950 border-green-700 text-green-300" : ""}
            ${msg.type === "error" ? "bg-red-950 border-red-700 text-red-300" : ""}
            ${msg.type === "info" ? "bg-slate-800 border-slate-600 text-slate-200" : ""}
          `}
        >
          <span className="flex-1">{msg.text}</span>
          <button
            onClick={() => onDismiss(msg.id)}
            className="text-current opacity-60 hover:opacity-100 transition-opacity ml-1 text-base leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Modal
// ---------------------------------------------------------------------------

function EditModal({
  editState,
  onSave,
  onCancel,
  isSaving,
}: {
  editState: EditState;
  onSave: (updated: EditState) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [body, setBody] = useState(editState.body);
  const [notes, setNotes] = useState(editState.human_notes);
  const charCount = tweetCharCount(body);
  const over = charCount > 280;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold text-base">Edit Post</h2>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
              Tweet Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className={`w-full bg-slate-800 border rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500
                focus:outline-none focus:ring-2 resize-none leading-relaxed
                ${over
                  ? "border-red-600 focus:ring-red-600/50"
                  : "border-slate-600 focus:ring-orange-500/50"
                }
              `}
              placeholder="Tweet content..."
            />
            <div
              className={`text-right text-xs mt-1 font-mono ${
                over ? "text-red-400" : charCount > 260 ? "text-yellow-400" : "text-slate-500"
              }`}
            >
              {charCount} / 280
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
              Human Notes (internal only)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white
                placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              placeholder="Optional internal notes..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({ postId: editState.postId, body, human_notes: notes })
            }
            disabled={isSaving || over || !body.trim()}
            className="px-5 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40
              disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft Post Card
// ------------------------------------------------------------------------------

function DraftPostCard({
  post,
  onPause,
  onResume,
  onEdit,
  onDelete,
  isLoading,
}: {
  post: ContentCalendarRow;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onEdit: (post: ContentCalendarRow) => void;
  onDelete: (id: string) => void;
  isLoading: boolean;
}) {
  const { label: statusLabel, className: statusClass } = getStatusBadge(post.status);
  const charCount = tweetCharCount(post.body);
  const isPaused = post.status === "paused";

  return (
    <div
      className={`bg-slate-900 border rounded-xl p-5 space-y-4 transition-opacity
        ${isPaused ? "border-yellow-700/50 opacity-70" : "border-slate-700"}
      `}
    >
      {/* Top bar */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Platform badge */}
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-md ${getPlatformColor(
              post.platform,
            )}`}
          >
            <span>{getPlatformIcon(post.platform)}</span>
            <span className="uppercase tracking-wider">{post.platform}</span>
          </span>

          {/* Status badge */}
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-md ${statusClass}`}
          >
            {statusLabel}
          </span>

          {/* Content type */}
          <span className="text-xs text-slate-500 font-mono">{post.content_type}</span>
        </div>

        {/* Char count */}
        <span
          className={`text-xs font-mono shrink-0 ${
            charCount > 270 ? "text-red-400" : "text-slate-500"
          }`}
        >
          {charCount}/280
        </span>
      </div>

      {/* Body text */}
      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
        {post.body}
      </p>

      {/* Hashtags */}
      {post.hashtags && post.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {post.hashtags.map((tag) => (
            <span
              key={tag}
              className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded px-1.5 py-0.5 font-mono"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Scheduled time */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <svg
          className="w-3.5 h-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>
          {isPaused ? (
            <span className="text-yellow-400 font-medium">Paused — </span>
          ) : (
            "Auto-publishes "
          )}
          {formatScheduledTime(post.scheduled_for)}
        </span>
      </div>

      {/* Human notes */}
      {post.human_notes && (
        <p className="text-xs text-slate-500 italic border-l-2 border-slate-700 pl-3">
          {post.human_notes}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
        {isPaused ? (
          <button
            onClick={() => onResume(post.id)}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs font-semibold text-green-400 hover:text-green-300
              bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 px-3 py-1.5 rounded-md
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"
              />
            </svg>
            Resume
          </button>
        ) : (
          <button
            onClick={() => onPause(post.id)}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs font-semibold text-yellow-400 hover:text-yellow-300
              bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 px-3 py-1.5 rounded-md
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Pause
          </button>
        )}

        <button
          onClick={() => onEdit(post)}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white
            bg-slate-700/50 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded-md
            transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          Edit
        </button>

        <button
          onClick={() => onDelete(post.id)}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300
            bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-md
            transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          Delete
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Published Post Row
// ---------------------------------------------------------------------------

function PublishedPostRow({ post }: { post: ContentCalendarRow }) {
  const twitterUrl = post.platform_post_id
    ? `https://twitter.com/watchNORMA/status/${post.platform_post_id}`
    : null;

  return (
    <div className="flex gap-4 py-3.5 border-b border-slate-800 last:border-0 group">
      {/* Platform icon */}
      <div
        className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${getPlatformColor(
          post.platform,
        )}`}
      >
        {getPlatformIcon(post.platform)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
          {post.body}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs text-slate-500">
            {formatPublishedTime(post.published_at)}
          </span>
          {twitterUrl && (
            <a
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1"
            >
              View on 𝕏
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function CMODashboardPage() {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function getClient() {
    if (!supabaseRef.current) {
      supabaseRef.current = getSupabaseClient();
    }
    return supabaseRef.current;
  }

  const [draftPosts, setDraftPosts] = useState<ContentCalendarRow[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<ContentCalendarRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPostId, setLoadingPostId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ---------------------------------------------------------------------------
  // Toast helpers
  // ---------------------------------------------------------------------------

  const addToast = useCallback((type: ToastMessage["type"], text: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchPosts = useCallback(async () => {
    try {
      const supabase = getClient();

      const [draftRes, publishedRes] = await Promise.all([
        supabase
          .from("content_calendar")
          .select("*")
          .in("status", ["draft", "scheduled", "paused", "failed"])
          .order("scheduled_for", { ascending: true })
          .limit(50),

        supabase
          .from("content_calendar")
          .select("*")
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(30),
      ]);

      if (draftRes.error) throw new Error(draftRes.error.message);
      if (publishedRes.error) throw new Error(publishedRes.error.message);

      setDraftPosts((draftRes.data as ContentCalendarRow[]) ?? []);
      setPublishedPosts((publishedRes.data as ContentCalendarRow[]) ?? []);
      setLastRefreshed(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load posts";
      addToast("error", `Data fetch failed: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  // ---------------------------------------------------------------------------
  // Real-time subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetchPosts();

    const supabase = getClient();

    const channel = supabase
      .channel("cmo-content-calendar")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "content_calendar",
        },
        (payload) => {
          console.log("[CMO Dashboard] Real-time update:", payload.eventType);
          // Re-fetch on any change — simple and reliable
          fetchPosts();
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchPosts]);

  // ---------------------------------------------------------------------------
  // Post action handlers
  // ---------------------------------------------------------------------------

  const handleStatusChange = useCallback(
    async (postId: string, newStatus: PostStatus) => {
      setLoadingPostId(postId);
      try {
        const supabase = getClient();
        const { error } = await supabase
          .from("content_calendar")
          .update({ status: newStatus })
          .eq("id", postId);

        if (error) throw new Error(error.message);

        const actionVerb =
          newStatus === "paused"
            ? "paused"
            : newStatus === "draft"
            ? "resumed"
            : newStatus === "deleted"
            ? "deleted"
            : newStatus;

        addToast("success", `Post ${actionVerb} successfully.`);
        await fetchPosts();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed";
        addToast("error", `Failed to update post: ${message}`);
      } finally {
        setLoadingPostId(null);
      }
    },
    [addToast, fetchPosts],
  );

  const handlePause = useCallback(
    (id: string) => handleStatusChange(id, "paused"),
    [handleStatusChange],
  );

  const handleResume = useCallback(
    (id: string) => handleStatusChange(id, "draft"),
    [handleStatusChange],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const confirmed = window.confirm(
        "Are you sure you want to delete this post? It won't be published.",
      );
      if (confirmed) {
        handleStatusChange(id, "deleted");
      }
    },
    [handleStatusChange],
  );

  const handleOpenEdit = useCallback((post: ContentCalendarRow) => {
    setEditState({
      postId: post.id,
      body: post.body,
      human_notes: post.human_notes ?? "",
    });
  }, []);

  const handleSaveEdit = useCallback(
    async (updated: EditState) => {
      setIsSaving(true);
      try {
        const supabase = getClient();
        const { error } = await supabase
          .from("content_calendar")
          .update({
            body: updated.body.trim(),
            human_notes: updated.human_notes.trim() || null,
          })
          .eq("id", updated.postId);

        if (error) throw new Error(error.message);

        addToast("success", "Post updated successfully.");
        setEditState(null);
        await fetchPosts();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed";
        addToast("error", `Failed to save changes: ${message}`);
      } finally {
        setIsSaving(false);
      }
    },
    [addToast, fetchPosts],
  );

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const draftCount = draftPosts.filter((p) => p.status === "draft" || p.status === "scheduled").length;
  const pausedCount = draftPosts.filter((p) => p.status === "paused").length;
  const failedCount = draftPosts.filter((p) => p.status === "failed").length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Edit Modal */}
      {editState && (
        <EditModal
          editState={editState}
          onSave={handleSaveEdit}
          onCancel={() => setEditState(null)}
          isSaving={isSaving}
        />
      )}

      {/* Toasts */}
      <Toast messages={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo / wordmark */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center font-black text-sm tracking-tight">
                N
              </div>
              <div>
                <span className="text-white font-bold text-base tracking-tight">NORMA</span>
                <span className="text-slate-500 text-base"> / CMO Agent</span>
              </div>
            </div>

            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1 text-xs font-medium text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Last refreshed */}
            {lastRefreshed && (
              <span className="text-xs text-slate-500 hidden md:block">
                Updated {lastRefreshed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}

            {/* Manual refresh */}
            <button
              onClick={() => { setIsLoading(true); fetchPosts(); }}
              disabled={isLoading}
              className="text-slate-400 hover:text-white transition-colors disabled:opacity-40"
              aria-label="Refresh"
            >
              <svg
                className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>

            {/* External link */}
            <a
              href="https://getnorma.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors hidden sm:block"
            >
              getnorma.app ↗
            </a>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* Page title + description */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Content Queue</h1>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            AI-generated posts are added every 6 hours and auto-publish unless paused or deleted.
            Review drafts below, make edits, or pause individual posts before they go live.
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            {
              label: "Ready to Publish",
              value: isLoading ? "—" : String(draftCount),
              color: "text-orange-400",
              bg: "bg-orange-500/10 border-orange-500/20",
            },
            {
              label: "Paused",
              value: isLoading ? "—" : String(pausedCount),
              color: "text-yellow-400",
              bg: "bg-yellow-500/10 border-yellow-500/20",
            },
            {
              label: "Failed",
              value: isLoading ? "—" : String(failedCount),
              color: "text-red-400",
              bg: "bg-red-500/10 border-red-500/20",
            },
            {
              label: "Published (recent)",
              value: isLoading ? "—" : String(publishedPosts.length),
              color: "text-green-400",
              bg: "bg-green-500/10 border-green-500/20",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`rounded-xl border px-4 py-3.5 ${stat.bg}`}
            >
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-slate-400 mt-0.5 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Auto-publish notice */}
        <div className="flex items-start gap-3 bg-orange-500/5 border border-orange-500/20 rounded-xl px-4 py-3.5 mb-8">
          <svg
            className="w-4 h-4 text-orange-400 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-slate-300">
            <span className="text-orange-400 font-semibold">Auto-publishes unless paused.</span>{" "}
            Drafts are scheduled at 11 AM, 2 PM, 6 PM, and 9 PM ET. The CMO agent generates new
            content every 6 hours. Max 10 posts per day.
          </p>
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ---- Draft Queue ---- */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Draft Queue
                {draftPosts.length > 0 && (
                  <span className="text-xs font-semibold bg-slate-700 text-slate-300 rounded-full px-2 py-0.5">
                    {draftPosts.length}
                  </span>
                )}
              </h2>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse"
                  >
                    <div className="flex gap-2 mb-3">
                      <div className="w-16 h-5 bg-slate-800 rounded" />
                      <div className="w-12 h-5 bg-slate-800 rounded" />
                    </div>
                    <div className="space-y-2">
                      <div className="w-full h-4 bg-slate-800 rounded" />
                      <div className="w-4/5 h-4 bg-slate-800 rounded" />
                      <div className="w-3/5 h-4 bg-slate-800 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : draftPosts.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 border-dashed rounded-xl p-8 text-center">
                <div className="text-3xl mb-3">📭</div>
                <p className="text-slate-400 text-sm font-medium">No posts in queue</p>
                <p className="text-slate-600 text-xs mt-1">
                  The CMO agent generates new content every 6 hours.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {draftPosts.map((post) => (
                  <DraftPostCard
                    key={post.id}
                    post={post}
                    onPause={handlePause}
                    onResume={handleResume}
                    onEdit={handleOpenEdit}
                    onDelete={handleDelete}
                    isLoading={loadingPostId === post.id}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ---- Published History ---- */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Published History
                {publishedPosts.length > 0 && (
                  <span className="text-xs font-semibold bg-slate-700 text-slate-300 rounded-full px-2 py-0.5">
                    {publishedPosts.length}
                  </span>
                )}
              </h2>
              {publishedPosts.length > 0 && (
                <a
                  href="https://twitter.com/watchNORMA"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  @watchNORMA ↗
                </a>
              )}
            </div>

            {isLoading ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800 animate-pulse">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-3 p-4">
                    <div className="w-7 h-7 bg-slate-800 rounded-md shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="w-full h-3 bg-slate-800 rounded" />
                      <div className="w-3/4 h-3 bg-slate-800 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : publishedPosts.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 border-dashed rounded-xl p-8 text-center">
                <div className="text-3xl mb-3">🚀</div>
                <p className="text-slate-400 text-sm font-medium">No posts published yet</p>
                <p className="text-slate-600 text-xs mt-1">
                  Published posts will appear here with links to 𝕏.
                </p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 divide-y divide-slate-800 max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
                {publishedPosts.map((post) => (
                  <PublishedPostRow key={post.id} post={post} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-600">
          <span>NORMA CMO Agent — Powered by Claude Opus 4.5</span>
          <span>
            Content generated every 6h · Published via 𝕏 API v2 · Vickrey auction ad engine
          </span>
        </footer>
      </main>
    </div>
  );
}
