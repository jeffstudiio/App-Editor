// In-memory handoff between studio views (same SPA session, blob URLs stay alive).
// Used by: Home prompt bar → Assistant, Templates gallery → Video editor,
// Video/Design studio → Video editor (generated projects), Design → Story/Retouch.

import type { MediaAsset, Project } from "./types";
import type { BankTemplate } from "@/lib/template-bank/schema";

export interface PendingProjectPayload {
  project: Project;
  assets: MediaAsset[]; // with live object URLs
  name: string;
}

export interface PendingTemplatePayload {
  templateId: string;
}

/** رسانهٔ جای‌گذاری‌شدهٔ کاربر برای اسلات‌های بانک تمپلیت */
export interface PendingBankMedia {
  url: string;
  name: string;
}

export interface PendingBankPayload {
  template: BankTemplate;
  media: Record<string, PendingBankMedia | undefined>;
  texts: Record<string, string>;
}

let pendingProject: PendingProjectPayload | null = null;
let pendingTemplate: PendingTemplatePayload | null = null;
let pendingBank: PendingBankPayload | null = null;
let assistantPrefill: string | null = null;

export function setPendingProject(p: PendingProjectPayload) {
  pendingProject = p;
}

export function consumePendingProject(): PendingProjectPayload | null {
  const v = pendingProject;
  pendingProject = null;
  return v;
}

export function peekPendingProject(): PendingProjectPayload | null {
  return pendingProject;
}

export function setPendingTemplate(t: PendingTemplatePayload) {
  pendingTemplate = t;
}

export function consumePendingTemplate(): PendingTemplatePayload | null {
  const v = pendingTemplate;
  pendingTemplate = null;
  return v;
}

export function setPendingBank(p: PendingBankPayload) {
  pendingBank = p;
}

export function consumePendingBank(): PendingBankPayload | null {
  const v = pendingBank;
  pendingBank = null;
  return v;
}

export function setAssistantPrefill(text: string) {
  assistantPrefill = text;
}

export function consumeAssistantPrefill(): string | null {
  const v = assistantPrefill;
  assistantPrefill = null;
  return v;
}
