import Imap from "node-imap";
import { simpleParser } from "mailparser";
import type { ParsedMail } from "mailparser";
import { v4 as uuidv4 } from "uuid";
import type {
  EmailAccount,
  EmailDocument,
  IMAPConnectionStatus,
} from "../../types/index.js";
import config from "../../config/index.js";
import ElasticsearchService from "../elasticsearch/ElasticsearchService.js";
import AIService from "../ai/AIService.js";
import WebhookService from "../webhook/WebhookService.js";
import { htmlToText } from "html-to-text";

export class IMAPService {
  private connections: Map<string, Imap> = new Map();
  private connectionStatus: Map<string, IMAPConnectionStatus> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();

  async initializeAccounts(): Promise<void> {
    for (const account of config.emailAccounts) {
      if (account.email && account.password) {
        await this.connectAccount(account);
      } else {
        console.warn(`⚠️  Skipping account ${account.id}: Missing credentials`);
      }
    }
  }

  private async connectAccount(account: EmailAccount): Promise<void> {
    try {
      const imap = new Imap({
        user: account.email,
        password: account.password,
        host: account.imapHost,
        port: account.imapPort,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        keepalive: {
          interval: 10000,
          idleInterval: 300000, // 5 minutes
          forceNoop: true,
        },
      });

      this.setupIMAPHandlers(imap, account);

      imap.connect();

      this.connections.set(account.id, imap);
      this.connectionStatus.set(account.id, {
        accountId: account.id,
        connected: false,
        lastSync: new Date(),
      });

      console.log(`🔌 Connecting to IMAP for ${account.email}...`);
    } catch (error) {
      console.error(`❌ Error connecting account ${account.id}:`, error);
      this.scheduleReconnect(account);
    }
  }

  private setupIMAPHandlers(imap: Imap, account: EmailAccount): void {
    imap.once("ready", async () => {
      console.log(`✅ Connected to ${account.email}`);
      this.connectionStatus.set(account.id, {
        accountId: account.id,
        connected: true,
        lastSync: new Date(),
      });
      this.reconnectAttempts.set(account.id, 0);

      try {
        // Phase 1: Initial sync
        await this.performInitialSync(imap, account);
        // Phase 2: Transition to IDLE mode
        this.startIdleMode(imap, account);
      } catch (error) {
        console.error(`❌ Error in ready handler for ${account.email}:`, error);
      }
    });

    imap.once("error", (err: Error) => {
      console.error(`❌ IMAP Error for ${account.email}:`, err);
      this.connectionStatus.set(account.id, {
        accountId: account.id,
        connected: false,
        lastSync: new Date(),
        error: err.message,
      });
      this.scheduleReconnect(account);
    });

    imap.once("end", () => {
      console.log(`🔌 Connection ended for ${account.email}`);
      this.connectionStatus.set(account.id, {
        accountId: account.id,
        connected: false,
        lastSync: new Date(),
      });
      this.scheduleReconnect(account);
    });

    // Listen for new mail events
    imap.on("mail", async (numNewMsgs: number) => {
      console.log(
        `📬 ${numNewMsgs} new email(s) received for ${account.email}`
      );
      try {
        // Fetch only the latest email's metadata (ENVELOPE/BODYSTRUCTURE)
        imap.search(["UNSEEN"], async (err, results) => {
          if (err) {
            console.error(`❌ Error searching for new emails:`, err);
            return;
          }
          if (!results || results.length === 0) return;
          // Only fetch the latest unseen email
          const latestSeqNo = results[results.length - 1];
          if (typeof latestSeqNo === "number") {
            await this.fetchEmailsBySeqNo(
              imap,
              account,
              [latestSeqNo],
              "INBOX"
            );
          }
          // Pass to Phase 2 (already handled in fetchEmailsBySeqNo)
        });
      } catch (error) {
        console.error(`❌ Error fetching new emails:`, error);
      }
    });

    // Listen for expunge (deletion) events
    imap.on("expunge", (seqno: number) => {
      console.log(
        `🗑️ Email deleted (expunged) for ${account.email}, seqno: ${seqno}`
      );
      // You can add logic here to update your index or notify downstream systems
    });
  }

  private async performInitialSync(
    imap: Imap,
    account: EmailAccount
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      imap.openBox("INBOX", false, async (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        console.log(
          `📥 Starting initial sync for ${account.email} (fetching last 10 emails)`
        );

        // Fetch only the last 10 emails for now to avoid rate limits
        imap.search(["ALL"], async (err, results) => {
          if (err) {
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            console.log(
              `✅ No emails found for initial sync (${account.email})`
            );
            resolve();
            return;
          }

          try {
            const limitedResults = results.slice(-10);
            console.log(
              `📧 Found ${results.length} emails, syncing last ${limitedResults.length} for ${account.email}`
            );
            await this.fetchEmailsBySeqNo(
              imap,
              account,
              limitedResults,
              "INBOX"
            );
            console.log(`✅ Initial sync completed for ${account.email}`);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  }

  private startIdleMode(imap: Imap, account: EmailAccount): void {
    console.log(`👂 Starting IDLE mode for ${account.email}`);

    imap.on("update", (seqno: number, info: any) => {
      console.log(`🔄 Email update detected for ${account.email}`);
    });

    // Function to start and maintain IDLE
    const startIdle = () => {
      if (imap.state === "authenticated") {
        try {
          // The IDLE extension is already enabled by keepalive in connection config
          // We just need to make sure we're listening for 'mail' events
          console.log(`💤 IDLE mode active for ${account.email}`);
        } catch (err) {
          console.error(`❌ Error starting IDLE for ${account.email}:`, err);
        }
      }
    };

    // Start IDLE immediately
    startIdle();

    // Watchdog: Send NOOP every 29 minutes to keep connection alive
    setInterval(() => {
      if (imap.state === "authenticated") {
        console.log(
          `🔄 Watchdog: Sending NOOP to keep connection alive for ${account.email}`
        );
        try {
          // Send NOOP to prevent timeout
          (imap as any).send("NOOP", (err: Error) => {
            if (err) {
              console.error(`❌ NOOP error for ${account.email}:`, err);
            } else {
              console.log(`✅ NOOP sent successfully for ${account.email}`);
            }
          });
        } catch (err) {
          console.error(`❌ Error sending NOOP for ${account.email}:`, err);
        }
      }
    }, 29 * 60 * 1000); // 29 minutes
  }

  private async fetchNewEmails(
    imap: Imap,
    account: EmailAccount
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      imap.search(["UNSEEN"], async (err, results) => {
        if (err) {
          reject(err);
          return;
        }

        if (!results || results.length === 0) {
          resolve();
          return;
        }

        console.log(
          `📨 Fetching ${results.length} new email(s) for ${account.email}`
        );

        try {
          await this.fetchEmailsBySeqNo(imap, account, results, "INBOX");
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private formatIMAPDate(d: Date): string {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const day = d.getDate().toString().padStart(2, "0");
    const mon = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${mon}-${year}`;
  }

  private async fetchEmailsBySeqNo(
    imap: Imap,
    account: EmailAccount,
    seqNos: number[],
    folder: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Only fetch ENVELOPE and BODYSTRUCTURE, not the full body
      const fetch = imap.fetch(seqNos, {
        bodies: "",
        struct: true,
        markSeen: false,
      });

      const emailPromises: Promise<void>[] = [];

      fetch.on("message", (msg, seqno) => {
        const emailPromise = new Promise<void>((resolveEmail, rejectEmail) => {
          let envelope: any = null;
          let bodystructure: any = null;
          let buffer = "";

          /*msg.on('attributes', (attrs) => {
            envelope = attrs.envelope;
            bodystructure = attrs.struct;*/
          msg.on("body", (stream) => {
            stream.on("data", (chunk) => {
              buffer += chunk.toString("utf8");
            });
          });

          msg.once("end", async () => {
            try {
              const parsed = await simpleParser(buffer);
              await this.processEmail(parsed, account, folder);
              resolveEmail();
            } catch (error) {
              console.error(`❌ Error processing email:`, error);
              rejectEmail(error);
            }
          });
        });

        emailPromises.push(emailPromise);
      });

      fetch.once("error", (err) => {
        console.error("❌ Fetch error:", err);
        reject(err);
      });

      fetch.once("end", async () => {
        try {
          await Promise.all(emailPromises);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private async processEmail(
    parsed: ParsedMail,
    account: EmailAccount,
    folder: string
  ): Promise<void> {
    try {
      // Deduplicate by Message-ID when available
      const rawMessageId = (parsed.messageId || "").trim();
      if (rawMessageId) {
        const exists = await ElasticsearchService.existsByMessageId(
          rawMessageId
        );
        if (exists) {
          console.log(
            `🟡 Duplicate skipped (messageId=${rawMessageId}) for ${account.email}`
          );
          return;
        }
      }

      const emailId = uuidv4();
      const html = typeof parsed.html === "string" ? parsed.html : "";
      const text = parsed.text || "";

      // Prioritize converting HTML to clean text. Fallback to parsed text.
      const bodyText = html
        ? htmlToText(html, {
            wordwrap: false,
            selectors: [
              { selector: "a", options: { ignoreHref: true } },
              { selector: "img", format: "skip" },
            ],
          })
        : text;
      // Helper function to extract email addresses
      const getAddresses = (field: any): string[] => {
        if (!field) return [];
        if (Array.isArray(field)) {
          return field.flatMap((item) =>
            Array.isArray(item.value)
              ? item.value.map((v: any) => v.address || "")
              : []
          );
        }
        return Array.isArray(field.value)
          ? field.value.map((v: any) => v.address || "")
          : [];
      };

      const fromText = parsed.from ? getAddresses(parsed.from)[0] || "" : "";
      const toText = getAddresses(parsed.to);
      const ccText = parsed.cc ? getAddresses(parsed.cc) : undefined;

      const emailDoc: EmailDocument = {
        id: emailId,
        accountId: account.id,
        folder,
        subject: parsed.subject || "(No Subject)",
        body: bodyText,
        ...(typeof parsed.html === "string" && { htmlBody: parsed.html }),
        from: fromText,
        to: toText,
        ...(ccText && ccText.length > 0 && { cc: ccText }),
        date: parsed.date || new Date(),
        aiCategory: "Uncategorized",
        indexedAt: new Date(),
        messageId: rawMessageId || emailId,
        ...(parsed.inReplyTo && { inReplyTo: parsed.inReplyTo }),
        ...(Array.isArray(parsed.references) && {
          references: parsed.references,
        }),
      };

      // Index email first
      await ElasticsearchService.indexEmail(emailDoc);

      // Categorize with AI
      const categorization = await AIService.categorizeEmail({
        subject: emailDoc.subject,
        body: emailDoc.body,
        from: emailDoc.from,
      });

      // Update category
      await ElasticsearchService.updateEmailCategory(
        emailId,
        categorization.category
      );
      emailDoc.aiCategory = categorization.category;

      // Trigger webhooks if Interested
      if (categorization.category === "Interested") {
        await WebhookService.triggerInterestedWebhooks(emailDoc);
      }

      console.log(
        `✅ Processed email: ${emailDoc.subject} [${categorization.category}]`
      );
    } catch (error) {
      console.error("❌ Error processing email:", error);
    }
  }

  private scheduleReconnect(account: EmailAccount): void {
    const attempts = this.reconnectAttempts.get(account.id) || 0;

    if (attempts >= config.imap.maxReconnectAttempts) {
      console.error(
        `❌ Max reconnection attempts reached for ${account.email}`
      );
      return;
    }

    const delay = Math.min(
      config.imap.reconnectDelay * Math.pow(2, attempts),
      60000
    );
    console.log(
      `🔄 Reconnecting ${account.email} in ${delay}ms (attempt ${attempts + 1})`
    );

    this.reconnectAttempts.set(account.id, attempts + 1);

    setTimeout(() => {
      this.connectAccount(account);
    }, delay);
  }

  getConnectionStatus(): IMAPConnectionStatus[] {
    return Array.from(this.connectionStatus.values());
  }

  async disconnect(): Promise<void> {
    for (const [accountId, imap] of this.connections.entries()) {
      console.log(`🔌 Disconnecting ${accountId}...`);
      imap.end();
    }
    this.connections.clear();
  }
}

export default new IMAPService();
