import { supabase } from "./supabase";

// Knowledge bases live on rofiant.ca (Supabase-backed, Pro/Ultra), not on
// this machine — the desktop app is just another authenticated client of
// the same API and storage bucket the web dashboard uses.
const API_BASE = "https://www.rofiant.ca/api";

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  knowledge_base_documents: { count: number }[];
};

export type KnowledgeBaseDocument = {
  id: string;
  document_id: string;
  added_at: string;
  documents: { id: string; name: string; type: string; size: number } | null;
};

export type KnowledgeBaseDetail = Omit<KnowledgeBase, "knowledge_base_documents"> & {
  knowledge_base_documents: KnowledgeBaseDocument[];
};

async function authedRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function listKnowledgeBases(accessToken: string): Promise<KnowledgeBase[]> {
  return authedRequest("/knowledge-bases", accessToken);
}

export function getKnowledgeBase(id: string, accessToken: string): Promise<KnowledgeBaseDetail> {
  return authedRequest(`/knowledge-bases/${id}`, accessToken);
}

export function createKnowledgeBase(
  name: string,
  description: string,
  accessToken: string,
): Promise<KnowledgeBase> {
  return authedRequest("/knowledge-bases", accessToken, {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export function deleteKnowledgeBase(id: string, accessToken: string): Promise<void> {
  return authedRequest(`/knowledge-bases/${id}`, accessToken, { method: "DELETE" });
}

export function removeDocumentFromKnowledgeBase(
  kbId: string,
  documentId: string,
  accessToken: string,
): Promise<void> {
  return authedRequest(`/knowledge-bases/${kbId}/documents`, accessToken, {
    method: "DELETE",
    body: JSON.stringify({ document_id: documentId }),
  });
}

/**
 * Uploads a local file into the user's document library, then links it into
 * the given knowledge base. The file bytes go straight to Supabase Storage
 * from this client (RLS already scopes the "documents" bucket to
 * `${auth.uid()}/...`), then the web API indexes it (text extraction,
 * classification, summarization) and links it into the knowledge base.
 */
export async function uploadDocumentToKnowledgeBase(
  kbId: string,
  file: File,
  userId: string,
  accessToken: string,
): Promise<void> {
  const storagePath = `${userId}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file);
  if (uploadError) throw uploadError;

  const doc = await authedRequest<{ id: string }>("/documents", accessToken, {
    method: "POST",
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size, storage_path: storagePath }),
  });

  await authedRequest(`/knowledge-bases/${kbId}/documents`, accessToken, {
    method: "POST",
    body: JSON.stringify({ document_id: doc.id }),
  });
}

export type KnowledgeBaseSearchResult = {
  id: string;
  name: string;
  type: string;
  category: string | null;
  summary: string | null;
  excerpts: string[];
};

export function searchKnowledgeBase(
  query: string,
  accessToken: string,
): Promise<{ results: KnowledgeBaseSearchResult[] }> {
  return authedRequest(`/documents/search?q=${encodeURIComponent(query)}`, accessToken);
}
