import { afterEach, describe, expect, it, vi } from "vitest";

process.env["NODE_ENV"] = "test";
process.env["PORT"] = "5050";
process.env["JWT_SECRET"] = "test-jwt-secret-16chars";
process.env["JWT_EXPIRES_IN"] = "1h";
process.env["FRONTEND_URL"] = "http://localhost:3000";
process.env["MONGODB_URI"] = "mongodb://127.0.0.1:27017/expense-manager-test";
process.env["CLOUDINARY_CLOUD_NAME"] = "test-cloud";
process.env["CLOUDINARY_API_KEY"] = "test-key";
process.env["CLOUDINARY_API_SECRET"] = "test-secret";
process.env["EMAIL_PROVIDER"] = "console";
process.env["EMAIL_FROM"] = "Flux Team <noreply@localhost>";

const { emailService } = await import("../src/services/email/email.service.js");
const { sendGroupInviteEmail } = await import(
  "../src/services/email/invite-email.service.js"
);
const { normalizeMailMessage } = await import(
  "../src/services/email/normalize-mail-message.js"
);
const { buildGroupInviteTemplate } = await import(
  "../src/services/email/templates/group-invite.js"
);
import type { EmailProvider, MailMessage } from "../src/services/email/types.js";

function createRecordingProvider(): EmailProvider & {
  messages: MailMessage[];
} {
  const messages: MailMessage[] = [];
  return {
    name: "console",
    messages,
    async send(message: MailMessage) {
      messages.push(message);
    },
  };
}

describe("emailService (Batch E0)", () => {
  afterEach(() => {
    emailService.setProvider(null);
    emailService.resetDefaultProvider();
  });

  it("normalizes recipients and forwards to the injected provider", async () => {
    const provider = createRecordingProvider();
    emailService.setProvider(provider);

    await emailService.send({
      to: "  Alice@Example.com ",
      subject: "  Hello  ",
      text: "  Body text  ",
      html: "  <p>Body</p>  ",
    });

    expect(provider.messages).toHaveLength(1);
    expect(provider.messages[0]).toEqual({
      to: ["alice@example.com"],
      subject: "Hello",
      text: "Body text",
      html: "<p>Body</p>",
    });
  });

  it("dedupes recipients and rejects invalid email", () => {
    const normalized = normalizeMailMessage({
      to: ["a@example.com", "A@example.com", "b@example.com"],
      subject: "Hi",
      text: "Hello",
    });
    expect(normalized.to).toEqual(["a@example.com", "b@example.com"]);

    expect(() =>
      normalizeMailMessage({
        to: "not-an-email",
        subject: "Hi",
        text: "Hello",
      }),
    ).toThrow(/Invalid to\[0]/);
  });

  it("requires subject and text", () => {
    expect(() =>
      normalizeMailMessage({
        to: "a@example.com",
        subject: "   ",
        text: "Hello",
      }),
    ).toThrow(/subject/);

    expect(() =>
      normalizeMailMessage({
        to: "a@example.com",
        subject: "Hi",
        text: "",
      }),
    ).toThrow(/text/);
  });

  it("rethrows provider failures after logging", async () => {
    const error = new Error("transport down");
    emailService.setProvider({
      name: "console",
      async send() {
        throw error;
      },
    });

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      emailService.send({
        to: "a@example.com",
        subject: "Hi",
        text: "Hello",
      }),
    ).rejects.toThrow("transport down");

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("sendGroupInviteEmail soft-fails and still uses the mailer", async () => {
    const provider = createRecordingProvider();
    emailService.setProvider(provider);

    await sendGroupInviteEmail({
      to: "bob@example.com",
      groupName: "Family",
      invitedByName: "Alice",
      invitedByEmail: "alice@example.com",
      relation: "friend",
      inviteUrl: "http://localhost:3000/app/invites/abc",
    });

    expect(provider.messages).toHaveLength(1);
    expect(provider.messages[0]?.to).toEqual(["bob@example.com"]);
    expect(provider.messages[0]?.subject).toContain("Alice");
    expect(provider.messages[0]?.text).toContain(
      "http://localhost:3000/app/invites/abc",
    );
    expect(provider.messages[0]?.headers?.["X-Entity-Ref"]).toBe(
      "group-invite",
    );

    emailService.setProvider({
      name: "console",
      async send() {
        throw new Error("smtp down");
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      sendGroupInviteEmail({
        to: "bob@example.com",
        groupName: "Family",
        invitedByName: "Alice",
        invitedByEmail: "alice@example.com",
        relation: "friend",
        inviteUrl: "http://localhost:3000/app/invites/abc",
      }),
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("group invite template (Batch E0)", () => {
  it("builds subject/text/html and escapes HTML in names", () => {
    const content = buildGroupInviteTemplate({
      groupName: `Family <script>`,
      invitedByName: `Alice & Bob`,
      invitedByEmail: "alice@example.com",
      relationLabel: "Friend",
      inviteUrl: "http://localhost:3000/app/invites/token123",
    });

    expect(content.subject).toContain("Alice & Bob");
    expect(content.subject).toContain("Flux");
    expect(content.text).toContain(
      "http://localhost:3000/app/invites/token123",
    );
    expect(content.text).toContain("Family <script>");
    expect(content.text).toContain("as Friend");
    expect(content.html).toContain("Alice &amp; Bob");
    expect(content.html).toContain("Family &lt;script&gt;");
    expect(content.html).not.toContain("<script>");
  });
});
