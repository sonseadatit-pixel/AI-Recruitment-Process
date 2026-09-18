import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AssistantIcon,
  AttachIcon,
  BackIcon,
  FileIcon,
  HistoryIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from './icons';
import {
  createConversation,
  deleteConversation,
  fetchConversationMessages,
  fetchConversations,
  sendAssistantMessage,
} from '../services/api';
import type { ChatAttachment, ChatMessage, ConversationSummary } from '../types';
import { formatRelativeTime } from '../utils/formatDate';

const WELCOME_TEXT =
  "Hi! I'm the TalentAI assistant. Ask me anything — general HR or recruitment questions, drafting text, or attach a resume/CV (PDF, DOCX, or a screenshot) and I'll review it.";

const ACCEPTED_ATTACHMENTS = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function isImageType(type: string | undefined, name?: string): boolean {
  if (type && type.startsWith('image/')) return true;
  return Boolean(name && /\.(png|jpe?g|gif|webp)$/i.test(name));
}

async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const buffer = await file.arrayBuffer();
  return {
    name: file.name || 'pasted-image.png',
    type: file.type || 'application/octet-stream',
    bytes: new Uint8Array(buffer),
  };
}

const BTN_SIZE = 56;
const BTN_MARGIN = 24;
const PANEL_MIN_W = 300;
const PANEL_MIN_H = 380;
const DEFAULT_PANEL_W = 400;
const DEFAULT_PANEL_H = 640;
const EDGE = 8;
const GAP = 8;

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const RESIZE_HANDLES: { dir: ResizeDir; className: string }[] = [
  { dir: 'n', className: 'top-0 inset-x-4 h-1.5 cursor-ns-resize' },
  { dir: 's', className: 'bottom-0 inset-x-4 h-1.5 cursor-ns-resize' },
  { dir: 'w', className: 'left-0 inset-y-4 w-1.5 cursor-ew-resize' },
  { dir: 'e', className: 'right-0 inset-y-4 w-1.5 cursor-ew-resize' },
  { dir: 'nw', className: 'top-0 left-0 w-3.5 h-3.5 cursor-nwse-resize' },
  { dir: 'ne', className: 'top-0 right-0 w-3.5 h-3.5 cursor-nesw-resize' },
  { dir: 'sw', className: 'bottom-0 left-0 w-3.5 h-3.5 cursor-nesw-resize' },
  { dir: 'se', className: 'bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize' },
];

function getPageContext(pathname: string): { page: string; candidateId?: string } {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return { page: 'Dashboard' };
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'candidates') {
    if (parts.length >= 2 && parts[1]) return { page: 'Candidate Profile', candidateId: parts[1] };
    return { page: 'Candidates' };
  }
  if (parts[0] === 'jobs') return parts.length >= 2 ? { page: 'Job Detail' } : { page: 'Job Postings' };
  if (parts[0] === 'screening') return { page: 'AI Screening' };
  if (parts[0] === 'interviews') return { page: 'Interviews' };
  if (parts[0] === 'recommendations') return { page: 'Final Recommendations' };
  if (parts[0] === 'email-applications') return { page: 'Email Applications' };
  if (parts[0] === 'settings') return { page: 'Settings' };
  return { page: parts[0] || 'Dashboard' };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isAllCapsTitle(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 90) return false;
  const letters = trimmed.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase();
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const blocks = message.content.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const hasAttachment = Boolean(message.attachmentName);
  const attachmentIsImage = isImageType(message.attachmentType, message.attachmentName);
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
          isUser
            ? 'bg-gradient-to-br from-navy to-navy-light text-white rounded-br-md'
            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
        }`}
      >
        {hasAttachment && (
          <div
            className={`mb-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium max-w-full ${
              isUser ? 'bg-white/15 text-white/90' : 'bg-gray-100 text-gray-700'
            }`}
          >
            <FileIcon width={13} height={13} className="shrink-0" />
            <span className="truncate max-w-[220px]">{message.attachmentName}</span>
            {attachmentIsImage && (
              <span className={isUser ? 'text-white/60' : 'text-gray-400'}>(image)</span>
            )}
          </div>
        )}
        {blocks.map((block, bi) => {
          const lines = block
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
          return (
            <div key={bi} className={bi > 0 ? 'mt-2' : ''}>
              {lines.map((line, li) => {
                const isBullet = line.startsWith('- ') || line.startsWith('• ');
                if (isAllCapsTitle(line)) {
                  return (
                    <p
                      key={li}
                      className={`whitespace-pre-wrap font-bold ${isUser ? 'text-white' : 'text-gray-900'}`}
                    >
                      {line}
                    </p>
                  );
                }
                const isSubTitle =
                  li === 0 && !isBullet && line.length <= 60 && !/[.!?,:]$/.test(line);
                return (
                  <p
                    key={li}
                    className={`whitespace-pre-wrap ${
                      isSubTitle ? `font-semibold ${isUser ? 'text-white' : 'text-gray-900'}` : ''
                    }`}
                  >
                    {line}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AiAssistant() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Widget position = the bottom-right corner of the floating button. The panel
  // sits just above it, so dragging the button or the panel header moves both.
  const [pos, setPos] = useState({ right: BTN_MARGIN, bottom: BTN_MARGIN });
  const [size, setSize] = useState({ w: DEFAULT_PANEL_W, h: DEFAULT_PANEL_H });

  const moveDrag = useRef<{ id: number; sx: number; sy: number; or: number; ob: number; moved: boolean } | null>(null);
  const resizeDrag = useRef<{ id: number; sx: number; sy: number; w: number; h: number; or: number; ob: number; dir: ResizeDir } | null>(null);
  const suppressClick = useRef(false);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const { page, candidateId } = getPageContext(pathname);

  // Keep everything on-screen when the window is resized.
  useEffect(() => {
    const onWinResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = clamp(size.w, PANEL_MIN_W, vw - 16);
      const h = clamp(size.h, PANEL_MIN_H, vh - 16);
      setPos((p) => ({
        right: clamp(p.right, EDGE, Math.max(EDGE, vw - EDGE - w)),
        bottom: clamp(p.bottom, EDGE, Math.max(EDGE, vh - h - BTN_SIZE - GAP - EDGE)),
      }));
      setSize({ w, h });
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On opening the widget: load past conversations, and if we don't already
  // have an active thread (e.g. right after a page refresh) restore the most
  // recent conversation so the chat isn't lost.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const convs = await fetchConversations();
        if (cancelled) return;
        setConversations(convs);
        if (convs.length > 0 && !activeConversationId) {
          const latest = convs[0];
          setActiveConversationId(latest.id);
          const history = await fetchConversationMessages(latest.id);
          if (!cancelled) setMessages(history);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load conversation history'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open, loadingConversationId]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  // ── Attachments (file picker / drag-and-drop / clipboard paste) ──
  const clearAttachment = () => {
    setAttachment(null);
    setAttachmentPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  };

  const attachFile = async (file: File) => {
    setError('');
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('File is too large (max 20 MB).');
      return;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const allowedExt = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
    if (!allowedExt.includes(ext) && !file.type.startsWith('image/')) {
      setError('Unsupported file type. Allowed: PDF, DOC, DOCX, PNG, JPG, JPEG.');
      return;
    }
    try {
      const next = await fileToAttachment(file);
      setAttachment(next);
      setAttachmentPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      });
    } catch {
      setError('Could not read that file. Please try again.');
    }
  };

  const onPasteInput = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void attachFile(file);
        }
        return;
      }
    }
  };

  const onDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void attachFile(file);
  };

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    dragCounter.current += 1;
    setDragOver(true);
  };

  const onDragOverInput = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragOver(false);
  };

  const openConversation = async (id: string) => {
    setHistoryOpen(false);
    setError('');
    clearAttachment();
    setLoadingConversationId(id);
    try {
      const history = await fetchConversationMessages(id);
      setMessages(history);
      setActiveConversationId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setLoadingConversationId(null);
    }
  };

  const newConversation = async () => {
    setError('');
    clearAttachment();
    try {
      const conv = await createConversation();
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setMessages([]);
      setHistoryOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start a new conversation');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this conversation and all of its messages?')) return;
    setError('');
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
    }
  };

  const send = async () => {
    const text = input.trim();
    const file = attachment;
    if ((!text && !file) || loading) return;
    const history = messages;
    const outgoingAttachment = file;
    setInput('');
    setError('');
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: text,
        ...(outgoingAttachment
          ? { attachmentName: outgoingAttachment.name, attachmentType: outgoingAttachment.type }
          : {}),
      },
    ]);
    clearAttachment();
    setLoading(true);
    resizeTextarea();
    let convId = activeConversationId;
    try {
      if (!convId) {
        const conv = await createConversation();
        convId = conv.id;
        setActiveConversationId(convId);
        setConversations((prev) => [conv, ...prev]);
      }
      const { reply, conversationId } = await sendAssistantMessage({
        message: text,
        conversationHistory: history,
        context: { page, candidateId },
        conversationId: convId ?? undefined,
        file: outgoingAttachment,
      });
      const savedId = conversationId || convId;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply, createdAt: new Date().toISOString() },
      ]);
      const titleSource = text || (outgoingAttachment ? `[Attachment: ${outgoingAttachment.name}]` : '');
      const title = titleSource.length > 40 ? `${titleSource.slice(0, 40)}\u2026` : titleSource;
      setConversations((prev) => {
        const rest = prev.filter((c) => c.id !== savedId);
        const current = prev.find((c) => c.id === savedId);
        if (!current) return prev;
        return [
          { ...current, title: current.title || title, updated_at: new Date().toISOString() },
          ...rest,
        ];
      });
    } catch (err) {
      if (err instanceof Error && /Conversation not found/i.test(err.message)) {
        setActiveConversationId(null);
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Moving the whole widget (button or panel header) ──
  const startMove = (e: React.PointerEvent<HTMLElement>) => {
    moveDrag.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      or: pos.right,
      ob: pos.bottom,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMoveMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = moveDrag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
    if (!d.moved) return;
    setPos({
      right: clamp(d.or - dx, EDGE, Math.max(EDGE, window.innerWidth - EDGE - size.w)),
      bottom: clamp(d.ob - dy, EDGE, Math.max(EDGE, window.innerHeight - size.h - BTN_SIZE - GAP - EDGE)),
    });
  };

  const onMoveUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = moveDrag.current;
    if (d && d.id === e.pointerId) {
      if (d.moved) suppressClick.current = true;
      moveDrag.current = null;
    }
  };

  const handleBtnClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setOpen((v) => !v);
  };

  // ── Resizing the panel (all edges + corners) ──
  const onResizeDown = (dir: ResizeDir, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizeDrag.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      w: size.w,
      h: size.h,
      or: pos.right,
      ob: pos.bottom,
      dir,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = resizeDrag.current;
    if (!d || d.id !== e.pointerId) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;

    let w = d.w;
    let h = d.h;
    let right = d.or;
    let bottom = d.ob;

    if (d.dir.includes('e')) {
      w = clamp(d.w + dx, PANEL_MIN_W, vw - EDGE - d.or);
      right = clamp(d.or - (w - d.w), EDGE, Math.max(EDGE, vw - EDGE - w));
    }
    if (d.dir.includes('w')) {
      w = clamp(d.w - dx, PANEL_MIN_W, vw - EDGE - d.or);
    }
    if (d.dir.includes('s')) {
      h = clamp(d.h + dy, PANEL_MIN_H, vh - EDGE - d.ob - BTN_SIZE - GAP);
      bottom = clamp(d.ob - (h - d.h), EDGE, Math.max(EDGE, vh - h - BTN_SIZE - GAP - EDGE));
    }
    if (d.dir.includes('n')) {
      h = clamp(d.h - dy, PANEL_MIN_H, vh - EDGE - d.ob - BTN_SIZE - GAP);
    }

    setSize({ w, h });
    setPos({ right, bottom });
  };

  const onResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (resizeDrag.current && resizeDrag.current.id === e.pointerId) resizeDrag.current = null;
  };

  return (
    <>
      {open && (
        <div
          className="fixed z-50 flex flex-col rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden"
          style={{ width: size.w, height: size.h, right: pos.right, bottom: pos.bottom + BTN_SIZE + GAP }}
        >
          {/* Header — drag to move */}
          <div
            className="px-4 py-3 bg-gradient-to-r from-navy to-navy-light text-white flex items-center justify-between shrink-0 cursor-move"
            onPointerDown={startMove}
            onPointerMove={onMoveMove}
            onPointerUp={onMoveUp}
            style={{ touchAction: 'none' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                <AssistantIcon width={18} height={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">AI Assistant</p>
                <p className="text-[11px] text-white/70 leading-tight truncate">
                  {activeConversationId && conversations.find((c) => c.id === activeConversationId)
                    ? (conversations.find((c) => c.id === activeConversationId)?.title || 'New conversation')
                    : 'Claude-powered'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setHistoryOpen((v) => !v)}
                aria-label="Chat history"
                title="Chat history"
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  historyOpen ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <HistoryIcon width={16} height={16} />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="p-1.5 rounded-lg hover:bg-white/10 transition text-white/80 cursor-pointer"
              >
                <XIcon />
              </button>
            </div>
          </div>

          {historyOpen ? (
            /* ── Conversation history view ── */
            <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
              <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-100 bg-white shrink-0">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Back to chat"
                  className="flex items-center gap-1 text-[13px] font-medium text-gray-600 hover:text-navy transition cursor-pointer"
                >
                  <BackIcon width={15} height={15} />
                  Conversations
                </button>
                <button
                  type="button"
                  onClick={newConversation}
                  className="flex items-center gap-1 text-[12px] font-medium text-teal-600 hover:text-teal-700 transition cursor-pointer"
                >
                  <PlusIcon width={12} height={12} />
                  New
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {conversations.length === 0 && !error && (
                  <p className="text-xs text-gray-400 text-center mt-8 px-4">
                    No conversations yet. Ask something to start a chat.
                  </p>
                )}
                {conversations.map((c) => {
                  const isCurrent = c.id === activeConversationId;
                  const isLoading = c.id === loadingConversationId;
                  return (
                    <div
                      key={c.id}
                      className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 border transition ${
                        isCurrent
                          ? 'bg-teal-50 border-teal-300'
                          : 'bg-white border-gray-200 hover:border-teal-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openConversation(c.id)}
                        disabled={isLoading}
                        className="flex-1 text-left min-w-0 cursor-pointer disabled:cursor-wait"
                      >
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {c.title || 'New conversation'}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {isLoading ? 'Loading...' : formatRelativeTime(c.updated_at)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        aria-label="Delete conversation"
                        title="Delete conversation"
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition cursor-pointer"
                      >
                        <TrashIcon width={14} height={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── Chat view ── */
            <>
              {/* Messages */}
              <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {messages.length === 0 && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm bg-white border border-gray-200 text-gray-800 rounded-bl-md select-text">
                      {WELCOME_TEXT}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <MessageBubble key={i} message={m} />
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-white border border-gray-200 text-gray-700 text-sm flex items-center gap-2">
                      <span className="text-xs">Claude is thinking</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce [animation-delay:120ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-bounce [animation-delay:240ms]" />
                      </span>
                    </div>
                  </div>
                )}
                {error && <p className="text-xs text-red-600 px-1 select-text">{error}</p>}
              </div>

              {/* Input */}
              <div
                className={`relative p-3 border-t bg-white shrink-0 transition-colors ${
                  dragOver ? 'border-teal-400' : 'border-gray-100'
                }`}
                onDragEnter={onDragEnter}
                onDragOver={onDragOverInput}
                onDragLeave={onDragLeave}
                onDrop={onDropFiles}
              >
                {dragOver && (
                  <div className="absolute inset-0 z-10 bg-teal-50/95 border-2 border-dashed border-teal-400 rounded-xl flex items-center justify-center pointer-events-none">
                    <p className="text-sm font-medium text-teal-700">Drop file here</p>
                  </div>
                )}

                {attachment && (
                  <div className="flex items-center gap-2 mb-2 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2">
                    {attachmentPreview && attachment.type.startsWith('image/') ? (
                      <img
                        src={attachmentPreview}
                        alt={attachment.name}
                        className="w-9 h-9 rounded object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-400">
                        <FileIcon width={16} height={16} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{attachment.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {attachment.type.startsWith('image/')
                          ? 'Image'
                          : (attachment.name.split('.').pop() || '').toUpperCase()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearAttachment}
                      aria-label="Remove attachment"
                      className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition cursor-pointer"
                    >
                      <XIcon width={14} height={14} />
                    </button>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_ATTACHMENTS}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void attachFile(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    aria-label="Attach a file"
                    title="Attach a file (or drag & drop, or paste an image)"
                    className="h-10 w-10 rounded-xl border border-gray-200 text-gray-500 hover:text-teal-600 hover:border-teal-300 flex items-center justify-center transition cursor-pointer disabled:opacity-40 shrink-0"
                  >
                    <AttachIcon width={16} height={16} />
                  </button>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      resizeTextarea();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    onPaste={onPasteInput}
                    placeholder="Write a message..."
                    className="resize-none flex-1 min-h-[40px] max-h-[160px] px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition"
                  />
                  <button
                    type="button"
                    onClick={send}
                    disabled={loading || (!input.trim() && !attachment)}
                    className="h-10 px-4 rounded-xl bg-teal-500 text-white text-sm font-medium transition hover:opacity-90 disabled:opacity-40 shrink-0"
                  >
                    Send
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <button
                    type="button"
                    onClick={newConversation}
                    className="text-[11px] font-medium text-teal-600 hover:text-teal-700 transition cursor-pointer"
                  >
                    New conversation
                  </button>
                  <span className="text-[11px] text-gray-400">
                    {messages.length} message{messages.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Resize handles — all edges and corners */}
          {RESIZE_HANDLES.map((h) => (
            <div
              key={h.dir}
              onPointerDown={(e) => onResizeDown(h.dir, e)}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              title="Drag to resize"
              className={`absolute z-20 hover:bg-teal-400/20 ${h.className}`}
              style={{ touchAction: 'none' }}
            />
          ))}
          {/* Decorative grip (non-interactive, the handle above covers it) */}
          <div
            className="absolute bottom-0 right-0 z-10 w-4 h-4 flex items-end justify-end pr-1 pb-1 text-gray-400 pointer-events-none"
            aria-hidden="true"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="14 10 10 14" />
              <polyline points="18 14 14 18" />
              <polyline points="22 18 18 22" />
            </svg>
          </div>
        </div>
      )}

      {/* Floating button — drag to move the whole widget */}
      <button
        type="button"
        onClick={handleBtnClick}
        onPointerDown={startMove}
        onPointerMove={onMoveMove}
        onPointerUp={onMoveUp}
        aria-label="AI Assistant"
        title={open ? 'Drag to move · click to close' : 'Drag to move · click to open'}
        className={`fixed z-50 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-colors select-none cursor-grab active:cursor-grabbing ${
          open ? 'bg-gray-800' : 'bg-gradient-to-br from-navy to-teal-600 hover:scale-105'
        }`}
        style={{ right: pos.right, bottom: pos.bottom, touchAction: 'none' }}
      >
        {open ? <XIcon width={20} height={20} /> : <AssistantIcon width={22} height={22} />}
      </button>
    </>
  );
}