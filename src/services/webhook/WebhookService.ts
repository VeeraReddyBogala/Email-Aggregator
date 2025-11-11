import axios from "axios";
import type { EmailDocument, WebhookPayload } from "../../types/index.js";
import config from "../../config/index.js";

export class WebhookService {
  async triggerInterestedWebhooks(email: EmailDocument): Promise<void> {
    console.log(
      `🔔 Triggering webhooks for Interested email: ${email.subject}`
    );

    const promises: Promise<void>[] = [];

    // Send Slack notification
    if (config.webhooks.slack) {
      promises.push(this.sendSlackNotification(email));
    }

    // Send generic webhook
    if (config.webhooks.generic) {
      promises.push(this.sendGenericWebhook(email));
    }

    try {
      await Promise.all(promises);
      console.log("✅ All webhooks triggered successfully");
    } catch (error) {
      console.error("❌ Error triggering webhooks:", error);
    }
  }

  private async sendSlackNotification(email: EmailDocument): Promise<void> {
    if (!config.webhooks.slack) {
      console.warn("⚠️  Slack webhook URL not configured");
      return;
    }

    const slackUrl = config.webhooks.slack;

    try {
      // Build a deep link to the email in the app if possible
      const baseUrl =
        process.env.APP_BASE_URL || `http://localhost:${config.port}`;
      const emailUrl = `${baseUrl}/#email-${email.id}`;

      const slackPayload = {
        text: "🎉 New Interested Lead!",
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🎯 New Interested Lead",
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*From:*\n${email.from}`,
              },
              {
                type: "mrkdwn",
                text: `*Subject:*\n${email.subject}`,
              },
            ],
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "View Email",
                },
                url: emailUrl,
                style: "primary",
              },
            ],
          },
          {
            type: "divider",
          },
        ],
      };

      await axios.post(slackUrl, slackPayload, {
        headers: { "Content-Type": "application/json" },
      });

      console.log("✅ Slack notification sent");
    } catch (error: any) {
      console.error("❌ Error sending Slack notification:", error.message);
      throw error;
    }
  }

  private async sendGenericWebhook(email: EmailDocument): Promise<void> {
    if (!config.webhooks.generic) {
      console.warn("⚠️  Generic webhook URL not configured");
      return;
    }

    const genericUrl = config.webhooks.generic;

    // Build a sanitized email object to avoid huge payloads (omit htmlBody and trim arrays/text)
    const baseUrl =
      process.env.APP_BASE_URL || `http://localhost:${config.port}`;
    const emailUrl = `${baseUrl}/#email-${email.id}`;

    const sanitizedEmail: any = {
      id: email.id,
      accountId: email.accountId,
      folder: email.folder,
      subject: email.subject,
      from: email.from,
      to: Array.isArray(email.to) ? email.to.slice(0, 5) : [],
      ...(Array.isArray(email.cc) && email.cc.length > 0
        ? { cc: email.cc.slice(0, 5) }
        : {}),
      date: email.date,
      aiCategory: email.aiCategory,
      messageId: email.messageId,
      body: (email.body || "").substring(0, 300),
    };

    const basePayload: WebhookPayload = {
      event: "InterestedLead",
      email: sanitizedEmail,
      // extra convenience link for consumers
      emailUrl,
      timestamp: new Date(),
    } as any;

    const postSafely = async (url: string, payload: any) => {
      try {
        await axios.post(url, payload, {
          headers: { "Content-Type": "application/json" },
          timeout: 5000,
        });
        return true;
      } catch (error: any) {
        if (error?.response?.status === 429) {
          console.warn(`⏳ Webhook rate limited for ${url}. Skipping.`);
          return false;
        }
        console.error(`❌ Error sending webhook to ${url}:`, error.message);
        return false;
      }
    };

    // Send to primary generic URL first
    const okPrimary = await postSafely(genericUrl, basePayload);
    if (okPrimary) {
      console.log("✅ Generic webhook triggered");
    }

    // Aggregate all interested URLs: explicit generic URL plus list
    const urlsSet = new Set<string>();
    if (config.webhooks.generic) urlsSet.add(config.webhooks.generic);
    if (Array.isArray(config.webhooks.interestedUrls)) {
      for (const u of config.webhooks.interestedUrls.filter(Boolean))
        urlsSet.add(u);
    }
    // Exclude the primary we already attempted
    urlsSet.delete(genericUrl);
    const urls = Array.from(urlsSet);

    if (urls.length === 0) {
      console.warn("⚠️  No generic/interested webhook URLs configured");
      return;
    }

    // Broadcast to all URLs with the same sanitized payload
    if (urls.length > 0) {
      const results = await Promise.all(
        urls.map((u) => postSafely(u, basePayload))
      );
      const successCount = results.filter(Boolean).length;
      console.log(
        `✅ Generic/Interested webhooks triggered (${successCount}/${urls.length})`
      );
    }
  }

  async testWebhooks(): Promise<{ slack: boolean; generic: boolean }> {
    const results = {
      slack: false,
      generic: false,
    };

    // Test Slack
    if (config.webhooks.slack) {
      try {
        await axios.post(config.webhooks.slack, {
          text: "✅ Test message from ReachInbox Onebox",
        });
        results.slack = true;
        console.log("✅ Slack webhook test successful");
      } catch (error) {
        console.error("❌ Slack webhook test failed");
      }
    }

    // Test Generic
    if (config.webhooks.generic) {
      try {
        await axios.post(config.webhooks.generic, {
          event: "test",
          message: "Test webhook from ReachInbox Onebox",
        });
        results.generic = true;
        console.log("✅ Generic webhook test successful");
      } catch (error) {
        console.error("❌ Generic webhook test failed");
      }
    }

    return results;
  }
}

export default new WebhookService();
