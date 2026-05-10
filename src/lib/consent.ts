import type { User, UserMetadata } from "@supabase/supabase-js";

export const MESSAGE_READING_CONSENT_KEY = "message_reading_consent";

type MessageReadingConsent = {
  granted: boolean;
  updatedAt: string;
};

function toRecord(metadata: UserMetadata | null | undefined) {
  if (!metadata || typeof metadata !== "object") {
    return {} as Record<string, unknown>;
  }

  return metadata as Record<string, unknown>;
}

export function getMessageReadingConsent(user: User | null | undefined) {
  if (!user) {
    return null;
  }

  const metadata = toRecord(user.user_metadata);
  const raw = metadata[MESSAGE_READING_CONSENT_KEY];

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const parsed = raw as Partial<MessageReadingConsent>;
  if (typeof parsed.granted !== "boolean") {
    return null;
  }

  return {
    granted: parsed.granted,
    updatedAt:
      typeof parsed.updatedAt === "string"
        ? parsed.updatedAt
        : new Date(0).toISOString(),
  };
}

export function hasMessageReadingConsent(user: User | null | undefined) {
  const consent = getMessageReadingConsent(user);
  return consent?.granted === true;
}

export function buildUpdatedUserMetadata(
  existing: UserMetadata | null | undefined,
  granted: boolean,
) {
  const metadata = toRecord(existing);

  return {
    ...metadata,
    [MESSAGE_READING_CONSENT_KEY]: {
      granted,
      updatedAt: new Date().toISOString(),
    } satisfies MessageReadingConsent,
  };
}
