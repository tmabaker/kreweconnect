import { useEffect, useState } from "react";
import { Card, Link, Spinner, Text, Title2, tokens } from "@fluentui/react-components";
import { LockClosed24Regular } from "@fluentui/react-icons";
import { fetchAccessContact, type AccessContact } from "../../services/accessService";

/** The one-line "how to get in" sentence. With a contact for the caller's
 * company it names them; otherwise it falls back to the generic wording. */
export function AccessRequestText({ fallback }: { fallback?: string }) {
  const [contact, setContact] = useState<AccessContact | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetchAccessContact().then((c) => live && setContact(c));
    return () => {
      live = false;
    };
  }, []);

  if (contact === undefined) return <Spinner size="tiny" />;
  if (!contact) {
    return <>{fallback ?? "To request access, contact your IT admin or NOIT Group."}</>;
  }
  return (
    <>
      To request access, email {contact.name} at{" "}
      <Link href={`mailto:${contact.email}`}>{contact.email}</Link>.
    </>
  );
}

/** Full-page notice for an area the caller cannot open. */
export function NoAccessNotice({ area, fallback }: { area: string; fallback?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "640px" }}>
      <Title2>{area}</Title2>
      <Card>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <LockClosed24Regular style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }} />
          <div>
            <Text weight="semibold" size={500} style={{ display: "block" }}>
              You don't have access to {area} yet
            </Text>
            <Text size={300}>
              <AccessRequestText fallback={fallback} />
            </Text>
          </div>
        </div>
      </Card>
    </div>
  );
}
