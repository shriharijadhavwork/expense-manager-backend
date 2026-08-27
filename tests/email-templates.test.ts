import { describe, expect, it } from "vitest";
import { buildGroupInviteTemplate } from "../src/services/email/templates/group-invite.js";
import { buildTransactionalEmail } from "../src/services/email/templates/layout.js";

describe("email templates layout (Batch E5)", () => {
  it("always pairs text and html with a shared shell", () => {
    const content = buildTransactionalEmail({
      subject: "Test",
      greeting: "Hi there,",
      textParagraphs: ["Body line"],
      htmlBlocks: ["<p>Body line</p>"],
      footerNote: "Ignore if unexpected.",
    });

    expect(content.subject).toBe("Test");
    expect(content.text).toContain("Hi there,");
    expect(content.text).toContain("Body line");
    expect(content.text).toContain("Ignore if unexpected.");
    expect(content.html).toContain("Hi there,");
    expect(content.html).toContain("Body line");
    expect(content.html).toContain("Ignore if unexpected.");
    expect(content.html).toContain("font-family:system-ui");
    expect(content.html).toContain("Flux");
    expect(content.text).toContain("Go live. Spend.");
  });

  it("keeps invite template escaping under the shared layout", () => {
    const content = buildGroupInviteTemplate({
      groupName: `Family <script>`,
      invitedByName: `Alice & Bob`,
      invitedByEmail: "alice@example.com",
      relationLabel: "Friend",
      inviteUrl: "http://localhost:3000/invites/token123",
    });

    expect(content.html).toContain("Alice &amp; Bob");
    expect(content.html).toContain("Family &lt;script&gt;");
    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("Accept invite");
    expect(content.html).toContain("Friend");
    expect(content.text).toContain("http://localhost:3000/invites/token123");
    expect(content.text).toContain("as Friend");
  });
});
