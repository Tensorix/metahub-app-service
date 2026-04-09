/**
 * Sandbox Admin API Client
 *
 * Endpoints backed by the OpenSandbox admin API for listing, inspecting,
 * and terminating sandboxes across all sessions.
 */

import { apiClient } from "./api";

export interface SandboxAdminStatus {
  state: string;
  reason?: string | null;
  message?: string | null;
  last_transition_at?: string | null;
}

export interface SandboxAdminInfo {
  id: string;
  status: SandboxAdminStatus;
  entrypoint: string[];
  image?: string | null;
  expires_at?: string | null;
  created_at: string;
  metadata?: Record<string, string> | null;
}

export interface SandboxAdminPagination {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next_page: boolean;
}

export interface SandboxAdminListResponse {
  sandboxes: SandboxAdminInfo[];
  pagination: SandboxAdminPagination;
}

export interface ListSandboxesParams {
  states?: string[];
  page?: number;
  pageSize?: number;
}

export async function listSandboxes(
  params: ListSandboxesParams = {}
): Promise<SandboxAdminListResponse> {
  const search = new URLSearchParams();
  if (params.states && params.states.length > 0) {
    for (const s of params.states) search.append("states", s);
  }
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.pageSize !== undefined)
    search.set("page_size", String(params.pageSize));

  const query = search.toString();
  const url = query
    ? `/api/v1/sandbox-admin/sandboxes?${query}`
    : `/api/v1/sandbox-admin/sandboxes`;
  const response = await apiClient.get(url);
  return response.data;
}

export async function getSandboxInfo(
  sandboxId: string
): Promise<SandboxAdminInfo> {
  const response = await apiClient.get(
    `/api/v1/sandbox-admin/sandboxes/${encodeURIComponent(sandboxId)}`
  );
  return response.data;
}

export async function killSandbox(sandboxId: string): Promise<void> {
  await apiClient.delete(
    `/api/v1/sandbox-admin/sandboxes/${encodeURIComponent(sandboxId)}`
  );
}
