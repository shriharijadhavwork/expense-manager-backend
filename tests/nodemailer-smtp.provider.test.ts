import { describe, expect, it, vi } from "vitest";
import { NodemailerSmtpEmailProvider } from "../src/services/email/providers/nodemailer-smtp.provider.js";
import type { Transporter } from "nodemailer";

describe("NodemailerSmtpEmailProvider (Batch E1)", () => {
  it("maps MailMessage onto transporter.sendMail", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "test-id-1" });
    const transporter = { sendMail } as unknown as Transporter;

    const provider = new NodemailerSmtpEmailProvider({
      transporter,
      from: "Flux Team <noreply@example.com>",
    });

    await provider.send({
      to: ["bob@example.com", { address: "carol@example.com", name: "Carol" }],
      subject: "You're invited",
      text: "Open the link",
      html: "<p>Open the link</p>",
      replyTo: "support@example.com",
      headers: { "X-Entity-Ref": "group-invite" },
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({
      from: "Flux Team <noreply@example.com>",
      to: ["bob@example.com", "Carol <carol@example.com>"],
      subject: "You're invited",
      text: "Open the link",
      html: "<p>Open the link</p>",
      replyTo: "support@example.com",
      headers: { "X-Entity-Ref": "group-invite" },
    });
  });

  it("propagates transporter failures", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("SMTP rejected"));
    const transporter = { sendMail } as unknown as Transporter;

    const provider = new NodemailerSmtpEmailProvider({
      transporter,
      from: "noreply@example.com",
    });

    await expect(
      provider.send({
        to: "bob@example.com",
        subject: "Hi",
        text: "Hello",
      }),
    ).rejects.toThrow("SMTP rejected");
  });
});
